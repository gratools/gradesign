# Backend and database

The gradesign. Node API is a separate Express 5 service. The web application can run locally or be exported as a static site. Hosting the static site does **not** deploy PostgreSQL, the API, asset storage, or the collaboration service. Package names and database/session identifiers retain their existing `forma` names for compatibility.

## Enable accounts and shared storage

The static site saves designs in the browser by default. To enable accounts, workspace storage and view-only links, run the included Node API with PostgreSQL and set `NEXT_PUBLIC_API_URL` before building the frontend. Setup instructions belong in these source files rather than the editor interface.

1. Start PostgreSQL and the API using the local instructions below, or deploy them to your own server for shared online access.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`. Set `NEXT_PUBLIC_API_URL` to the API base URL (`http://localhost:4000` for local development, or your deployed HTTPS API address).
3. Set the API's `WEB_ORIGIN` to the exact frontend origin. Configure the database, session secrets and production cookie settings as described in this guide.
4. Restart the frontend during development, or run `pnpm build` and publish the rebuilt static output. The API URL is embedded at build time; changing an environment file after deployment does not update it.
5. Sign in through the editor and use **Save to workspace** to upload a design. Browser-local designs are not automatically migrated into cloud storage.

Static hosting, including GitHub Pages, serves the frontend only. The API and database must remain running separately. Live editing additionally requires the service documented in [collaboration.md](collaboration.md).

## Start locally

From the repository root:

```sh
pnpm install
docker compose up -d postgres
cp apps/server/.env.example apps/server/.env
pnpm --filter @forma/server db:generate
pnpm --filter @forma/server exec prisma migrate deploy
pnpm dev:server
```

The API defaults to `http://localhost:4000`. PostgreSQL binds only to the loopback address. The password in `docker-compose.yml` is a local development default; set `POSTGRES_PASSWORD` and update `DATABASE_URL` for any other environment. Node 22 or newer is recommended.

Run the web app separately. Its API base URL must point to this service, and `WEB_ORIGIN` must exactly match the browser origin (scheme, hostname, and port). Use `localhost` consistently instead of mixing it with `127.0.0.1`.

```sh
pnpm --filter @forma/server build
pnpm --filter @forma/server test
```

The 21 tests cover role permissions, resource boundaries, share expiry/revocation, Origin matching, credential hashing, token signing, request validation, and portable custom-font documents. HTTP tests exercise the actual Express middleware and routes with database stubs, including unauthorized access, route-specific payload limits, foreign-workspace folders, read-only shares, and revision conflicts. These tests do not constitute a live PostgreSQL integration test. A running database is required to exercise migrations and account/design API workflows. The initial migration is checked in; use `pnpm --filter @forma/server db:migrate --name <change>` when changing the schema during development.

## Directory structure

```text
apps/server/
  prisma/schema.prisma       PostgreSQL models and relations
  prisma/migrations/         Initial PostgreSQL migration
  src/app.ts                 Cookie auth and resource API routes
  src/config.ts              Environment configuration
  src/index.ts               Service startup and shutdown
  src/permissions.ts         Workspace and share authorization
  src/security.ts            scrypt, tokens, collaboration signatures
  src/validation.ts          Zod input schemas
  src/document-fonts.ts      Embedded custom-font metadata and byte validation
  src/*.test.ts              Authorization and security checks
  .env.example
docker-compose.yml          Local PostgreSQL 16
```

## Data model

| Model | Purpose |
| --- | --- |
| `User`, `Credential` | Normalized unique email, display name, `FREE`/`PRO` tier, separately stored salted password hash |
| `OAuthAccount` | Provider/account linking scaffold for a future OAuth callback integration |
| `Session` | Hashed opaque token, user, fixed seven-day expiry |
| `Workspace`, `Membership` | Shared workspace; one `ADMIN`, `EDITOR`, or `VIEWER` membership per user/workspace |
| `Folder` | Workspace-scoped design organization |
| `Design` | JSONB canvas document, owner workspace, creator, optional folder, optimistic revision counter |
| `Asset` | Object-storage key, content type, byte count, dimensions, and workspace; metadata scaffold |
| `BrandKit` | Palette/typography JSON and workspace-scoped logo asset IDs; metadata scaffold |
| `ShareLink` | Hashed random bearer token, view/edit permission, expiry, and revocation time |
| `Comment` | Author, design/page identifiers, canvas coordinates, text, resolution status |

Canvas state lives in `Design.document`; the API accepts a JSON object so the editor format can evolve. The editor's document includes a `pages` array whose entries have stable `id` values. Each page's canvas retains its own `width` and `height`, along with object and per-character text styling. The optional project-level `fonts` array embeds custom font faces so saved designs and shared views can reproduce the same text. Pinned comment creation checks that its `pageId` exists in the pages array. Richer schema-version migrations belong in the editor package.

