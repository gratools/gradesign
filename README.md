# gradesign. — open design studio

An MIT-licensed, Canva-inspired design editor built with Next.js, TypeScript, Fabric.js, Tailwind, Radix UI and Lucide. The gradesign. identity uses the supplied brand assets; templates are original. This is a functional full-stack foundation, not production parity with Canva Pro. Existing package names and storage identifiers retain `forma` for compatibility.

The published preview is a **private, browser-local editor**. Its API, PostgreSQL database and WebSocket service are supplied as self-hosted source; they are not running behind the preview.

## 1. Directory structure

For GitHub Pages, follow [the deployment guide](docs/github-pages.md). The included workflow builds the editor with the correct repository path. Delete local projects using the trash icon in **Projects**; recover them through **Projects → Trash → Restore**.

```text
forma-studio/
├── apps/
│   ├── web/                        Next.js App Router frontend
│   │   ├── app/                    Entry, metadata and responsive styles
│   │   ├── components/
│   │   │   ├── studio.tsx          Editor shell, pages, local saving and export
│   │   │   ├── design-canvas.tsx   Fabric.js canvas and object operations
│   │   │   ├── shared-view.tsx     Public-link read-only viewer
│   │   │   ├── cloud-projects.tsx  Authenticated project browser
│   │   │   └── ui/button.tsx       shadcn-style composable button
│   │   └── lib/                    Canvas types, templates, storage, Yjs hook
│   └── server/                     Express API and PostgreSQL persistence
│       ├── prisma/schema.prisma    Relational schema
│       ├── prisma/migrations/      Initial SQL migration
│       └── src/                    Auth, permissions, routes and tests
├── packages/collaboration/         Object/property-level Yjs sync and WS server
├── docs/                          Backend, collaboration and extension guides
├── docker-compose.yml             Local PostgreSQL
└── scripts/copy-build.mjs          Packages Next static output for hosting
```

### Run the editor

Use Node.js 22.12+ or Node.js 24 and pnpm 11.25.0. Package versions are recorded in `pnpm-lock.yaml`.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. No account or API key is needed for local editing. Projects and custom fonts save in IndexedDB; the project list shows the 12 most recent designs. Existing localStorage projects migrate automatically and their legacy backup is retained. If IndexedDB is unavailable, storage falls back to localStorage with a visible error on quota failure. Use **Share → editable project file** for backups. Projects imports both `.gradesign.json` and older `.forma.json` files.

**Brand** manages saved colors and uploads custom WOFF2/WOFF/TTF/OTF fonts. The toolbar color picker offers the same brand palette for text, shapes and page backgrounds. Double-click text, highlight characters, then apply font, size, bold, italic, underline or color. Font size commits on Enter or blur. **Resize** offers 16:9, 9:16, 4:3, 3:4 and the legacy 3:2 size, with options to resize all pages and fit existing artwork. New designs start at 1920 × 1080; older designs retain their original dimensions.

All six original attachments are included unchanged in `apps/web/public/brand/`: `logo.svg`, `logo-light.svg`, `favicon.svg`, `favicon-180.png`, `favicon-512.png` and `favicon-32.png`. Twelve bundled font families and their licenses live in `apps/web/public/fonts/`. See [font support and limits](docs/fonts.md).

```sh
pnpm build                   # Next.js static build, copied to dist/
pnpm typecheck
pnpm --filter @forma/server build
pnpm test
# Optional live transport smoke test (start pnpm dev:collab first):
node scripts/test-transport.mjs
```

## 2. Database schema and backend

The complete PostgreSQL schema is in [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma); the generated SQL migration is checked in. It models:

| Entity | Purpose |
| --- | --- |
| User, Credential, Session, OAuthAccount | Profile, free/pro tier, password credentials, hashed sessions and OAuth extension |
| Workspace, Membership | Teams with ADMIN, EDITOR and VIEWER roles |
| Folder | Workspace-scoped design organization |
| Design | Canvas document JSON, workspace, owner and optimistic-concurrency revision |
| Asset, BrandKit | Storage and reusable brand metadata extension points |
| ShareLink | Hashed, expiring, revocable VIEW or EDIT bearer links |
| Comment | Design/page coordinates and discussion text |

Run the full stack:

```sh
docker compose up -d postgres
# Copy apps/server/.env.example to apps/server/.env and configure it.
pnpm --filter @forma/server db:generate
pnpm --filter @forma/server exec prisma migrate deploy
pnpm dev:server
# In another terminal, copy apps/web/.env.example to apps/web/.env.local.
# Set NEXT_PUBLIC_API_URL=http://localhost:4000, then restart:
pnpm dev
```

Use the same browser origin as `WEB_ORIGIN` (default `http://localhost:3000`). Frontend environment values are public and fixed at build time. Never put secrets in `NEXT_PUBLIC_*` variables. For cookie-based auth with a separately hosted frontend, see the origin, HTTPS and cookie settings in [`docs/backend.md`](docs/backend.md).

Email/password accounts, sessions, membership enforcement, design CRUD, folders, existing-user team membership, share links and pinned-comment endpoints are implemented. The web UI connects account creation/sign-in, project save/open and view links when an API URL is configured. Team/folder administration currently uses the API. Share recipients see a real static-canvas viewer; EDIT links can download an editable copy, while the API also supports revision-checked updates. Link revocation is available through the API.

## 3. Core canvas component

[`DesignCanvas`](apps/web/components/design-canvas.tsx) wraps Fabric.js 6 with an imperative, typed React interface. Load it client-side:

