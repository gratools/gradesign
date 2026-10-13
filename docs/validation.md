# Validation record

Validated on Windows with Node.js 24, using the lockfile supplied with this source.

- Next.js production static build: passed.
- Frontend and backend TypeScript: passed.
- Prisma schema validation and client generation: passed.
- Initial PostgreSQL migration generated and included; not applied here because no PostgreSQL service was available.
- Backend: 17 passing tests, including real Express HTTP requests with a database substitute. Covers authentication, expiry, role checks, origin checks, input size, foreign folders, conflicting revisions and view-only links.
- Collaboration: 9 passing tests for concurrent changes, deletion semantics, stale updates, origin filtering and signed tokens.
- Real WebSocket transport: two clients synchronized document changes and presence, converged after disconnected concurrent edits, and rejected an unauthorized origin with HTTP 401.
- Browser acceptance checks: initial vector artwork, adding and formatting text, adding a star, undo/redo, page duplication, PNG export and PDF export.

Production database behavior, OAuth providers, real storage services, AI providers, video export and production collaboration persistence were not verified; the latter integrations are not implemented. The static preview intentionally has no configured API or collaboration endpoint.

Native Fabric/node-canvas is not installed: browser Fabric is the rendering target. The API tests do not substitute for testing real migrations, cookies and workspace flows against a deployed PostgreSQL stack.