Portable documents can contain up to 20 custom font faces, each at most 3 MiB, with 12 MiB of decoded font bytes combined. Server validation checks the font container signature, declared lengths, safe family names, face metadata, and duplicate identifiers/styles. The browser additionally parses font uploads before saving and loads the bundled/custom faces before rendering. See [fonts.md](fonts.md) for supported formats and licenses.

The API checks that a referenced folder belongs to the same workspace as a design. All member-only queries constrain the design/workspace by the authenticated user. The `createdById` field does not bypass workspace permissions. Asset and brand-kit write APIs, when added, must apply the same workspace boundary checks to every referenced logo, storage key, and folder.

## API contract

Every mutation requires `Origin: <WEB_ORIGIN>`, including command-line clients. Browser calls need `credentials: "include"`; the server issues an HttpOnly cookie and never returns session tokens to JavaScript. JSON bodies must use `Content-Type: application/json`.

| Method and route | Body / result |
| --- | --- |
| `GET /health` | Service liveness, without a database query |
| `GET /api/session` | `{user: {id,name,email,tier} \| null, workspaces: [{id,name,role}]}` |
| `POST /api/auth/signup` | `{name,email,password}`; creates a free account and personal admin workspace, signs in; returns session shape |
| `POST /api/auth/login` | `{email,password}`; returns session shape |
| `POST /api/auth/logout` | Revokes the current token and clears its cookie; 204 |
| `POST /api/workspaces` | `{name}`; creates a workspace with caller as admin |
| `GET /api/workspaces/:id/members` | Workspace members' names, IDs, roles, joined dates |
| `POST /api/workspaces/:id/members` | Admin only; `{email,role}` adds an already registered account; no invitation email is sent |
| `GET /api/workspaces/:id/folders` | Visible workspace folders |
| `POST /api/workspaces/:id/folders` | Admin/editor; `{name}` |
| `GET /api/designs` | Member-visible design metadata; optional `workspaceId`, `folderId`, `cursor`; `{designs,nextCursor}` (50 per page) |
| `POST /api/designs` | Admin/editor; `{workspaceId,title,document,folderId?}`; `{design}` |
| `GET /api/designs/:id` | `{design,permission: "view" \| "edit"}` |
| `PATCH /api/designs/:id` | Admin/editor; `{revision,title?,document?,folderId?}`; `{design}` |
| `DELETE /api/designs/:id` | Admin/editor; `{revision}`; 204 |
| `POST /api/designs/:id/collaboration-token` | Admin/editor; returns short-lived signed room access |
| `POST /api/designs/:id/share` | Admin/editor; `{permission?: "VIEW" \| "EDIT",expiresInDays?: 1..30}`; `{share,token,url}` |
| `GET /api/designs/:id/shares` | Admin/editor; lists share metadata without tokens |
| `DELETE /api/designs/:id/shares/:shareId` | Admin/editor; revokes a share link; 204 |
| `GET /api/shares/:token` | Public bearer link; `{design,permission,expiresAt}` with minimal design fields |
| `PATCH /api/shares/:token` | Valid edit bearer only; `{revision,title?,document?}`; cannot change workspace or folder |
| `GET /api/designs/:id/comments` | Workspace members; pinned comments and authors |
| `POST /api/designs/:id/comments` | Workspace members; `{pageId,x,y,body}` |
| `PATCH /api/designs/:id/comments/:commentId` | `{resolved:boolean}`; comment author or workspace editor/admin |

`ADMIN` can manage membership. `ADMIN` and `EDITOR` can change designs and create/revoke links. `VIEWER` can read and comment. Unrelated users receive 404 for private resources. Public edit links deliberately grant editing to anyone who possesses the token until expiry or revocation; they do not grant membership or access to workspace metadata, comments, or authenticated WebSocket rooms.

The web entry point recognizes `/?share=<token>` and loads a dedicated read-only Fabric `StaticCanvas` preview with page navigation and current-page PNG download. Edit links also offer downloading an independent `.gradesign.json` copy; editing the shared original through that preview is not exposed in the UI. The REST edit endpoint remains available for a future shared editing interface. The cloud projects component lists saved designs and opens authorized editable documents in Studio; workspace viewers receive the same read-only preview. None of these views initializes editable canvas controls for viewers.

Example request:

```ts
const response = await fetch(`${apiBase}/api/designs/${design.id}`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ revision: design.revision, document: nextDocument }),
});
if (response.status === 409) {
  // Preserve the local draft. Fetch the latest revision and let the user
  // reconcile changes before retrying; never silently overwrite a conflict.
}
```

