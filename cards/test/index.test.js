import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TTL_DAYS } from '../src/index.js';

function kv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).body : null; },
    async put(k, body, opts) { m.set(k, { body, opts }); },
  };
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer;
const env = () => ({ CARDS: kv(), UPLOAD_SECRET: 's3cret' });
const req = (method, path, init = {}) => new Request(`https://cards.example${path}`, { method, ...init });

test('upload needs the secret', async () => {
  const e = env();
  const r = await handle(req('PUT', '/c/B0TEST.jpg', { body: JPEG, headers: { Authorization: 'Bearer nope' } }), e);
  assert.equal(r.status, 401);
  assert.equal(e.CARDS.m.size, 0);
});

test('upload stores a JPEG with a TTL and returns its public URL', async () => {
  const e = env();
  const r = await handle(req('PUT', '/c/B0TEST-1.jpg', { body: JPEG, headers: { Authorization: 'Bearer s3cret' } }), e);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).url, 'https://cards.example/c/B0TEST-1.jpg');
  assert.equal(e.CARDS.m.get('B0TEST-1').opts.expirationTtl, TTL_DAYS * 86400);
});

test('rejects non-JPEG bodies', async () => {
  const r = await handle(req('PUT', '/c/x.jpg', { body: 'hello', headers: { Authorization: 'Bearer s3cret' } }), env());
  assert.equal(r.status, 400);
});

test('serves stored images publicly, 404 otherwise', async () => {
  const e = env();
  await e.CARDS.put('abc', JPEG, {});
  const ok = await handle(req('GET', '/c/abc.jpg'), e);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Type'), 'image/jpeg');
  assert.equal((await handle(req('GET', '/c/missing.jpg'), e)).status, 404);
  assert.equal((await handle(req('GET', '/c/../etc.jpg'), e)).status, 404);
  assert.equal((await handle(req('DELETE', '/c/abc.jpg'), e)).status, 405);
});
