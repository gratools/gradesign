import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { collaborationToken, hashPassword, hashToken, randomToken, verifyPassword } from "./security.js";
import { createDesignSchema, signupSchema, updateDesignSchema } from "./validation.js";

test("password hashes use independent salts and reject an incorrect password", async () => {
  const password = "a-long-unique-password";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});

test("tokens contain entropy and only their SHA-256 hash is stored", () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(randomToken(), token);
  assert.equal(hashToken(token).length, 64);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});

test("collaboration token binds subject, room, permission, and five-minute expiry", () => {
  const secret = "test-key-with-at-least-thirty-two-characters";
  const result = collaborationToken("user-a", "design-a", secret, 1000000);
  const [payload, signature] = result.token.split(".");
  assert.ok(payload);
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString()), { sub: "user-a", designId: "design-a", permission: "edit", exp: 1300 });
  assert.equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"));
  assert.throws(() => collaborationToken("user-a", "design-a", "short"));
});

test("validation prevents privilege injection and requires a revision on writes", () => {
  assert.equal(signupSchema.safeParse({ name: "Alex", email: "alex@example.com", password: "long-password-123", tier: "PRO" }).success, false);
  assert.equal(updateDesignSchema.safeParse({ document: {} }).success, false);
  assert.equal(updateDesignSchema.safeParse({ revision: -1, title: "Design" }).success, false);
  assert.equal(updateDesignSchema.safeParse({ revision: 0 }).success, false);
  assert.equal(createDesignSchema.safeParse({ workspaceId: "workspace-a", title: "Design", document: [], createdById: "user-b" }).success, false);
});
