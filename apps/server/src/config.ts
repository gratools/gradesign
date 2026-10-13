export type Config = {
  port: number;
  webOrigin: string;
  production: boolean;
  cookieSameSite: "lax" | "strict" | "none";
  trustProxy: boolean;
  collaborationSecret: string;
};

export function readConfig(): Config {
  const production = process.env.NODE_ENV === "production";
  const webOrigin = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin;
  const cookieSameSite = process.env.COOKIE_SAME_SITE ?? "lax";
  if (!["lax", "strict", "none"].includes(cookieSameSite)) throw new Error("Invalid COOKIE_SAME_SITE");
  if (production && !webOrigin.startsWith("https://")) throw new Error("Production WEB_ORIGIN must use HTTPS");
  if (!production && cookieSameSite === "none") throw new Error("Cross-site cookies require a production HTTPS deployment");
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  return {
    port,
    webOrigin,
    production,
    cookieSameSite: cookieSameSite as Config["cookieSameSite"],
    trustProxy: process.env.TRUST_PROXY === "1",
    collaborationSecret: process.env.COLLABORATION_SECRET ?? "",
  };
}
