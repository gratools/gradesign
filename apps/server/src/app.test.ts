import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";

const origin = "http://localhost:3000";
const cookie = `forma_session=${"a".repeat(43)}`;
const user = { id: "user-a", name: "Alex", email: "alex@example.com", tier: "FREE", createdAt: new Date(), updatedAt: new Date() };
const validSession = () => ({ user, expiresAt: new Date(Date.now() + 60_000) });
const design = { id: "design-a", workspaceId: "workspace-a", title: "Private design", document: { pages: [{ id: "page-a" }] }, revision: 0 };

async function request(db: object, route: string, options: RequestInit = {}) {
  const app = createApp(db as PrismaClient, { port: 4000, webOrigin: origin, production: false, cookieSameSite: "lax", trustProxy: false, collaborationSecret: "" });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${route}`, options);
    const body = await response.json();
    return { status: response.status, body };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const write = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body) });

test("HTTP: unsigned users cannot enumerate designs", async () => {
  const response = await request({}, "/api/designs");
  assert.equal(response.status, 401);
  const session = await request({}, "/api/session");
  assert.deepEqual(session.body, { user: null, workspaces: [] });
});

test("HTTP: expired sessions cannot authorize design access", async () => {
  const response = await request({ session: { findUnique: async () => ({ user, expiresAt: new Date(0) }) } }, "/api/designs", { headers: { Cookie: cookie } });
  assert.equal(response.status, 401);
});

test("HTTP: mutations require an exact Origin before database access", async () => {
  const response = await request({}, "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 403);
});

test("HTTP: malformed JSON and oversized bodies are rejected", async () => {
  const malformed = await request({}, "/api/auth/signup", { ...write({}), body: "{" });
  assert.equal(malformed.status, 400);
  const oversized = await request({}, "/api/auth/signup", write({ data: "x".repeat(2_100_000) }));
  assert.equal(oversized.status, 413);
});

test("HTTP: viewer cannot write a design or obtain an editing token", async () => {
  const db = {
    session: { findUnique: async () => validSession() },
    design: { findFirst: async () => design },
    membership: { findUnique: async () => ({ role: "VIEWER" }) },
  };
  const update = await request(db, "/api/designs/design-a", { ...write({ revision: 0, title: "Changed" }), method: "PATCH" });
  assert.equal(update.status, 403);
  const token = await request(db, "/api/designs/design-a/collaboration-token", write({}));
  assert.equal(token.status, 403);
});

test("HTTP: private design lookup is constrained to the authenticated member", async () => {
  const db = {
    session: { findUnique: async () => validSession() },
    design: { findFirst: async (query: unknown) => {
      assert.deepEqual(query, { where: { id: "design-a", workspace: { memberships: { some: { userId: "user-a" } } } } });
      return null;
    } },
  };
  const response = await request(db, "/api/designs/design-a", { headers: { Cookie: cookie } });
  assert.equal(response.status, 404);
});

test("HTTP: a foreign workspace folder cannot be assigned on create", async () => {
  const db = {
    session: { findUnique: async () => validSession() },
    membership: { findUnique: async () => ({ role: "EDITOR" }) },
    folder: { findUnique: async () => ({ workspaceId: "workspace-b" }) },
  };
  const response = await request(db, "/api/designs", write({ workspaceId: "workspace-a", folderId: "folder-b", title: "Design", document: {} }));
  assert.equal(response.status, 400);
});

test("HTTP: revision conflicts preserve the existing design", async () => {
  const db = {
    session: { findUnique: async () => validSession() },
    design: { findFirst: async () => design },
    membership: { findUnique: async () => ({ role: "EDITOR" }) },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({ design: { updateMany: async (query: { where: { revision: number } }) => {
      assert.equal(query.where.revision, 0);
      return { count: 0 };
    } } }),
  };
  const response = await request(db, "/api/designs/design-a", { ...write({ revision: 0, title: "Changed" }), method: "PATCH" });
  assert.equal(response.status, 409);
});

test("HTTP: view bearer links cannot edit a shared design", async () => {
  const db = { shareLink: { findUnique: async () => ({ design, permission: "VIEW", expiresAt: new Date(Date.now() + 60_000), revokedAt: null }) } };
  const response = await request(db, `/api/shares/${"b".repeat(43)}`, { ...write({ revision: 0, title: "Changed" }), method: "PATCH" });
  assert.equal(response.status, 404);
});

test("HTTP: document routes accept portable designs above 2 MiB and preserve their payload", async () => {
  const document = { fonts: [], pages: [{ id: "page-a", canvas: { width: 1080, height: 1920, objects: [] } }], data: "x".repeat(2_100_000) };
  const db = {
    session: { findUnique: async () => validSession() },
    membership: { findUnique: async () => ({ role: "EDITOR" }) },
    design: { create: async ({ data }: { data: { document: unknown } }) => {
      assert.deepEqual(data.document, document);
      return { id: "design-a", document: data.document };
    } },
  };
  const response = await request(db, "/api/designs", write({ workspaceId: "workspace-a", title: "Portable design", document }));
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.design.document, document);
});
