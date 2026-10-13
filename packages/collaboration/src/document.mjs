import * as Y from "yjs";

/** Every canvas object must carry a stable id, including across serialization. */
export const LOCAL_ORIGIN = Symbol("forma-local-editor");
const PAGE_ORDER = "__pageOrder";
const OBJECT_ORDER = "__objectOrder";

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchMap(target, previous, next) {
  for (const key of Object.keys(previous)) {
    if (!(key in next)) target.delete(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && !equal(previous[key], value)) {
      target.set(key, structuredClone(value));
    }
  }
}

function pageMetadata(page, index) {
  const { canvas, thumbnail, ...metadata } = page;
  return { ...metadata, [PAGE_ORDER]: index };
}

function objectRecords(page) {
  const objects = page?.canvas?.objects ?? [];
  if (!Array.isArray(objects))
    throw new TypeError("canvas.objects must be an array");
  const records = new Map();
  objects.forEach((object, index) => {
    if (!object || typeof object.id !== "string" || !object.id) {
      throw new TypeError(
        "Every collaborative canvas object needs a stable string id",
      );
    }
    if (records.has(object.id))
      throw new TypeError("Canvas object ids must be unique within a page");
    records.set(object.id, { ...object, [OBJECT_ORDER]: index });
  });
  return records;
}

/**
 * Diff against the last rendered baseline, NOT against the shared document.
 * This prevents a stale local snapshot overwriting unrelated remote changes.
 * Individual Fabric properties are separate CRDT entries. Arrays within one
 * Fabric property (paths, gradients, grouped objects) remain atomic values.
 */
export function applyPageChanges(
  doc,
  previousPages,
  nextPages,
  origin = LOCAL_ORIGIN,
) {
  const pages = doc.getMap("pages");
  const previous = new Map(
    previousPages.map((page, index) => [page.id, { page, index }]),
  );
  const nextIds = new Set(nextPages.map((page) => page.id));
  // Validate before opening the transaction so invalid snapshots cannot partially write.
  const nextObjects = nextPages.map(objectRecords);
  doc.transact(() => {
    for (const id of previous.keys()) {
      if (!nextIds.has(id)) pages.delete(id);
    }
    nextPages.forEach((page, index) => {
      const old = previous.get(page.id);
      let sharedPage = pages.get(page.id);
      // A remote page deletion wins over edits to an older local page snapshot.
      if (!sharedPage && old) return;
      if (!sharedPage) {
        sharedPage = new Y.Map();
        sharedPage.set("metadata", new Y.Map());
        sharedPage.set("canvas", new Y.Map());
        sharedPage.set("objects", new Y.Map());
        pages.set(page.id, sharedPage);
      }
      patchMap(
        sharedPage.get("metadata"),
        old ? pageMetadata(old.page, old.index) : {},
        pageMetadata(page, index),
      );
      const { objects: ignoredOld, ...oldCanvas } = old?.page.canvas ?? {};
      const { objects: ignoredNext, ...nextCanvas } = page.canvas;
      patchMap(sharedPage.get("canvas"), oldCanvas, nextCanvas);
      const objects = sharedPage.get("objects");
      const before = old ? objectRecords(old.page) : new Map();
      const after = nextObjects[index];
      for (const id of before.keys()) {
        if (!after.has(id)) objects.delete(id);
      }
      for (const [id, object] of after) {
        let sharedObject = objects.get(id);
        // Concurrent delete + edit resolves to deletion; an intentional re-add
        // uses a new id. Do not resurrect objects from a stale snapshot.
        if (!sharedObject && before.has(id)) continue;
        if (!sharedObject) {
          sharedObject = new Y.Map();
          objects.set(id, sharedObject);
        }
        patchMap(sharedObject, before.get(id) ?? {}, object);
      }
    });
  }, origin);
}

export function readPages(doc) {
  return Array.from(doc.getMap("pages").entries())
    .map(([id, sharedPage]) => {
      const metadata = sharedPage.get("metadata").toJSON();
      const objects = Array.from(sharedPage.get("objects").values())
        .map((object) => object.toJSON())
        .sort(
          (a, b) =>
            a[OBJECT_ORDER] - b[OBJECT_ORDER] || a.id.localeCompare(b.id),
        )
        .map(({ [OBJECT_ORDER]: order, ...object }) => object);
      return {
        ...metadata,
        id,
        canvas: { ...sharedPage.get("canvas").toJSON(), objects },
      };
    })
    .sort((a, b) => a[PAGE_ORDER] - b[PAGE_ORDER] || a.id.localeCompare(b.id))
    .map(({ [PAGE_ORDER]: order, ...page }) => page);
}

/** Local transactions never call this callback, avoiding a load/save echo. */
export function observeRemotePages(doc, onPages, localOrigin = LOCAL_ORIGIN) {
  const pages = doc.getMap("pages");
  const observer = (_events, transaction) => {
    if (transaction.origin !== localOrigin) onPages(readPages(doc));
  };
  pages.observeDeep(observer);
  return () => pages.unobserveDeep(observer);
}

/** Font faces are project metadata, outside page JSON. Each face is one atomic value. */
export function applyFontChanges(doc, previousFonts, nextFonts, origin = LOCAL_ORIGIN) {
  const fonts = doc.getMap("fonts");
  const previous = new Map(previousFonts.map((font) => [font.id, font]));
  const nextIds = new Set(nextFonts.map((font) => font.id));
  if (nextFonts.length > 20 || nextIds.size !== nextFonts.length || nextFonts.some((font) => !font || typeof font.id !== "string" || !font.id))
    throw new TypeError("Custom font faces need unique identifiers, with up to 20 faces per design");
  doc.transact(() => {
    for (const id of previous.keys()) if (!nextIds.has(id)) fonts.delete(id);
    for (const font of nextFonts) {
      if (!fonts.has(font.id) && previous.has(font.id)) continue;
      if (!equal(previous.get(font.id), font)) fonts.set(font.id, structuredClone(font));
    }
  }, origin);
}

export function readFonts(doc) {
  return Array.from(doc.getMap("fonts").values()).map((font) => structuredClone(font))
    .sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
}

/** Consumers validate remote font data before passing it to a browser font parser. */
export function observeRemoteFonts(doc, onFonts, localOrigin = LOCAL_ORIGIN) {
  const fonts = doc.getMap("fonts");
  const observer = (_event, transaction) => {
    if (transaction.origin !== localOrigin) onFonts(readFonts(doc));
  };
  fonts.observe(observer);
  return () => fonts.unobserve(observer);
}
