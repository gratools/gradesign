import assert from "node:assert/strict";
import { test } from "node:test";
import { freshProject, STORAGE_KEY } from "./project";
import { readProjects, saveProject, deleteProject, restoreProject, readTrashedProjects } from "./project-storage";

test("localStorage fallback preserves designs, orders saves, and reports quota failures", async (t) => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const values = new Map<string, string>();
  let full = false;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full) throw new DOMException("Storage is full", "QuotaExceededError");
        values.set(key, value);
      },
    },
  });
  try {
    await t.test("reads valid legacy designs and skips malformed entries", async () => {
      const project = freshProject();
      values.set(STORAGE_KEY, JSON.stringify([project, { id: "broken" }]));
      assert.deepEqual(await readProjects(), [project]);
    });

    await t.test("concurrent saves keep both snapshots without lost updates", async () => {
      values.clear();
      const first = { ...freshProject(), title: "First", updatedAt: "2026-01-01T00:00:00.000Z" };
      const second = { ...freshProject(), title: "Second", updatedAt: "2026-01-02T00:00:00.000Z" };
      const one = saveProject(first);
      const two = saveProject(second);
      first.title = "Changed after requesting save";
      await Promise.all([one, two]);
      assert.deepEqual((await readProjects()).map((project) => project.title), ["Second", "First"]);
    });

    await t.test("returns only the latest twelve projects and replaces a matching id", async () => {
      values.clear();
      const projects = Array.from({ length: 14 }, (_, index) => ({
        ...freshProject(), title: `Design ${index}`, updatedAt: new Date(2026, 0, index + 1).toISOString(),
      }));
      await Promise.all(projects.map(saveProject));
      const list = await readProjects();
      assert.equal(list.length, 12);
      assert.equal(list[0].title, "Design 13");
      assert.equal(list[11].title, "Design 2");
      await saveProject({ ...list[0], title: "Revised" });
      const revised = await readProjects();
      assert.equal(revised.length, 12);
      assert.equal(revised[0].title, "Revised");
    });

    await t.test("deletion is recoverable and a late autosave cannot resurrect it", async () => {
      values.clear();
      const project = freshProject();
      await saveProject(project);
      await deleteProject(project.id);
      assert.deepEqual(await readProjects(), []);
      assert.equal((await readTrashedProjects())[0].id, project.id);
      await assert.rejects(saveProject({ ...project, title: "Stale tab" }), /Trash/);
      assert.equal((await readTrashedProjects())[0].title, project.title);
      const restored = await restoreProject(project.id);
      assert.equal(restored[0].id, project.id);
      assert.deepEqual(restored[0].pages, project.pages);
      assert.deepEqual(await readTrashedProjects(), []);
      await saveProject({ ...restored[0], title: "Restored edit" });
      assert.equal((await readProjects())[0].title, "Restored edit");
    });
    await t.test("deletion is ordered after saves and retains other projects", async () => {
      values.clear();
      const first = freshProject(), second = freshProject();
      await Promise.all([saveProject(first), saveProject(second), deleteProject(first.id)]);
      assert.deepEqual((await readProjects()).map(p => p.id), [second.id]);
      const before = values.get(STORAGE_KEY);
      full = true;
      await assert.rejects(deleteProject(second.id), { name: "QuotaExceededError" });
      assert.equal(values.get(STORAGE_KEY), before);
      full = false;
      await assert.rejects(restoreProject("missing-id"), /not be found/);
      assert.equal((await restoreProject(first.id)).length, 2);
    });
    await t.test("quota failures reject, keep previous data, and do not poison the save queue", async () => {
      const before = values.get(STORAGE_KEY);
      full = true;
      await assert.rejects(saveProject(freshProject()), { name: "QuotaExceededError" });
      assert.equal(values.get(STORAGE_KEY), before);
      full = false;
      const project = { ...freshProject(), title: "Recovered", updatedAt: "2027-01-01T00:00:00.000Z" };
      assert.equal((await saveProject(project))[0].title, "Recovered");
    });
  } finally {
    for (const [name, descriptor] of [["localStorage", originalStorage], ["indexedDB", originalIndexedDB]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
