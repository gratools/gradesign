import assert from "node:assert/strict";
import test from "node:test";
import { belongsToWorkspace, can, sameOrigin, usableShare, type Role } from "./permissions.js";

test("members can read and comment; viewers cannot edit, share, or manage", () => {
  for (const role of ["ADMIN", "EDITOR", "VIEWER"] satisfies Role[]) {
    assert.equal(can(role, "read"), true);
    assert.equal(can(role, "comment"), true);
  }
  assert.equal(can("VIEWER", "edit"), false);
  assert.equal(can("VIEWER", "share"), false);
  assert.equal(can("VIEWER", "manage"), false);
  assert.equal(can("EDITOR", "edit"), true);
  assert.equal(can("EDITOR", "manage"), false);
  assert.equal(can("ADMIN", "manage"), true);
  assert.equal(can(null, "read"), false);
  assert.equal(can(undefined, "edit"), false);
});

test("resource references cannot cross workspaces", () => {
  assert.equal(belongsToWorkspace("workspace-a", "workspace-a"), true);
  assert.equal(belongsToWorkspace("workspace-b", "workspace-a"), false);
});

test("share permissions, revocation, and expiry are enforced", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const future = new Date("2026-01-01T12:05:00Z");
  const share = { permission: "VIEW" as const, expiresAt: future, revokedAt: null };
  assert.equal(usableShare(share, "read", now), true);
  assert.equal(usableShare(share, "edit", now), false);
  assert.equal(usableShare({ ...share, permission: "EDIT" }, "edit", now), true);
  assert.equal(usableShare({ ...share, expiresAt: now }, "read", now), false);
  assert.equal(usableShare({ ...share, revokedAt: now }, "read", now), false);
  assert.equal(usableShare(null, "read", now), false);
});

test("cookie mutations require an exact Origin, not a prefix or missing header", () => {
  assert.equal(sameOrigin("https://app.example.com", "https://app.example.com"), true);
  assert.equal(sameOrigin("https://app.example.com.evil.test", "https://app.example.com"), false);
  assert.equal(sameOrigin(undefined, "https://app.example.com"), false);
  assert.equal(sameOrigin("null", "https://app.example.com"), false);
});
