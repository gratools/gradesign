import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCollaborationToken } from '../src/auth.mjs';

const secret = 'development-test-secret-at-least-32-characters';
const now = 1000;
function token(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
const valid = { sub: 'alice', designId: 'design-1', permission: 'edit', exp: 1300 };

test('valid room-scoped editor token is accepted', () => {
  assert.deepEqual(verifyCollaborationToken(token(valid), 'design-1', secret, now), valid);
});

test('wrong room, viewer role, expiry, excessive TTL and forged signatures are rejected', () => {
  assert.throws(() => verifyCollaborationToken(token(valid), 'design-2', secret, now));
  for (const claims of [
    { ...valid, permission: 'view' },
    { ...valid, exp: now },
    { ...valid, exp: now + 601 },
    { ...valid, sub: '' },
  ]) assert.throws(() => verifyCollaborationToken(token(claims), 'design-1', secret, now));
  assert.throws(() => verifyCollaborationToken(token(valid) + 'a', 'design-1', secret, now));
  assert.throws(() => verifyCollaborationToken('malformed', 'design-1', secret, now));
});
