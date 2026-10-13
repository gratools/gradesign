# Portable fonts and presentation sizes

The page adapter preserves every canvas field, including `width`, `height`, object defaults and Fabric per-character `styles`. All are included when encoding a Yjs document and reopening it. Canvas fields and top-level object properties merge independently. A text object's `styles` remains one atomic property: concurrent edits to different style ranges within the same textbox are not a character-level rich-text merge.

Custom fonts are project metadata in a separate Yjs `fonts` map, keyed by a stable font-face ID. `applyFontChanges(doc, previousFonts, nextFonts)` uses the same stale-baseline behavior as pages. Independent font additions merge; a remote deletion is not resurrected by a stale edit. `readFonts(doc)` returns the portable face data, and `observeRemoteFonts()` ignores local-origin writes.

The React `useCollaboration` hook accepts optional `initialFonts` and `onRemoteFonts`, and exposes `updateFonts`. It validates every received font collection before forwarding it to the editor. Initial room synchronization delivers fonts before pages; page updates also check the font state before calling `onRemotePages`. The editor should update its current-font ref synchronously inside `onRemoteFonts`, persist that metadata to the project, and await font loading before measuring the remote canvas. An invalid font collection disconnects the session rather than registering untrusted data. Each face is limited to 3 MiB; a project permits 20 faces and 12 MiB of decoded font bytes.

The WebSocket frame cap is 48 MiB to allow an initial portable document of up to 40 MB plus Yjs framing. This is not a total room-memory or history quota. Production deployments still require durable room storage, canonical server initialization, bounded history and per-room quotas. Font data is embedded once per face, not once per page. Standard authentication, membership and origin checks remain in place.

The REST API accepts documents up to 40,000,000 UTF-8 bytes. The corresponding create/edit/share-edit routes use a 41 MiB HTTP parser cap to allow their request envelope; other routes retain the 2 MiB cap. Reverse proxies must permit equivalent request sizes. Custom font signature, metadata, duplicate-face and combined-size checks also run on server document saves.

Run adapter coverage with `pnpm --filter @forma/collaboration test`. The tests exchange real Yjs updates for concurrent presentation resizing and text formatting, custom font transfer, reopening, font additions and stale deletion behavior.
