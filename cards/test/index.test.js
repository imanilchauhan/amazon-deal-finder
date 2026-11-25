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

const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 9, 8, 7, 6]).buffer;
const auth = { Authorization: 'Bearer s3cret' };

test('videos: stores an MP4 next to the card and serves it as video/mp4', async () => {
  const e = env();
  const r = await handle(req('PUT', '/c/B0TEST-1-instagram-reel.mp4', { body: MP4, headers: auth }), e);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).url, 'https://cards.example/c/B0TEST-1-instagram-reel.mp4');
  assert.ok(e.CARDS.m.has('B0TEST-1-instagram-reel.mp4'));
  const g = await handle(req('GET', '/c/B0TEST-1-instagram-reel.mp4'), e);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('Content-Type'), 'video/mp4');
  assert.equal(g.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await g.arrayBuffer()).byteLength, 16);
});

test('videos: range requests get 206 with the slice', async () => {
  const e = env();
  await handle(req('PUT', '/c/v.mp4', { body: MP4, headers: auth }), e);
  const r = await handle(req('GET', '/c/v.mp4', { headers: { Range: 'bytes=4-7' } }), e);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 4-7/16');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [0x66, 0x74, 0x79, 0x70]);
  const bad = await handle(req('GET', '/c/v.mp4', { headers: { Range: 'bytes=99-' } }), e);
  assert.equal(bad.status, 416);
});

test('videos: a JPEG is not accepted as an MP4, and a video name does not shadow a card', async () => {
  const e = env();
  const r = await handle(req('PUT', '/c/x.mp4', { body: JPEG, headers: auth }), e);
  assert.equal(r.status, 400);
  await handle(req('PUT', '/c/x.jpg', { body: JPEG, headers: auth }), e);
  assert.equal((await handle(req('GET', '/c/x.mp4'), e)).status, 404);
});

test('catalog: PUT needs the secret, GET is public JSON with CORS', async () => {
  const e = env();
  const body = new TextEncoder().encode('{"deals":{}}').buffer;
  assert.equal((await handle(req('PUT', '/catalog.json', { body }), e)).status, 401);
  assert.equal((await handle(req('GET', '/catalog.json'), e)).status, 404);
  const put = await handle(req('PUT', '/catalog.json', { body, headers: auth }), e);
  assert.equal(put.status, 200);
  const r = await handle(req('GET', '/catalog.json'), e);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await r.json(), { deals: {} });
  const bad = await handle(req('PUT', '/catalog.json', { body: JPEG, headers: auth }), e);
  assert.equal(bad.status, 400);
});

test('music: MP3 upload needs the secret; GET is public audio/mpeg with CORS', async () => {
  const e = env();
  const mp3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2]).buffer;
  assert.equal((await handle(req('PUT', '/m/gadget.mp3', { body: mp3 }), e)).status, 401);
  assert.equal((await handle(req('PUT', '/m/gadget.mp3', { body: JPEG, headers: auth }), e)).status, 400);
  assert.equal((await handle(req('PUT', '/m/gadget.mp3', { body: mp3, headers: auth }), e)).status, 201);
  const r = await handle(req('GET', '/m/gadget.mp3'), e);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await handle(req('GET', '/m/../x.mp3'), e)).status, 404);
});
