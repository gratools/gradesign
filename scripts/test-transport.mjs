/**
 * Opt-in integration smoke test; start `pnpm dev:collab` separately first.
 * Run from the repository root: node scripts/test-transport.mjs
 * Uses a disposable random room on ws://127.0.0.1:1234 by default.
 * COLLAB_SMOKE_URL and COLLAB_SMOKE_ORIGIN override the local endpoint/origin.
 * This checks the unauthenticated loopback development service, not a hosted
 * room. It does not start or stop the collaboration service.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyPageChanges, readPages } from '../packages/collaboration/src/document.mjs';

// Resolve each dependency from its owning workspace. Import the ES modules so
// the provider and document adapter share the same Yjs constructor instance.
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const requireCollaboration = createRequire(new URL('../packages/collaboration/package.json', import.meta.url));
async function importModule(requireFrom, name) {
  const manifestPath = requireFrom.resolve(`${name}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return import(pathToFileURL(resolve(dirname(manifestPath), manifest.module)).href);
}
const [{ WebsocketProvider }, Y] = await Promise.all([
  importModule(requireWeb, 'y-websocket'),
  importModule(requireCollaboration, 'yjs'),
]);
const { WebSocket } = requireCollaboration('ws');
const serverUrl = process.env.COLLAB_SMOKE_URL ?? 'ws://127.0.0.1:1234';
const origin = process.env.COLLAB_SMOKE_ORIGIN ?? 'http://localhost:3000';
const room = `transport-smoke-${randomUUID()}`;
const timeoutMs = 8000;

class BrowserWebSocket extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols, { origin });
  }
}

function eventually(observable, event, predicate, label) {
  return new Promise((resolveWait, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      observable.off(event, check);
    };
    const check = () => {
      try {
        if (!predicate()) return;
        cleanup();
        resolveWait();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out: ${label}. Is the local collaboration service running?`));
    }, timeoutMs);
    observable.on(event, check);
    check();
  });
}

async function checkRejectedOrigin() {
  await new Promise((resolveCheck, reject) => {
    const socket = new WebSocket(`${serverUrl}/${room}`, { origin: 'https://untrusted-origin.invalid' });
    let rejected = false;
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('Timed out waiting for unauthorized Origin rejection'));
    }, timeoutMs);
    socket.once('open', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('Server unexpectedly accepted an unauthorized Origin'));
    });
    socket.once('unexpected-response', (_request, response) => {
      rejected = true;
      clearTimeout(timer);
      response.resume();
      socket.terminate();
      try {
        assert.equal(response.statusCode, 401);
        resolveCheck();
      } catch (error) { reject(error); }
    });
    socket.on('error', () => {}); // terminate() after HTTP rejection emits error.
    socket.once('close', () => {
      clearTimeout(timer);
      if (!rejected) reject(new Error('Socket closed without the expected HTTP 401 response'));
    });
  });
}

const docs = [new Y.Doc(), new Y.Doc()];
const providers = docs.map(doc => new WebsocketProvider(serverUrl, room, doc, {
  connect: false,
  disableBc: true,
  WebSocketPolyfill: BrowserWebSocket,
}));

async function connectBoth() {
  const syncs = providers.map((provider, index) => eventually(provider, 'sync', () => provider.synced, `client ${index + 1} initial sync`));
  providers.forEach(provider => provider.connect());
  await Promise.all(syncs);
}

try {
  await connectBoth();
  console.log('PASS two clients completed the real WebSocket/Yjs handshake');

  const seed = [{ id: 'page-1', name: 'Transport test', canvas: { version: '6.9.0', objects: [
    { id: 'heading', type: 'Textbox', text: 'Hello', left: 10, fill: '#000000' },
    { id: 'shape', type: 'Rect', left: 30, fill: '#ff0000' },
  ] } }];
  const receivedSeed = eventually(docs[1], 'update', () => readPages(docs[1]).length === 1, 'client 2 receives seeded page');
  applyPageChanges(docs[0], [], seed);
  await receivedSeed;
  assert.deepEqual(readPages(docs[1]), seed);
  console.log('PASS page and object state travelled from client 1 to client 2');

  const receivedAwareness = eventually(providers[1].awareness, 'change', () => {
    const state = providers[1].awareness.getStates().get(docs[0].clientID);
    return state?.user?.name === 'Transport Alice' && state?.cursor?.x === 120 && state?.cursor?.pageId === 'page-1';
  }, 'remote awareness and cursor');
  providers[0].awareness.setLocalStateField('user', { name: 'Transport Alice', color: '#8b5cf6' });
  providers[0].awareness.setLocalStateField('cursor', { pageId: 'page-1', x: 120, y: 80 });
  await receivedAwareness;
  console.log('PASS collaborator presence and cursor travelled over the socket');

  // Disconnect first to make these changes truly concurrent. No BroadcastChannel
  // is available, so the server must merge both clients after reconnection.
  providers.forEach(provider => provider.disconnect());
  const alice = structuredClone(seed);
  const bob = structuredClone(seed);
  alice[0].canvas.objects[0].text = 'Alice wrote this';
  alice[0].canvas.objects[0].left = 100;
  bob[0].canvas.objects[1].fill = '#00ff00';
  bob[0].canvas.objects[0].fill = '#123456';
  applyPageChanges(docs[0], seed, alice);
  applyPageChanges(docs[1], seed, bob);
  const merged = docs.map(doc => eventually(doc, 'update', () => {
    const objects = readPages(doc)[0]?.canvas.objects;
    return objects?.[0]?.text === 'Alice wrote this' && objects[0].left === 100
      && objects[0].fill === '#123456' && objects[1]?.fill === '#00ff00';
  }, 'concurrent edits converge after reconnect'));
  await connectBoth();
  await Promise.all(merged);
  assert.deepEqual(readPages(docs[0]), readPages(docs[1]));
  console.log('PASS independent-object and same-object property edits converged after reconnect');

  await checkRejectedOrigin();
  console.log('PASS unauthorized Origin rejected with HTTP 401');
  console.log('Transport smoke test passed. Disposable clients have been closed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Transport smoke test failed');
  process.exitCode = 1;
} finally {
  providers.forEach(provider => provider.destroy());
  docs.forEach(doc => doc.destroy());
}
