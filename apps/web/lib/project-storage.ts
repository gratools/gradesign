import { isProject, STORAGE_KEY, type Project } from "./project";

const DATABASE_NAME = "gradesign-projects";
const PROJECT_STORE = "projects";
const META_STORE = "meta";
const MIGRATION_KEY = "migrated-forma-projects-v1";
const RECENT_LIMIT = 12;
let databasePromise: Promise<IDBDatabase | null> | undefined;
let operationQueue: Promise<void> = Promise.resolve();
const completedMigrations = new WeakSet<IDBDatabase>();
type StoredProject = Project & { deletedAt?: string };

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation);
  // A failed save must reach its caller without blocking subsequent saves.
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function recentProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) return [];
  const projects = new Map<string, Project>();
  for (const project of value) {
    if (isProject(project) && !(project as StoredProject).deletedAt) projects.set(project.id, project);
  }
  return [...projects.values()]
    .sort((a, b) => timestamp(b) - timestamp(a) || a.id.localeCompare(b.id))
    .slice(0, RECENT_LIMIT);
}

function timestamp(project: Project) {
  return Date.parse(project.updatedAt) || 0;
}

function readLegacy(): StoredProject[] {
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isProject) : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (!globalThis.indexedDB) return resolve(null);
      request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") reject(error);
      else resolve(null);
      return;
    }
    let unavailable = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE))
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(META_STORE))
        database.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      const database = request.result;
      if (unavailable) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (request.error?.name === "QuotaExceededError") reject(request.error);
      else resolve(null);
    };
    request.onblocked = () => {
      unavailable = true;
      databasePromise = undefined;
      resolve(null);
    };
  });
  return databasePromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("The design could not be saved on this device."));
    transaction.onerror = () => {
      // The default IndexedDB error action aborts the transaction; onabort
      // reports the actual failure only after all writes have been rolled back.
    };
  });
}

async function migrateLegacy(database: IDBDatabase): Promise<void> {
  if (completedMigrations.has(database)) return;
  const check = database.transaction(META_STORE, "readonly");
  const checked = transactionDone(check);
  const existingMarker = check.objectStore(META_STORE).get(MIGRATION_KEY);
  await checked;
  if (existingMarker.result) {
    completedMigrations.add(database);
    return;
  }
  let legacy: Project[];
  try {
    legacy = readLegacy();
  } catch {
    // Some browsers allow IndexedDB while denying access to localStorage.
    // Do not mark migration complete if legacy data could not be inspected.
    return;
  }
  const transaction = database.transaction([PROJECT_STORE, META_STORE], "readwrite");
  const done = transactionDone(transaction);
  const metadata = transaction.objectStore(META_STORE);
  const marker = metadata.get(MIGRATION_KEY);
  marker.onsuccess = () => {
    if (marker.result) return;
    const projects = transaction.objectStore(PROJECT_STORE);
    for (const project of legacy) {
      const existing = projects.get(project.id);
      existing.onsuccess = () => {
        if (!isProject(existing.result) || timestamp(existing.result) < timestamp(project))
          projects.put(project);
      };
    }
    // Migration and its marker commit together. Keep the original storage as
    // a backup; the durable marker prevents importing it again on every load.
    metadata.put({ key: MIGRATION_KEY, completedAt: new Date().toISOString() });
  };
  await done;
  completedMigrations.add(database);
}

async function readDatabase(database: IDBDatabase): Promise<Project[]> {
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(PROJECT_STORE).getAll();
  await done;
  return recentProjects(request.result);
}

/** Read the twelve most recently updated designs, migrating existing local saves. */
export function readProjects(): Promise<Project[]> {
  return serial(async () => {
    const database = await openDatabase();
    if (!database) return recentProjects(readLegacy());
    await migrateLegacy(database);
    return readDatabase(database);
  });
}

/** Save a snapshot, including portable font data, and return the recent designs. */
export function saveProject(project: Project): Promise<Project[]> {
  if (!isProject(project)) return Promise.reject(new Error("This design is not valid and could not be saved."));
  // Capture the requested state immediately, before earlier saves finish.
  let snapshot: Project;
  try {
    snapshot = structuredClone(project);
  } catch {
    return Promise.reject(new Error("This design contains unsupported data and could not be saved."));
  }
  return serial(async () => {
    const database = await openDatabase();
    if (!database) {
      const existing = readLegacy();
      if (existing.some(item => item.id === snapshot.id && item.deletedAt)) throw new Error("This project is in Trash. Restore it before saving.");
      const projects = [...existing.filter(item => item.id !== snapshot.id), snapshot];
      // In particular, do not swallow localStorage QuotaExceededError.
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      return recentProjects(projects);
    }
    await migrateLegacy(database);
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(PROJECT_STORE);
    const existing = store.get(snapshot.id);
    let deleted = false;
    existing.onsuccess = () => {
      if ((existing.result as StoredProject | undefined)?.deletedAt) { deleted = true; return; }
      store.put(snapshot);
    };
    await done;
    if (deleted) throw new Error("This project is in Trash. Restore it before saving.");
    return readDatabase(database);
  });
}

/** Soft deletion preserves a recoverable copy and prevents stale autosaves from resurrecting it. */
export function deleteProject(id: string): Promise<Project[]> {
  return changeDeletion(id, true);
}
export function restoreProject(id: string): Promise<Project[]> {
  return changeDeletion(id, false);
}
function changeDeletion(id: string, deleted: boolean): Promise<Project[]> {
  return serial(async () => {
    const transform = (project: StoredProject): StoredProject => {
      const copy = { ...project };
      if (deleted) copy.deletedAt = new Date().toISOString();
      else { delete copy.deletedAt; copy.updatedAt = new Date().toISOString(); }
      return copy;
    };
    const database = await openDatabase();
    if (!database) {
      const projects = readLegacy();
      if (!projects.some(p => p.id === id)) throw new Error("This project could not be found.");
      const updated = projects.map(p => p.id === id ? transform(p) : p);
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return recentProjects(updated);
    }
    await migrateLegacy(database);
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(PROJECT_STORE);
    const request = store.get(id);
    let found = false;
    request.onsuccess = () => {
      if (!isProject(request.result)) return;
      found = true;
      store.put(transform(request.result));
    };
    await done;
    if (!found) throw new Error("This project could not be found.");
    return readDatabase(database);
  });
}
export function readTrashedProjects(): Promise<Project[]> {
  return serial(async () => {
    const database = await openDatabase();
    let projects: StoredProject[];
    if (!database) projects = readLegacy();
    else {
      await migrateLegacy(database);
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const done = transactionDone(transaction);
      const request = transaction.objectStore(PROJECT_STORE).getAll();
      await done;
      projects = request.result.filter(isProject);
    }
    return projects.filter(p => p.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  });
}
