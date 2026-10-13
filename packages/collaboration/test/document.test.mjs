import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { applyPageChanges, readPages, observeRemotePages, applyFontChanges, readFonts, observeRemoteFonts } from '../src/document.mjs';
import { readFileSync } from 'node:fs';

const initial = [{
  id: 'page-1', name: 'Cover',
  canvas: { version: '6.9.0', background: '#ffffff', objects: [
    { id: 'heading', type: 'Textbox', text: 'Hello', left: 10, top: 20, fill: '#000000' },
    { id: 'shape', type: 'Rect', left: 30, top: 40, fill: '#ff0000' },
  ] },
}];

function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  applyPageChanges(a, [], initial);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return [a, b];
}

function merge(a, b) {
  const fromA = Y.encodeStateAsUpdate(a);
  const fromB = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, fromB);
  Y.applyUpdate(b, fromA);
  assert.deepEqual(readPages(a), readPages(b));
}

test('concurrent edits to separate objects converge without dropping either edit', () => {
  const [a, b] = pair();
  const fromA = structuredClone(initial);
  const fromB = structuredClone(initial);
  fromA[0].canvas.objects[0].text = 'Written by Alice';
  fromB[0].canvas.objects[1].fill = '#00ff00';
  applyPageChanges(a, initial, fromA);
  applyPageChanges(b, initial, fromB);
  merge(a, b);
  const objects = readPages(a)[0].canvas.objects;
  assert.equal(objects[0].text, 'Written by Alice');
  assert.equal(objects[1].fill, '#00ff00');
  a.destroy(); b.destroy();
});

test('concurrent different-property edits on the same object both survive', () => {
  const [a, b] = pair();
  const fromA = structuredClone(initial);
  const fromB = structuredClone(initial);
  fromA[0].canvas.objects[0].left = 200;
  fromB[0].canvas.objects[0].fill = '#123456';
  applyPageChanges(a, initial, fromA);
  applyPageChanges(b, initial, fromB);
  merge(a, b);
  const object = readPages(a)[0].canvas.objects[0];
  assert.equal(object.left, 200);
  assert.equal(object.fill, '#123456');
  a.destroy(); b.destroy();
});

test('deletion wins over concurrent edits and stale snapshots do not resurrect objects', () => {
  const [a, b] = pair();
  const fromA = structuredClone(initial);
  const fromB = structuredClone(initial);
  fromA[0].canvas.objects.splice(0, 1);
  fromB[0].canvas.objects[0].text = 'Concurrent change';
  applyPageChanges(a, initial, fromA);
  applyPageChanges(b, initial, fromB);
  merge(a, b);
  assert.deepEqual(readPages(a)[0].canvas.objects.map(object => object.id), ['shape']);
  fromB[0].canvas.objects[0].left = 80;
  applyPageChanges(a, initial, fromB);
  assert.deepEqual(readPages(a)[0].canvas.objects.map(object => object.id), ['shape']);
  a.destroy(); b.destroy();
});

test('an unchanged stale property does not overwrite an already-received remote change', () => {
  const [a, b] = pair();
  const remote = structuredClone(initial);
  remote[0].canvas.objects[0].fill = '#f0f0f0';
  applyPageChanges(b, initial, remote);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  const local = structuredClone(initial);
  local[0].canvas.objects[0].left = 60;
  applyPageChanges(a, initial, local);
  const object = readPages(a)[0].canvas.objects[0];
  assert.equal(object.fill, '#f0f0f0');
  assert.equal(object.left, 60);
  a.destroy(); b.destroy();
});

test('remote observer ignores local origin and unsubscribes correctly', () => {
  const [a, b] = pair();
  let callbacks = 0;
  const unsubscribe = observeRemotePages(a, () => callbacks++);
  const local = structuredClone(initial);
  local[0].name = 'Local rename';
  applyPageChanges(a, initial, local);
  assert.equal(callbacks, 0);
  const remote = structuredClone(initial);
  remote[0].canvas.objects[1].left = 45;
  applyPageChanges(b, initial, remote);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  assert.equal(callbacks, 1);
  unsubscribe();
  remote[0].canvas.objects[1].left = 90;
  applyPageChanges(b, initial, remote);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  assert.equal(callbacks, 1);
  a.destroy(); b.destroy();
});

