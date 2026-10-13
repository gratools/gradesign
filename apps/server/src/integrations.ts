/** Provider boundaries. No credentials or third-party requests are bundled. */
export interface StockPhoto {
  id: string;
  previewUrl: string;
  sourceUrl: string;
  author: string;
  attributionUrl: string;
  licenseUrl: string;
}
export interface StockPhotoProvider {
  search(query: string, page: number, signal?: AbortSignal): Promise<StockPhoto[]>;
}
export interface ObjectStorage {
  /** Sign only server-generated keys scoped to the authorized workspace. */
  createUpload(key: string, contentType: string, maxBytes: number): Promise<{ url: string; expiresAt: Date }>;
  createRead(key: string): Promise<{ url: string; expiresAt: Date }>;
  remove(key: string): Promise<void>;
}
export interface WritingAssistant {
  write(input: { prompt: string; maxCharacters: number; signal?: AbortSignal }): Promise<string>;
}
export interface BackgroundRemover {
  remove(input: { raster: Uint8Array; mimeType: string; signal?: AbortSignal }): Promise<Uint8Array>;
}
