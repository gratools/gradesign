import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  BUNDLED_FONTS, MAX_FONT_BYTES, MAX_CUSTOM_FONTS, MAX_CUSTOM_FONT_BYTES,
  canvasFontFamilies, customFontBytes, detectFontFormat, fontOptions, importCustomFont,
  isValidCustomFontFamily, validateCustomFont, validateCustomFontCollection, embedFontsInSVG,
} from '../apps/web/lib/fonts.ts';

const inter = readFileSync(new URL('../apps/web/public/fonts/inter/inter-latin-400-normal.woff2', import.meta.url));
const custom = (overrides = {}) => ({
  id: 'brand-regular', family: 'My Brand', format: 'woff2', weight: '400', style: 'normal',
  fileName: 'my-brand.woff2', dataUrl: `data:font/woff2;base64,${inter.toString('base64')}`, ...overrides,
});

test('every advertised bundled face has a real WOFF2 asset and bundled license', () => {
  for (const font of BUNDLED_FONTS) {
    const folder = new URL(`../apps/web/public/fonts/${font.slug}/`, import.meta.url);
    assert.ok(existsSync(fileURLToPath(new URL('LICENSE', folder))));
    for (const weight of font.weights) {
      for (const style of font.italic ? ['normal', 'italic'] : ['normal']) {
        assert.equal(detectFontFormat(readFileSync(new URL(`${font.slug}-latin-${weight}-${style}.woff2`, folder))), 'woff2');
      }
    }
  }
  assert.equal(BUNDLED_FONTS.length, 12);
});

test('custom fonts round-trip as self-contained data and keep each face distinct', async () => {
  const regular = await importCustomFont(new File([inter], 'brand.woff2'), 'Brand Serif', 'normal', 'normal');
  const bold = await importCustomFont(new File([inter], 'brand-bold.woff2'), 'Brand Serif', 'bold', 'normal');
  assert.equal(regular.weight, '400');
  assert.equal(bold.weight, '700');
  assert.equal(customFontBytes(regular), inter.length);
  assert.equal(validateCustomFontCollection(JSON.parse(JSON.stringify([regular, bold]))), true);
  assert.equal(fontOptions([regular, bold]).filter((font) => font.family === 'Brand Serif').length, 1);
});

test('font import rejects renamed content, truncated files, wrong extensions and oversized uploads', async () => {
  await assert.rejects(importCustomFont(new File(['<script>alert(1)</script>'], 'fake.woff2'), 'Brand', '400', 'normal'), /not a valid/);
  await assert.rejects(importCustomFont(new File([inter.subarray(0, 100)], 'cut.woff2'), 'Brand', '400', 'normal'), /not a valid/);
  await assert.rejects(importCustomFont(new File([inter], 'wrong.ttf'), 'Brand', '400', 'normal'), /file extension/);
  await assert.rejects(importCustomFont(new File([new Uint8Array(MAX_FONT_BYTES + 1)], 'huge.woff2'), 'Brand', '400', 'normal'), /3 MB/);
  assert.equal(validateCustomFont(custom({ dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' })), false);
});

test('reserved font names and CSS injection cannot override bundled or system fonts', async () => {
  for (const family of ['Inter', 'INTER', 'Arial', 'system-ui', 'inherit', 'Brand";}body{color:red}', ' Brand', 'A'.repeat(65)])
    assert.equal(isValidCustomFontFamily(family), false, family);
  assert.equal(isValidCustomFontFamily('My Brand-2'), true);
  await assert.rejects(importCustomFont(new File([inter], 'brand.woff2'), 'Inter', '400', 'normal'), /unique name/);
  assert.equal(validateCustomFont(custom({ weight: '400; color:red' })), false);
  assert.equal(validateCustomFont(custom({ format: '__proto__' })), false);
});

test('imported project font collections have bounded sizes and no duplicate identifiers or faces', () => {
  assert.equal(validateCustomFontCollection([custom(), custom({ id: 'other' })]), false);
  assert.equal(validateCustomFontCollection([custom(), custom({ family: 'Other' })]), false);
  const tooMany = Array.from({ length: MAX_CUSTOM_FONTS + 1 }, (_, n) => custom({ id: `font-${n}`, family: `Brand ${n}` }));
  assert.equal(validateCustomFontCollection(tooMany), false);
  // A structurally plausible container must still be rejected when its persisted collection exceeds the cap.
  const padded = Buffer.alloc(1024 * 1024);
  inter.copy(padded); padded.writeUInt32BE(padded.length, 8);
  const manyLarge = Array.from({ length: MAX_CUSTOM_FONT_BYTES / padded.length + 1 }, (_, n) =>
    custom({ id: `large-${n}`, family: `Large ${n}`, dataUrl: `data:font/woff2;base64,${padded.toString('base64')}` }));
  assert.equal(validateCustomFontCollection(manyLarge), false);
});

test('nested groups and selected-character styles contribute font families for loading and export', () => {
  const scene = { objects: [{ type: 'group', objects: [{ type: 'Textbox', fontFamily: 'Inter', styles: { 0: { 3: { fontFamily: 'My Brand' } } } }] }] };
  assert.deepEqual(canvasFontFamilies(scene).sort(), ['Inter', 'My Brand']);
  const cyclic = { fontFamily: 'Lora' }; cyclic.objects = [cyclic];
  assert.deepEqual(canvasFontFamilies(cyclic), ['Lora']);
});

test('SVG exports embed used custom font faces, excluding unused font bytes', async () => {
  const used = custom(), unused = custom({ id: 'unused', family: 'Unused Brand' });
  const svg = await embedFontsInSVG('<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>',
    { fontFamily: 'Arial', styles: { 0: { 0: { fontFamily: used.family } } } }, [used, unused]);
  assert.ok(svg.includes('@font-face'));
  assert.ok(svg.includes(used.dataUrl));
  assert.ok(svg.includes('font-family:"My Brand"'));
  assert.ok(!svg.includes('Unused Brand'));
  assert.ok(svg.includes('<text>Hello</text>'));
});
