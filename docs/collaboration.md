# Real-time collaboration

gradesign. includes a Yjs document adapter, an opt-in React hook, and a separate Node WebSocket server. Local editing works without the service. Canvas JSON is split into per-page maps and per-object maps; each Fabric property is a separate CRDT entry. Unrelated object edits, and different properties on the same object, therefore merge independently. Portable custom fonts live in a separate project-level map. Existing `@forma/*` package names remain stable for compatibility.

## 1. Start a local room

Install the monorepo dependencies, then run these commands in separate terminals at the repository root:

```sh
pnpm --filter @forma/web dev
pnpm --filter @forma/collaboration dev
```

Set this in `apps/web/.env.local`, then restart Next.js:

```dotenv
NEXT_PUBLIC_COLLAB_URL=ws://127.0.0.1:1234
```

The demo service binds to `127.0.0.1` and accepts browser origins `http://localhost:3000` and `http://127.0.0.1:3000`. A room ID must contain only letters, digits, underscores, or hyphens. Open two editor sessions with the same room ID, enable collaboration, and edit different objects. With no persistent storage configured, room contents live in process memory and can disappear when everyone leaves or the server restarts. Your browser's local design save is independent of this room.

## 2. Bind the editor

`apps/web/lib/use-collaboration.ts` exports:

```tsx
const collaboration = useCollaboration({
  enabled,
  roomId: design.id,
  user: { name: user.name, color: "#8b5cf6" },
  initialPages: design.pages,
  initialFonts: design.fonts ?? [],
  onRemoteFonts: (fonts) => {
    fontsRef.current = fonts; // Update synchronously before onRemotePages runs.
    setFonts(fonts);          // Also persist this metadata in the local project.
  },
  onRemotePages: (pages) => {
    setPages(pages);
    // Await ensureFontsForCanvas(activePage.canvas, fontsRef.current), then
    // load the active page's JSON into Fabric with change events suppressed.
    // Keep selection/page choice local; do not publish the remote load again.
  },
});

// After a local canvas/page mutation:
collaboration.updatePages(nextPages);

// Pointer coordinates must be in canvas space, before zoom/viewport transforms:
collaboration.setCursor({ pageId: activePage.id, x, y });
// On pointer leave:
collaboration.setCursor(null);
```

Pages have `{ id, name, canvas, thumbnail? }`. `canvas` is the Fabric JSON object and `canvas.objects` contains objects with unique, stable `id` strings. Page `width` and `height`, object styles and per-character formatting all survive synchronization and reopening. Register custom properties (`id`, `name`) in Fabric before serializing. Thumbnails stay local and are not sent. `peers` supplies presence and cursor data; the hook does not render cursor overlays itself. Display names and presence colors are presentation hints, not authenticated identities.

The hook validates remote font collections before delivering `onRemoteFonts`, and dispatches the font metadata before any corresponding page snapshot. Joining an existing room always replaces the local font list, including when the remote list is empty. Invalid font data disconnects the session. `updateFonts(nextFonts)` is available for integrations that support changing fonts during a session; the current editor requires font uploads before joining. Font faces are embedded once per project, with up to 20 faces, 3 MiB per face and 12 MiB of combined decoded font bytes. See [fonts.md](fonts.md) for details.

Wait for `status === "connected"` before beginning shared edits: joining an existing room loads its current state, and edits made while the first connection is loading are not queued. Once the initial sync completes, Yjs retains edits across temporary disconnections. Remote changes replace the visible page snapshots; they do not create local undo entries. The basic Fabric history is single-user history; collaboration-aware undo should use `Y.UndoManager` with `trackedOrigins: new Set([LOCAL_ORIGIN])` before enabling undo in a shared production session.

The first participant seeds an empty room's pages and fonts in one transaction only after the initial server sync. For production, seed the room on the server from a canonical database design before admitting editors, so simultaneous first joins cannot race to initialize nested maps. Existing room state takes precedence over a joining client's local pages and fonts.

## 3. Authentication for a hosted service

The Express API exposes `POST /api/designs/:id/collaboration-token`. It checks the authenticated session and design edit membership, then returns `{ token, permission: "edit", expiresAt }`. Viewers cannot obtain an editor token. Supply `getToken` to the hook:

```tsx
getToken: async () => {
  const response = await fetch(`${apiUrl}/api/designs/${design.id}/collaboration-token`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Collaboration authorization failed");
  const { token } = await response.json();
  return token;
}
```

