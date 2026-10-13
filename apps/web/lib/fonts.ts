/** Local font assets and portable, explicitly named custom font faces. */
export type CustomFont = {
  id: string;
  family: string;
  dataUrl: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  weight: string;
  style: "normal" | "italic";
  fileName: string;
};

export type FontOption = { family: string; category: string };
type BundledFont = FontOption & { slug: string; weights: number[]; italic: boolean };
export const BUNDLED_FONTS: BundledFont[] = [
  { family: "Inter", slug: "inter", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Roboto", slug: "roboto", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Open Sans", slug: "open-sans", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Lato", slug: "lato", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Montserrat", slug: "montserrat", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Poppins", slug: "poppins", category: "Sans serif", weights: [400, 700], italic: true },
  { family: "Lora", slug: "lora", category: "Serif", weights: [400, 700], italic: true },
  { family: "Playfair Display", slug: "playfair-display", category: "Serif", weights: [400, 700], italic: true },
  { family: "Merriweather", slug: "merriweather", category: "Serif", weights: [400, 700], italic: true },
  { family: "Bebas Neue", slug: "bebas-neue", category: "Display", weights: [400], italic: false },
  { family: "Oswald", slug: "oswald", category: "Display", weights: [400, 700], italic: false },
  { family: "Space Mono", slug: "space-mono", category: "Monospace", weights: [400, 700], italic: true },
];
export const MAX_FONT_BYTES = 3 * 1024 * 1024;
export const MAX_CUSTOM_FONTS = 20;
export const MAX_CUSTOM_FONT_BYTES = 12 * 1024 * 1024;

const systemFonts: FontOption[] = [
  { family: "Arial", category: "System" },
  { family: "Georgia", category: "System" },
  { family: "Courier New", category: "System" },
];
const reservedFamilies = new Set([
  ...BUNDLED_FONTS.map(({ family }) => family.toLowerCase()),
  ...systemFonts.map(({ family }) => family.toLowerCase()),
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong",
  "inherit", "initial", "unset", "revert", "revert-layer", "default",
  "helvetica", "times new roman", "verdana", "tahoma", "trebuchet ms", "impact", "comic sans ms",
]);
const mimeByFormat = { woff2: "woff2", woff: "woff", truetype: "ttf", opentype: "otf" } as const;
const formatByExtension = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" } as const;

export function isValidCustomFontFamily(family: unknown): family is string {
  return typeof family === "string" && /^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(family) &&
    family === family.trim() && !reservedFamilies.has(family.toLowerCase());
}

/** Validate binary signatures and declared container sizes before asking the browser to parse a font. */
export function detectFontFormat(bytes: Uint8Array): CustomFont["format"] | null {
  if (bytes.length < 12 || bytes.length > MAX_FONT_BYTES) return null;
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (signature === "wOF2" || signature === "wOFF") {
    const minimum = signature === "wOF2" ? 48 : 44;
    if (bytes.length < minimum || view.getUint32(8) !== bytes.length || view.getUint16(12) === 0) return null;
    return signature === "wOF2" ? "woff2" : "woff";
  }
  if (signature === "OTTO" || signature === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    const tables = view.getUint16(4);
    if (tables === 0 || tables > 4096 || bytes.length < 12 + 16 * tables) return null;
    for (let index = 0; index < tables; index++) {
      const offset = view.getUint32(12 + index * 16 + 8);
      const length = view.getUint32(12 + index * 16 + 12);
      if (offset > bytes.length || length > bytes.length - offset) return null;
    }
    return signature === "OTTO" ? "opentype" : "truetype";
  }
  return null;
}

function fontBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:font\/(?:woff2|woff|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[1].length > Math.ceil(MAX_FONT_BYTES / 3) * 4 || match[1].length % 4 !== 0) return null;
  try { return Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0)); }
  catch { return null; }
}