test('page add, rename, reorder and delete survive serialization', () => {
  const doc = new Y.Doc();
  applyPageChanges(doc, [], initial);
  const second = { id: 'page-2', name: 'Second', canvas: { objects: [] } };
  const next = [second, { ...initial[0], name: 'Updated cover' }];
  applyPageChanges(doc, initial, next);
  assert.deepEqual(readPages(doc).map(page => [page.id, page.name]), [['page-2', 'Second'], ['page-1', 'Updated cover']]);
  applyPageChanges(doc, next, [second]);
  assert.deepEqual(readPages(doc), [second]);
  doc.destroy();
});

test('invalid objects are rejected before changing the document', () => {
  const doc = new Y.Doc();
  assert.throws(() => applyPageChanges(doc, [], [{ id: 'a', name: 'a', canvas: { objects: [{ type: 'Rect' }] } }]), /stable string id/);
  assert.throws(() => applyPageChanges(doc, [], [{ id: 'a', name: 'a', canvas: { objects: [{ id: 'duplicate' }, { id: 'duplicate' }] } }]), /unique within a page/);
  assert.deepEqual(readPages(doc), []);
  doc.destroy();
});

test('presentation dimensions and per-character styles survive concurrent edits and a reopened document', () => {
  const [a, b] = pair();
  const resized = structuredClone(initial), formatted = structuredClone(initial);
  resized[0].canvas.width = 1080; resized[0].canvas.height = 1920;
  formatted[0].canvas.objects[0].styles = { 0: { 1: { fontFamily: 'Lora', fontSize: 72, fontWeight: '700', fontStyle: 'italic' } } };
  applyPageChanges(a, initial, resized); applyPageChanges(b, initial, formatted);
  merge(a, b);
  const reopened = new Y.Doc(); Y.applyUpdate(reopened, Y.encodeStateAsUpdate(a));
  const canvas = readPages(reopened)[0].canvas;
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
  assert.deepEqual(canvas.objects[0].styles, formatted[0].canvas.objects[0].styles);
  a.destroy(); b.destroy(); reopened.destroy();
});

const fontData = readFileSync(new URL('../../../apps/web/public/fonts/inter/inter-latin-400-normal.woff2', import.meta.url)).toString('base64');
const brandFont = { id: 'brand-regular', family: 'My Brand', format: 'woff2', weight: '400', style: 'normal', fileName: 'brand.woff2', dataUrl: `data:font/woff2;base64,${fontData}` };

test('custom font bytes reach another client and survive reopening independently of page JSON', () => {
  const [a, b] = pair();
  let remoteCalls = 0;
  const stop = observeRemoteFonts(b, (fonts) => { remoteCalls++; assert.deepEqual(fonts, [brandFont]); });
  applyFontChanges(a, [], [brandFont]); Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(remoteCalls, 1);
  assert.deepEqual(readFonts(b), [brandFont]);
  stop();
  const reopened = new Y.Doc(); Y.applyUpdate(reopened, Y.encodeStateAsUpdate(b));
  assert.deepEqual(readFonts(reopened), [brandFont]);
  assert.deepEqual(readPages(reopened), initial);
  a.destroy(); b.destroy(); reopened.destroy();
});

test('independent custom font additions converge and removed fonts do not reappear from stale state', () => {
  const [a, b] = pair();
  const second = { ...brandFont, id: 'brand-bold', weight: '700' };
  applyFontChanges(a, [], [brandFont]); applyFontChanges(b, [], [second]); merge(a, b);
  assert.deepEqual(readFonts(a), readFonts(b));
  assert.equal(readFonts(a).length, 2);
  const previous = readFonts(a);
  applyFontChanges(a, previous, [second]); Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  applyFontChanges(b, previous, [{ ...brandFont, fileName: 'renamed.woff2' }, second]);
  assert.deepEqual(readFonts(b), [second]);
  a.destroy(); b.destroy();
});