Set the same strong `COLLABORATION_SECRET` (at least 32 characters) in the API and WebSocket processes. Also set:

```dotenv
NODE_ENV=production
COLLAB_HOST=127.0.0.1
COLLAB_PORT=1234
COLLAB_ALLOWED_ORIGINS=https://your-editor.example
COLLABORATION_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_COLLAB_URL=wss://your-collaboration.example
```

The server verifies HMAC-SHA256 signatures, room ID, editor permission and expiration before accepting the WebSocket upgrade. Tokens contain a base64url JSON payload `{ sub, designId, permission: "edit", exp }` followed by `.` and the base64url HMAC signature. The API issues five-minute tokens. Sockets close at expiry, and the hook requests a fresh token before reconnecting. Access revoked after issuance takes effect no later than token expiry. Query tokens must be redacted from reverse-proxy access logs. Use TLS, an explicit origin allowlist and a reverse proxy with connection/rate limits. The hook disables cross-tab BroadcastChannel syncing, which would otherwise bypass server authorization.

The stock Yjs sync protocol permits writes after connection, so this starter rejects viewers rather than attempting to enforce read-only access in client code. Public read-only links should render database snapshots. Implement a server-side read-only protocol before admitting viewers to live rooms.

## 4. Persistence and scaling

The server deliberately keeps Yjs binary state separate from REST JSON snapshots. For a local durable demo, `@y/websocket-server` supports `YPERSISTENCE=./data/yjs` using its optional LevelDB dependency. For production, persist `Y.encodeStateAsUpdate(doc)` and hydrate via `Y.applyUpdate` using authenticated room IDs; the Prisma design model can store binary Yjs state alongside JSON previews. Debounce writes, flush at shutdown, bound stored update growth, and keep periodic backups. Export the canonical collaborative state to the JSON snapshot used by the REST API; otherwise a later REST save can replace a newer shared design.

One WebSocket process is sufficient for development. Multiple replicas need room affinity or a shared pub/sub and persistence strategy. Add document size limits, rate limiting, membership revocation handling, protected storage URL policies and monitoring before public deployment. The current service caps each WebSocket message at 48 MiB to accommodate a portable 40 MB project and protocol overhead; that is not a complete per-room memory or history quota. REST snapshots accept up to 40,000,000 UTF-8 bytes, with a 41 MiB request-envelope cap on document routes. Reverse proxies must permit the corresponding sizes.

## 5. Merge behavior and checks

`applyPageChanges(doc, previousPages, nextPages)` computes changes against the editor's last rendered baseline. It never writes a whole document as a single JSON field. Delete-versus-edit resolves to deletion, and stale object/page snapshots cannot resurrect deleted entries. Simultaneous changes to the same property resolve using Yjs conflict ordering. Nested Fabric arrays such as paths, group children and gradient stops are atomic property values. Text and each textbox's per-character `styles` are also atomic properties: concurrent text edits or formatting changes within the same textbox do not merge character-by-character. Layer and page ordering use numeric positions with an ID tie-break; reorder conflicts converge, but do not provide a specialized collaborative list UX.

`applyFontChanges(doc, previousFonts, nextFonts)` stores each portable face under its stable ID in a project-level map. Independent face additions merge and remote deletion wins over a stale edit. `readFonts(doc)` must be included alongside `readPages(doc)` when creating a durable project snapshot; omitting fonts would lose the custom typography when reopening that snapshot.

`observeRemotePages` and `observeRemoteFonts` exclude `LOCAL_ORIGIN` transactions to prevent load/save echoes. The 12 tests exchange real Yjs binary updates between independent documents, covering concurrent object edits, same-object property edits, delete/edit conflicts, stale snapshots, page changes, origin filtering, presentation dimensions, inline text styles and portable custom fonts across reopening. Token tests cover signatures, room boundaries, roles and expiration:

```sh
pnpm --filter @forma/collaboration test
```

## Official references

- [Yjs WebSocket provider API](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)
- [Yjs awareness and presence](https://docs.yjs.dev/getting-started/adding-awareness)
- [Yjs shared map API](https://docs.yjs.dev/api/shared-types/y.map)
- [Yjs document updates and persistence primitives](https://docs.yjs.dev/api/document-updates)
- [Server v0.1.1 package metadata](https://github.com/yjs/y-websocket-server/blob/v0.1.1/package.json)

`@y/websocket-server` is pinned to `0.1.1` because this project uses stable Yjs 13; newer server releases target Yjs 14. Upgrade client, server and protocol dependencies together.
