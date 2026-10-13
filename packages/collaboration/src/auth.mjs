import { createHmac, timingSafeEqual } from "node:crypto";

/** The HTTP API signs this token only after checking edit membership. */
export function verifyCollaborationToken(
  token,
  room,
  secret,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !secret ||
    secret.length < 32 ||
    typeof token !== "string" ||
    token.length > 4096
  ) {
    throw new Error("Unauthorized");
  }
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    throw new Error("Unauthorized");
  }
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new Error("Unauthorized");
  }
  const claims = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  if (
    claims.designId !== room ||
    claims.permission !== "edit" ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now ||
    claims.exp > now + 600
  ) {
    throw new Error("Unauthorized");
  }
  return claims;
}
