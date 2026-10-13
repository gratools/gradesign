import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt-v1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// A fixed, valid hash is used for missing accounts to avoid the fast-failure path.
export const DUMMY_PASSWORD_HASH = `scrypt-v1$${"00".repeat(16)}$${"00".repeat(64)}`;

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, saltHex, hashHex] = encoded.split("$");
  if (version !== "scrypt-v1" || !saltHex || !hashHex ||
    !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const actual = await derive(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(Buffer.from(hashHex, "hex"), actual);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function collaborationToken(userId: string, designId: string, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("COLLABORATION_SECRET must contain at least 32 characters");
  const exp = Math.floor(now / 1000) + 5 * 60;
  const payload = Buffer.from(JSON.stringify({ sub: userId, designId, permission: "edit", exp })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, permission: "edit" as const, expiresAt: new Date(exp * 1000).toISOString() };
}
