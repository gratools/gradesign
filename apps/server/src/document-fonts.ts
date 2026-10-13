import { z } from "zod";

// The browser uses the same portable face format; keep these bounds in sync with web/lib/fonts.ts.
const MAX_FONT_BYTES = 3 * 1024 * 1024;
const MAX_FONT_TOTAL = 12 * 1024 * 1024;
const mime = { woff2: "woff2", woff: "woff", truetype: "ttf", opentype: "otf" } as const;
const reserved = new Set([
  "inter", "roboto", "open sans", "lato", "montserrat", "poppins", "lora", "playfair display", "merriweather", "bebas neue", "oswald", "space mono",
  "arial", "georgia", "courier new", "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong",
  "inherit", "initial", "unset", "revert", "revert-layer", "default", "helvetica", "times new roman", "verdana", "tahoma", "trebuchet ms", "impact", "comic sans ms",
]);

function fontSignature(bytes: Buffer): keyof typeof mime | null {
  if (bytes.length < 12 || bytes.length > MAX_FONT_BYTES) return null;
  const signature = bytes.toString("ascii", 0, 4);
  if (signature === "wOF2" || signature === "wOFF") {
    if (bytes.length < (signature === "wOF2" ? 48 : 44) || bytes.readUInt32BE(8) !== bytes.length || bytes.readUInt16BE(12) === 0) return null;
    return signature === "wOF2" ? "woff2" : "woff";
  }
  if (signature === "OTTO" || signature === "true" || bytes.readUInt32BE(0) === 0x00010000) {
    const tables = bytes.readUInt16BE(4);
    if (tables === 0 || tables > 4096 || bytes.length < 12 + 16 * tables) return null;
    for (let index = 0; index < tables; index++) {
      const offset = bytes.readUInt32BE(12 + index * 16 + 8), length = bytes.readUInt32BE(12 + index * 16 + 12);
      if (offset > bytes.length || length > bytes.length - offset) return null;
    }
    return signature === "OTTO" ? "opentype" : "truetype";
  }
  return null;
}

const fontSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  family: z.string().regex(/^[A-Za-z][A-Za-z0-9 _-]{0,63}$/).refine((family) => family === family.trim() && !reserved.has(family.toLowerCase())),
  weight: z.string().regex(/^(?:[1-9]\d{0,2}|1000)$/),
  style: z.enum(["normal", "italic"]),
  format: z.enum(["woff2", "woff", "truetype", "opentype"]),
  fileName: z.string().min(1).max(255).refine((name) => !/[\x00-\x1f\x7f]/.test(name)),
  dataUrl: z.string().max(Math.ceil(MAX_FONT_BYTES / 3) * 4 + 32),
}).refine((font) => {
  const prefix = `data:font/${mime[font.format]};base64,`;
  if (!font.dataUrl.startsWith(prefix)) return false;
  const encoded = font.dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, "base64");
  return fontSignature(bytes) === font.format;
}, "Invalid embedded font data");

export const customFontsSchema = z.array(fontSchema).max(20).refine((fonts) => {
  const ids = new Set<string>(), faces = new Set<string>();
  let total = 0;
  for (const font of fonts) {
    const face = `${font.family.toLowerCase()}|${font.weight}|${font.style}`;
    if (ids.has(font.id) || faces.has(face)) return false;
    ids.add(font.id); faces.add(face);
    total += Buffer.from(font.dataUrl.slice(font.dataUrl.indexOf(",") + 1), "base64").length;
    if (total > MAX_FONT_TOTAL) return false;
  }
  return true;
}, "Custom fonts must have unique identifiers and faces, with at most 12 MiB combined font data");