export function customFontBytes(font: Pick<CustomFont, "dataUrl">): number {
  const encoded = font.dataUrl.slice(font.dataUrl.indexOf(",") + 1);
  return encoded.length * 3 / 4 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

export function validateCustomFont(value: unknown): value is CustomFont {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const font = value as Partial<CustomFont>;
  if (typeof font.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(font.id) ||
    !isValidCustomFontFamily(font.family) || typeof font.weight !== "string" || !/^(?:[1-9]\d{0,2}|1000)$/.test(font.weight) ||
    !["normal", "italic"].includes(font.style ?? "") || !Object.hasOwn(mimeByFormat, font.format ?? "") ||
    typeof font.fileName !== "string" || font.fileName.length < 1 || font.fileName.length > 255 || /[\x00-\x1f\x7f]/.test(font.fileName) ||
    typeof font.dataUrl !== "string" || !font.dataUrl.startsWith(`data:font/${mimeByFormat[font.format!]};base64,`)) return false;
  const bytes = fontBytes(font.dataUrl);
  return Boolean(bytes && detectFontFormat(bytes) === font.format);
}

export function validateCustomFontCollection(value: unknown): value is CustomFont[] {
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_FONTS) return false;
  const ids = new Set<string>(), faces = new Set<string>();
  let total = 0;
  for (const font of value) {
    if (!validateCustomFont(font)) return false;
    const face = `${font.family.toLowerCase()}|${font.weight}|${font.style}`;
    if (ids.has(font.id) || faces.has(face)) return false;
    ids.add(font.id); faces.add(face); total += customFontBytes(font);
    if (total > MAX_CUSTOM_FONT_BYTES) return false;
  }
  return true;
}

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += 16_384)
    parts.push(String.fromCharCode(...bytes.subarray(index, index + 16_384)));
  return btoa(parts.join(""));
}

