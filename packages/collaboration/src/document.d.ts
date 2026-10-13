import type { Doc } from "yjs";

export interface CollaborativePage {
  id: string;
  name: string;
  canvas: Record<string, unknown>;
  thumbnail?: string;
}
export const LOCAL_ORIGIN: unique symbol;
export function applyPageChanges(
  doc: Doc,
  previousPages: CollaborativePage[],
  nextPages: CollaborativePage[],
  origin?: unknown,
): void;
export function readPages(doc: Doc): CollaborativePage[];
export function observeRemotePages(
  doc: Doc,
  onPages: (pages: CollaborativePage[]) => void,
  localOrigin?: unknown,
): () => void;
export interface CollaborativeFont {
  id: string;
  family: string;
  dataUrl: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  weight: string;
  style: "normal" | "italic";
  fileName: string;
}
export function applyFontChanges(doc: Doc, previousFonts: CollaborativeFont[], nextFonts: CollaborativeFont[], origin?: unknown): void;
export function readFonts(doc: Doc): CollaborativeFont[];
export function observeRemoteFonts(doc: Doc, onFonts: (fonts: CollaborativeFont[]) => void, localOrigin?: unknown): () => void;
