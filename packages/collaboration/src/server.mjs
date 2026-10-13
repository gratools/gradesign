import http from "node:http";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "@y/websocket-server/utils";
import { verifyCollaborationToken } from "./auth.mjs";

const secret = process.env.COLLABORATION_SECRET;
const development = !secret && process.env.NODE_ENV !== "production";
if (!development && (!secret || secret.length < 32)) {
  throw new Error(
    "Set COLLABORATION_SECRET to at least 32 characters before starting the hosted server.",
  );
}
if (!development && !process.env.COLLAB_ALLOWED_ORIGINS) {
  throw new Error(
    "Hosted collaboration requires an explicit COLLAB_ALLOWED_ORIGINS list.",
  );
}
// An unauthenticated server is intentionally never bound to a public interface.
const host = development
  ? "127.0.0.1"
  : (process.env.COLLAB_HOST ?? "127.0.0.1");
const port = Number(process.env.COLLAB_PORT ?? 1234);
const origins = new Set(
  (
    process.env.COLLAB_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((value) => value.trim()),
);
const wss = new WebSocketServer({
  noServer: true,
  // A portable 40 MB design may include up to 12 MiB of base64-encoded font bytes.
  // Leave protocol overhead room; this frame cap is not a per-room history quota.
  maxPayload: 48 * 1024 * 1024,
});
const server = http.createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 200 : 404, {
    "Content-Type": "application/json",
  });
  response.end(
    JSON.stringify(
      request.url === "/health"
        ? { status: "ok", mode: development ? "local-demo" : "authenticated" }
        : { error: "Not found" },
    ),
  );
});

server.on("upgrade", (request, socket, head) => {
  try {
    if (!origins.has(request.headers.origin)) throw new Error("Unauthorized");
    const url = new URL(request.url, "http://localhost");
    const room = decodeURIComponent(url.pathname.slice(1));
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(room)) throw new Error("Unauthorized");
    const claims = development
      ? null
      : verifyCollaborationToken(url.searchParams.get("token"), room, secret);
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Neither request URLs nor query tokens are logged. Proxy access logs
      // must also redact query strings when deploying this endpoint.
      setupWSConnection(ws, request, { docName: room, gc: true });
      if (claims) {
        const expires = setTimeout(
          () => ws.close(4001, "Refresh collaboration authorization"),
          Math.max(1, claims.exp * 1000 - Date.now()),
        );
        expires.unref();
        ws.once("close", () => clearTimeout(expires));
      }
    });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

server.listen(port, host, () => {
  console.log(
    `Forma collaboration listening on ${host}:${port} (${development ? "local development only" : "authenticated"})`,
  );
});

function shutdown() {
  for (const client of wss.clients) client.close(1001, "Server closing");
  server.close();
  wss.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