export async function importCustomFont(file: File, family: string, weight: string, style: "normal" | "italic"): Promise<CustomFont> {
  family = family.trim();
  weight = weight === "normal" ? "400" : weight === "bold" ? "700" : weight;
  if (!isValidCustomFontFamily(family)) throw new Error("Give the font a unique name using 1–64 letters, numbers, spaces, hyphens or underscores. Start with a letter.");
  if (file.size > MAX_FONT_BYTES) throw new Error("Choose a font file no larger than 3 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !Object.hasOwn(formatByExtension, extension)) throw new Error("Choose a WOFF2, WOFF, TTF or OTF font file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFontFormat(bytes);
  if (!format || format !== formatByExtension[extension as keyof typeof formatByExtension])
    throw new Error("This file is not a valid WOFF2, WOFF, TTF or OTF font matching its file extension.");
  const font: CustomFont = { id: crypto.randomUUID(), family, format, weight, style, fileName: file.name,
    dataUrl: `data:font/${mimeByFormat[format]};base64,${bytesToBase64(bytes)}` };
  if (!validateCustomFont(font)) throw new Error("Choose a font weight from 1 to 1000 and a normal or italic style.");
  // Loading validates the full font parser before the caller persists untrusted bytes.
  if (typeof FontFace !== "undefined") {
    try { await new FontFace(family, bytes.buffer, { weight, style }).load(); }
    catch { throw new Error("Your browser could not read this font. Try another WOFF2, WOFF, TTF or OTF file."); }
  }
  return font;
}

type LoadedFace = { source: string; face: FontFace; ready: Promise<FontFace> };
const faceCache = new Map<string, LoadedFace>();
const activeCustomFaces = new Map<string, FontFace>();
let customRegistration = 0;

function customFaceKey(font: CustomFont): string {
  return `custom:${font.id}:${font.family}:${font.weight}:${font.style}`;
}

function hasFontAPI(): boolean {
  return typeof document !== "undefined" && typeof FontFace !== "undefined" && Boolean(document.fonts);
}

async function loadFace(key: string, family: string, source: string, weight: string, style: string): Promise<FontFace> {
  let entry = faceCache.get(key);
  if (!entry || entry.source !== source) {
    const face = new FontFace(family, source, { weight, style, display: "swap" });
    entry = { source, face, ready: face.load() };
    faceCache.set(key, entry);
  }
  try { return await entry.ready; }
  catch { if (faceCache.get(key) === entry) faceCache.delete(key); throw new Error(`The font “${family}” could not be loaded.`); }
}

async function clearMeasurementCache(families: string[]): Promise<void> {
  if (!families.length || !hasFontAPI()) return;
  const { cache } = await import("fabric");
  for (const family of families) cache.clearFontCache(family);
}

function bundledFaces(font: BundledFont) {
  return font.weights.flatMap((weight) => (font.italic ? ["normal", "italic"] : ["normal"]).map((style) => ({
    family: font.family, weight: String(weight), style,
    path: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fonts/${font.slug}/${font.slug}-latin-${weight}-${style}.woff2`,
  })));
}

export async function ensureBundledFonts(families: string[] = BUNDLED_FONTS.map((font) => font.family)): Promise<void> {
  if (!hasFontAPI()) return;
  const requested = new Set(families.map((family) => family.toLowerCase()));
  const newlyLoaded = new Set<string>();
  await Promise.all(BUNDLED_FONTS.filter((font) => requested.has(font.family.toLowerCase())).flatMap((font) => bundledFaces(font)).map(async (font) => {
    const face = await loadFace(font.path, font.family, `url("${font.path}") format("woff2")`, font.weight, font.style);
    if (!document.fonts.has(face)) { document.fonts.add(face); newlyLoaded.add(font.family); }
  }));
  await clearMeasurementCache([...newlyLoaded]);
}

export async function registerCustomFonts(fonts: CustomFont[]): Promise<void> {
  if (!validateCustomFontCollection(fonts)) throw new Error("Invalid custom font collection. Use up to 20 font faces with a combined size of 12 MB.");
  if (!hasFontAPI()) return;
  const request = ++customRegistration;
  const loaded = await Promise.all(fonts.map(async (font) => ({
    font, face: await loadFace(customFaceKey(font), font.family, `url("${font.dataUrl}") format("${font.format}")`, font.weight, font.style),
  })));
  if (request !== customRegistration) return;
  const desired = new Set(loaded.map(({ face }) => face));
  const changedFamilies = new Set<string>();
  for (const [key, face] of activeCustomFaces) {
    if (!desired.has(face)) {
      document.fonts.delete(face); activeCustomFaces.delete(key); changedFamilies.add(face.family.replace(/^['"]|['"]$/g, ""));
      faceCache.delete(key);
    }
  }
  for (const { font, face } of loaded) {
    if (!document.fonts.has(face)) { document.fonts.add(face); changedFamilies.add(font.family); }
    activeCustomFaces.set(customFaceKey(font), face);
  }
  await clearMeasurementCache([...changedFamilies]);
}

export async function ensureFontFamily(family: string, customFonts: CustomFont[] = []): Promise<void> {
  await Promise.all([ensureBundledFonts([family]), registerCustomFonts(customFonts)]);
}

/** Finds both object defaults and Fabric's per-character style overrides, including nested groups. */
export function canvasFontFamilies(json: unknown): string[] {
  const families = new Set<string>();
  const seen = new WeakSet<object>();
  const pending: unknown[] = [json];
  let visited = 0;
  while (pending.length && visited++ < 100_000) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === "fontFamily" && typeof child === "string") families.add(child);
      else if (child && typeof child === "object") pending.push(child);
    }
  }
  return [...families];
}

export async function ensureFontsForCanvas(json: unknown, customFonts: CustomFont[] = []): Promise<void> {
  await Promise.all([ensureBundledFonts(canvasFontFamilies(json)), registerCustomFonts(customFonts)]);
}

export function fontOptions(customFonts: CustomFont[] = []): FontOption[] {
  const result: FontOption[] = [], seen = new Set<string>();
  for (const font of [...BUNDLED_FONTS, ...customFonts.filter(({ family }) => isValidCustomFontFamily(family)).map(({ family }) => ({ family, category: "Custom" })), ...systemFonts]) {
    const key = font.family.toLowerCase();
    if (!seen.has(key)) { result.push({ family: font.family, category: font.category }); seen.add(key); }
  }
  return result;
}

const embeddedAssetCache = new Map<string, Promise<string>>();
function embeddedBundledFont(path: string): Promise<string> {
  let pending = embeddedAssetCache.get(path);
  if (!pending) {
    pending = fetch(path).then(async (response) => {
      if (!response.ok) throw new Error("A bundled font is unavailable. Please retry the export.");
      return `data:font/woff2;base64,${bytesToBase64(new Uint8Array(await response.arrayBuffer()))}`;
    }).catch((error) => { embeddedAssetCache.delete(path); throw error; });
    embeddedAssetCache.set(path, pending);
  }
  return pending;
}

/** Preserve font appearance in the SVG without requests to remote font providers. */
export async function embedFontsInSVG(svg: string, json: unknown, customFonts: CustomFont[] = []): Promise<string> {
  if (!validateCustomFontCollection(customFonts)) throw new Error("This design contains invalid custom fonts.");
  const used = new Set(canvasFontFamilies(json).map((family) => family.toLowerCase()));
  const faces = await Promise.all(BUNDLED_FONTS.filter((font) => used.has(font.family.toLowerCase())).flatMap(bundledFaces).map(async (face) => ({
    ...face, format: "woff2", dataUrl: await embeddedBundledFont(face.path),
  })));
  const rules = [...faces, ...customFonts.filter((font) => used.has(font.family.toLowerCase()))].map((face) =>
    `@font-face{font-family:${JSON.stringify(face.family)};font-style:${face.style};font-weight:${face.weight};src:url("${face.dataUrl}") format("${face.format}");}`,
  ).join("\n");
  if (!rules) return svg;
  return svg.replace(/(<svg\b[^>]*>)/i, `$1<defs><style type="text/css"><![CDATA[\n${rules}\n]]></style></defs>`);
}
