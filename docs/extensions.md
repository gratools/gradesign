# Completing the advanced product

The starter deliberately exposes provider boundaries without claiming that an unconfigured integration is working. Interfaces are in `apps/server/src/integrations.ts`.

## Asset storage and stock libraries

Implement `ObjectStorage` with an S3-compatible SDK against S3, R2 or Supabase Storage. Authorize workspace membership before generating a random workspace-scoped object key. Enforce MIME, byte and pixel limits; decode and re-encode raster files with Sharp. Do not let clients pick arbitrary bucket keys or server fetch URLs. Store Asset metadata after upload confirmation and return short-lived reads from a controlled origin. Replace embedded data URLs with authorized asset references when serializing cloud projects.

Implement `StockPhotoProvider` with an official Unsplash/Pexels API account. Keep keys on the server, preserve author attribution and provider download-tracking requirements, and expose paginated search. Import selected photos through a size-limited, allowlisted proxy into object storage rather than accepting arbitrary remote image URLs. Verify the provider's current API terms before deployment.

## AI writing and background removal

Implement `WritingAssistant` as an authenticated server route with an account quota, request timeout and output bound. Keep provider credentials server-side, return text only and let the user place it on the canvas. Treat model output as untrusted data, not markup. The prompt may contain a user's private content; make the destination explicit in the product before a request is sent.

Implement `BackgroundRemover` with a separately deployed image-processing service or an appropriately licensed browser model. Gate image size and concurrent work, remove metadata when re-encoding, and return a transparent PNG. Evaluate model/package licensing before distribution. Both services need error, cancellation and loading states; they are not implemented in the local demo.

## OAuth and workspace management

Use a maintained authentication library to complete authorization-code OAuth with PKCE/state checks, callback allowlists and secure account linking. `OAuthAccount` is a persistence hook, not a working provider. Add email verification, reset, invitation acceptance and an admin interface on top of the existing workspace endpoints. Enforce tier entitlements on server endpoints, not merely a frontend badge.

## Animation and video

Represent animations as explicit per-object/page timeline data. Render frames from deterministic scene state and encode them in a controlled worker or backend queue. Do not infer animation progress from CSS presentation previews. Add cancellation, memory limits and export progress. The current CSS entrance preview is deliberately not advertised as a video export.

## Production collaboration

Make the room server the canonical source while clients are connected. Persist Yjs updates with stable room IDs, restore them on startup, compact updates periodically and save validated previews/snapshots to the Design record. Shared undo should use `Y.UndoManager` with tracked local origins. A deployment needs connection quotas, multi-instance room routing, bounded documents, authenticated recovery and observability without logging bearer tokens.

## Editor roadmap

Next additions: a dashboard; object-to-object alignment guides; curved text; saved brand typography/logo controls; image filters; a persisted animation timeline; accessible alternate object editing; and theme support. Presentation sizes, selected-character formatting and embedded custom fonts are implemented. Preserve the `CanvasHandle` interface so integrations do not depend on Fabric internals.