Each successful design mutation increments `revision` in the same transaction as the update. Updates and deletes require the revision seen by the caller. Conflicting writes receive 409. List endpoints return metadata rather than potentially large canvas documents.

## Authentication and security

- Passwords require 12–128 characters. Hashing uses Node's asynchronous scrypt with independent 16-byte salts, a 64-byte derived key, `N=32768`, `r=8`, and `p=1`. Comparison is constant time; unknown accounts still execute scrypt.
- Session and share tokens use 32 random bytes. Only SHA-256 hashes are stored in PostgreSQL. Session rotation revokes the current browser token when signing in; logout revokes it again.
- In production the cookie uses the `__Host-` prefix, `Secure`, `HttpOnly`, and `Path=/` without a Domain attribute. `SameSite=Lax` is the default. Cross-site hosts may require `COOKIE_SAME_SITE=none` and HTTPS; browser third-party-cookie rules can still block such deployments. Sibling subdomains under the same site are preferable.
- Exact Origin validation protects mutations, including login. CORS allows a single configured frontend origin. Documents are capped at 40,000,000 UTF-8 bytes. Create-design, edit-design and edit-share requests have a 41 MiB HTTP parser cap to accommodate the document envelope; all other requests retain the 2 MiB cap. Configure reverse-proxy limits accordingly. Large media should still use asset storage when that adapter is deployed.
- Authentication routes allow 20 attempts per IP per 15 minutes. The global limiter allows 300 requests per minute. The included limiter is in memory: use a shared limiter store when running multiple API instances.
- Set `TRUST_PROXY=1` only when exactly one trusted proxy is in front of the service. Otherwise leave it disabled so spoofed forwarding headers cannot determine rate-limit identity.
- Errors omit credentials, session tokens, share hashes, and internal query values. No route lets a user assign their own tier or a foreign `createdById`.
- Purge expired sessions and expired/revoked share rows periodically as an operational task. Email verification, password reset, account deletion, and audit events still need implementation before a public account service is launched.

## Collaboration authentication

Set an identical `COLLABORATION_SECRET` of at least 32 characters on the API and collaboration service. Keep it out of every `NEXT_PUBLIC_*` variable. An authenticated editor calls:

```http
POST /api/designs/<designId>/collaboration-token
```

The result is `{token,permission:"edit",expiresAt}`. The token is `base64url(payload).base64url(signature)`. Payload fields are `{sub,designId,permission:"edit",exp}`; `exp` is a Unix timestamp five minutes in the future. The signature is HMAC-SHA256 over the base64url payload. The WebSocket service verifies the signature, room identity, permission, and expiry. Viewers receive 403 at the token endpoint.

The WebSocket endpoint is configured separately from the API. See [collaboration.md](collaboration.md) for room sync, persistence, and reconnection details. Canvas JSON snapshots in PostgreSQL and Yjs documents have separate persistence paths; an integration must explicitly serialize/save a snapshot when promoting realtime state to the design revision API.

## Deployment and integration hooks

Deploy `apps/server` to a Node-capable service, connect it to a managed PostgreSQL database using a secret `DATABASE_URL`, run migrations, and expose it through HTTPS. Configure the allowed frontend origin. Deploy the collaboration process with persistent storage and a matching HMAC secret. The private static web preview can call those services once its API/WebSocket URLs are configured, but does not bundle or host them.

OAuth is **schema-only**: add Google/GitHub provider registrations, redirect URI validation, authorization code exchange, state/PKCE protections, and explicit account linking through a maintained auth library before exposing provider buttons. Provider credentials have not been supplied.

Object storage is **an adapter boundary**: implement authenticated presigned upload/download endpoints, enforce workspace ownership and size/type allowlists, verify uploaded metadata, then create `Asset` rows. SVG and arbitrary uploads require a content handling policy. The API does not currently accept or proxy files. Never place storage credentials in the static frontend.

`BrandKit` and `User.tier` support a future server-enforced Pro gate. The starter does not implement billing, premium entitlements, a brand-kit CRUD API, email invitation delivery/acceptance, or membership updates/removal. Adding a registered member through the existing admin route is available now.

Background removal, AI text generation, stock-photo search, video rendering, and provider OAuth are not secretly simulated by this service. Add independent, rate-limited adapters and server-side provider credentials for those integrations. For export jobs, use a bounded worker queue rather than blocking request handlers.

Reference docs: [Prisma relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations), [Express error handling](https://expressjs.com/en/guide/error-handling.html), [Zod schemas](https://zod.dev/api). The project deliberately pins Prisma 6.19; consult the installed CLI's help for that release rather than adopting a newer major's schema conventions.