```tsx
'use client';
import dynamic from 'next/dynamic';
import { useRef } from 'react';
import type { CanvasHandle } from './lib/canvas-types';

const DesignCanvas = dynamic(() => import('./components/design-canvas'), { ssr: false });

export function Example() {
  const canvas = useRef<CanvasHandle>(null);
  return <>
    <button onClick={() => canvas.current?.addText('heading')}>Add text</button>
    <button onClick={() => canvas.current?.addShape('circle')}>Add circle</button>
    <DesignCanvas ref={canvas} zoom={0.7} grid={false}
      onChange={(json, thumbnail) => { /* Save this page */ }}
      onSelection={() => {}} onHistoryChange={() => {}} />
  </>;
}
```

The editor supports:

- Four vector templates (including blank); every artwork element is editable.
- Character-level font family/size, bold, italic, underline and fill; whole-box alignment.
- Twelve bundled font families and portable custom font uploads.
- Rectangles, circles, triangles, stars, lines, raster image uploads and drag/drop.
- Move, scale, rotate, group/ungroup, duplicate, align, reorder, hide, rename and lock.
- Grid snapping, up to 80 undo snapshots with a memory bound, copy/paste shortcuts.
- Page creation, duplication, deletion, reordering, aspect-ratio resizing and presentation mode.
- Editable brand palettes for text, elements and page backgrounds, plus coordinate-pinned comments.
- PNG/JPG at 1×–3×, SVG, multi-page PDF and editable JSON.

PDF pages are raster images at the selected resolution and retain each page's size. SVG retains vector objects and embeds uploaded raster images plus used bundled/custom fonts. Undo history is scoped to the current page session and resets when switching pages; resizing also restores affected sibling pages and comment coordinates while that history is active. Other project/page-management actions are not part of canvas undo. Collaboration disables local snapshot undo because it is not a shared CRDT undo manager. The animation control previews a CSS entrance effect; it does not persist an animation timeline.

## 4. Real-time setup

The [`useCollaboration`](apps/web/lib/use-collaboration.ts) hook synchronizes page maps, object maps and individual properties through Yjs, with awareness and live cursor rendering. It sends only changed fields instead of replacing the whole canvas JSON on each edit.

For a local two-tab demo, set this in `apps/web/.env.local`, restart Next.js, and start the room server:

```dotenv
NEXT_PUBLIC_COLLAB_URL=ws://localhost:1234
```

```sh
pnpm dev:collab
```

Open the same local project in two tabs and opt in using Share. Without an API, both tabs must use the same local project ID and browser origin. Import creates a new project ID, so cross-browser testing should use a shared cloud design instead. See [`docs/collaboration.md`](docs/collaboration.md). With a configured backend, the room is tied to a saved design and the server issues short-lived editor tokens. Use identical `COLLABORATION_SECRET` values in the API and room service, allow the frontend origin explicitly, and use WSS in production.

This is development collaboration infrastructure: room state is in memory by default, text edits merge as whole string properties, page order is last-write-wins, and durable canonical room persistence needs to be implemented before production use. Cloud snapshot saves are blocked while a live room is active to avoid silently claiming that CRDT state has been persisted. Disconnect, then save a snapshot. A production service should serialize snapshots from the room server to PostgreSQL and implement shared Yjs undo.

## Feature boundaries and extension points

| Area | Status |
| --- | --- |
| Local canvas, multipage editing, templates, layers, exports, comments | Working in the preview |
| Email/password, PostgreSQL, RBAC, cloud projects and link API | Implemented; configure and run backend |
| Yjs rooms, presence/cursors, signed room authorization | Implemented opt-in development infrastructure |
| Pro tier | Schema and visual simulation; no billing or enforced premium asset catalog |
| Google/GitHub OAuth, email invitations, password reset/verification | Further implementation required |
| Custom fonts and character-level formatting | Working in the preview; fonts travel in editable JSON |
| S3/R2 uploads and stock photo APIs | Adapter contracts and schema hooks; no connected providers |
| AI writing and background removal | Adapter contracts; no connected model/service |
| Curved text, lists, shadows/filters | Further editor controls required |
| MP4/GIF export, timeline, persisted transitions, exit animation | Further implementation required |
| Center snapping guides | Working with grid enabled |
| Object-to-object alignment guides, dashboard, dark theme | Further implementation required |

See [`docs/extensions.md`](docs/extensions.md) for practical integration steps. The preview makes no external image or model calls. Fabric runs in the browser; the optional native `canvas` dependency is deliberately disabled.

## Validation and references

Backend tests cover session expiry, role boundaries, foreign-workspace folders, revision conflicts and bearer-link permissions using an in-memory database substitute. Collaboration tests check concurrent object/property edits, deletions, stale snapshots, origin suppression and token boundaries. PostgreSQL integration requires a running database and must be exercised before production deployment.

`node --test scripts/fonts.test.mjs` verifies font assets, validation and SVG embedding. `node scripts/test-canvas.cjs` exercises actual React/Fabric rich text, range retention, history, locking, resizing and grouping (requires a native canvas binding; see the script header). Browser acceptance checks cover custom font upload/reload, legacy project migration, brand colors, new ratios and multipage resize undo.

Architecture references: [Next.js static export](https://nextjs.org/docs/app/guides/static-exports), [Fabric.js 6 migration/API conventions](https://www.fabricjs.com/docs/upgrading/upgrading-to-fabric-60/), [Yjs WebSocket provider](https://github.com/yjs/y-websocket). Next's static frontend is deployed separately from the Node API and WebSocket processes.

MIT license; see [LICENSE](LICENSE). Third-party dependencies retain their own licenses.
