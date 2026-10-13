import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { customFontsSchema } from "./document-fonts.js";
import { documentSchema, MAX_DOCUMENT_BYTES, shareUpdateSchema } from "./validation.js";

const bytes = readFileSync(new URL("../../web/public/fonts/inter/inter-latin-400-normal.woff2", import.meta.url));
const font = { id: "brand-regular", family: "Brand Type", dataUrl: `data:font/woff2;base64,${bytes.toString("base64")}`, format: "woff2", weight: "400", style: "normal", fileName: "brand.woff2" };

test("portable project dimensions, inline styling and custom font bytes survive API validation", () => {
  const project = { id: "design-a", fonts: [font], pages: [{ id: "page-a", canvas: { width: 1080, height: 1920, objects: [
    { id: "text", type: "Textbox", text: "Hello", fontFamily: "Inter", styles: { 0: { 1: { fontFamily: font.family, fontWeight: "700", fontStyle: "italic", fontSize: 64 } } } },
  ] } }] };
  assert.deepEqual(documentSchema.parse(project), project);
  assert.deepEqual(shareUpdateSchema.parse({ revision: 0, document: project }).document, project);
});

test("document cap permits portable files above the former 2 MiB limit and rejects files over 40 MB", () => {
  assert.equal(documentSchema.safeParse({ fonts: [font], data: "x".repeat(2_100_000) }).success, true);
  assert.equal(documentSchema.safeParse({ data: "x".repeat(MAX_DOCUMENT_BYTES) }).success, false);
});

test("embedded font checks reject malformed bytes, reserved names, duplicate faces and excessive font counts", () => {
  assert.equal(customFontsSchema.safeParse([font]).success, true);
  assert.equal(customFontsSchema.safeParse([{ ...font, dataUrl: "data:text/html;base64,PHNjcmlwdD4=" }]).success, false);
  assert.equal(customFontsSchema.safeParse([{ ...font, family: "Inter" }]).success, false);
  assert.equal(customFontsSchema.safeParse([font, { ...font, id: "other" }]).success, false);
  assert.equal(customFontsSchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ ...font, id: `face-${i}`, family: `Brand ${i}` }))).success, false);
  assert.equal(documentSchema.safeParse({ fonts: [{ ...font, weight: "bold" }] }).success, false);
});
