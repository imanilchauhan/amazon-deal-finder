import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import worker, {
  buildDm,
  extractComments,
  matchesKeyword,
  processPayload,
  verifySignature,
} from '../src/index.js';

const ENV = {
  APP_SECRET: 'app-secret',
  VERIFY_TOKEN: 'verify-me',
  PAGE_ACCESS_TOKEN: 'PAGE_TOKEN',
  IG_USER_ID: '1784000000',
  PAGE_ID: '1020000000',
  FIREBASE_PROJECT_ID: 'deals-demo',
  FIREBASE_WEB_API_KEY: 'web-key',
  KEYWORD: 'DEAL',
  GRAPH_VERSION: 'v26.0',
  FALLBACK_URL: 'https://deals.example.app',
};

const DEAL_URL = 'https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21';

function igPayload({ text = 'DEAL please', from = '9001', commentId = 'C1', mediaId = 'M1' } = {}) {
  return {
    object: 'instagram',
    entry: [{
      id: ENV.IG_USER_ID,
      time: 1762340000,
      changes: [{ field: 'comments', value: { id: commentId, text, from: { id: from, username: 'buyer' }, media: { id: mediaId } } }],
    }],
  };
}

function fbPayload({ message = 'deal', from = '7001', verb = 'add' } = {}) {
  return {
    object: 'page',
    entry: [{
      id: ENV.PAGE_ID,
      changes: [{ field: 'feed', value: { item: 'comment', verb, comment_id: 'P_C9', post_id: '1020000000_55', from: { id: from }, message } }],
    }],
  };
}

async function sign(body, secret = ENV.APP_SECRET) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return 'sha256=' + Buffer.from(sig).toString('hex');
}

// ---- fetch mock ------------------------------------------------------------
let calls;
let routes;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  routes = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes.find((r) => r.match(String(url), init));
    if (!route) throw new Error(`unmocked fetch ${url}`);
    return route.respond(String(url), init);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const firestoreDoc = (status = 200) => ({
  match: (u) => u.startsWith('https://firestore.googleapis.com/'),
  respond: () => status === 200
    ? json(200, { fields: { url: { stringValue: DEAL_URL }, title: { stringValue: 'boAt Rockerz 450' }, asin: { stringValue: 'B07PR1CL3S' } } })
    : json(status, { error: { code: status } }),
});
const graphOk = { match: (u) => u.startsWith('https://graph.facebook.com/'), respond: () => json(200, { recipient_id: '1', message_id: 'm', id: 'r' }) };

function fakeCtx() {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), flush: () => Promise.all(pending) };
}

// ---- tests -----------------------------------------------------------------
describe('webhook verification (GET)', () => {
  it('echoes the challenge for the right token', async () => {
    const res = await worker.fetch(new Request('https://w.dev/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'), ENV, fakeCtx());
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '12345');
  });
  it('rejects a wrong token', async () => {
    const res = await worker.fetch(new Request('https://w.dev/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'), ENV, fakeCtx());
    assert.equal(res.status, 403);
  });
  it('404s other paths', async () => {
    assert.equal((await worker.fetch(new Request('https://w.dev/'), ENV, fakeCtx())).status, 404);
  });
});

describe('signature', () => {
  it('accepts a valid HMAC and rejects tampering', async () => {
    const body = JSON.stringify(igPayload());
    assert.equal(await verifySignature(body, await sign(body), ENV.APP_SECRET), true);
    assert.equal(await verifySignature(body + ' ', await sign(body), ENV.APP_SECRET), false);
    assert.equal(await verifySignature(body, await sign(body, 'other'), ENV.APP_SECRET), false);
    assert.equal(await verifySignature(body, null, ENV.APP_SECRET), false);
  });
  it('POST with bad signature is 401 and does nothing', async () => {
    const body = JSON.stringify(igPayload());
    const ctx = fakeCtx();
    const res = await worker.fetch(new Request('https://w.dev/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=deadbeef' } }), ENV, ctx);
    assert.equal(res.status, 401);
    await ctx.flush();
    assert.equal(calls.length, 0);
  });
});

describe('keyword matching', () => {
  for (const [text, want] of [
    ['DEAL', true], ['deal pls 🙏', true], ['Deal!', true], ['send deal', true],
    ['ideal', false], ['dealer', false], ['', false], ['DEALS', false],
  ]) {
    it(`${JSON.stringify(text)} -> ${want}`, () => assert.equal(matchesKeyword(text, 'DEAL'), want));
  }
  it('supports comma-separated keywords', () => assert.equal(matchesKeyword('LINK please', 'DEAL, LINK'), true));
});

describe('extractComments', () => {
  it('normalises IG and FB payloads', () => {
    assert.deepEqual(extractComments(igPayload(), ENV)[0], {
      platform: 'instagram', commentId: 'C1', postId: 'M1', fromId: '9001', text: 'DEAL please', ownerId: ENV.IG_USER_ID,
    });
    assert.equal(extractComments(fbPayload(), ENV)[0].postId, '1020000000_55');
  });
  it('ignores our own comments, edits/removals and other fields', () => {
    assert.equal(extractComments(igPayload({ from: ENV.IG_USER_ID }), ENV).length, 0);
    assert.equal(extractComments(fbPayload({ from: ENV.PAGE_ID }), ENV).length, 0);
    assert.equal(extractComments(fbPayload({ verb: 'remove' }), ENV).length, 0);
    assert.equal(extractComments({ object: 'instagram', entry: [{ changes: [{ field: 'mentions', value: {} }] }] }, ENV).length, 0);
  });
});

describe('end-to-end POST', () => {
  it('IG comment "DEAL" -> private reply with affiliate link + public reply', async () => {
    routes.push(firestoreDoc(), graphOk);
    const body = JSON.stringify(igPayload());
    const ctx = fakeCtx();
    const res = await worker.fetch(new Request('https://w.dev/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': await sign(body) } }), ENV, ctx);
    assert.equal(res.status, 200);
    await ctx.flush();

    const [lookup, dm, reply] = calls;
    assert.match(lookup.url, /documents\/ig_media\/M1\?key=web-key$/);
    assert.equal(dm.url, 'https://graph.facebook.com/v26.0/1784000000/messages');
    assert.deepEqual(dm.body.recipient, { comment_id: 'C1' });
    assert.match(dm.body.message.text, /amazon\.in\/dp\/B07PR1CL3S\/\?tag=mytag-21/);
    assert.match(dm.body.message.text, /#ad/);
    assert.equal(dm.init.headers.Authorization, 'Bearer PAGE_TOKEN');
    assert.equal(reply.url, 'https://graph.facebook.com/v26.0/C1/replies');
    assert.match(reply.body.message, /DM/);
  });

  it('FB comment uses Page messages + /comments edge and fb_posts mapping', async () => {
    routes.push(firestoreDoc(), graphOk);
    const results = await processPayload(fbPayload(), ENV);
    assert.equal(results[0].dm, true);
    assert.match(calls[0].url, /documents\/fb_posts\/1020000000_55/);
    assert.equal(calls[1].url, 'https://graph.facebook.com/v26.0/1020000000/messages');
    assert.equal(calls[2].url, 'https://graph.facebook.com/v26.0/P_C9/comments');
  });

  it('non-matching comment triggers no API calls', async () => {
    const results = await processPayload(igPayload({ text: 'nice headphones' }), ENV);
    assert.deepEqual(results, []);
    assert.equal(calls.length, 0);
  });

  it('unknown post -> DM with fallback link', async () => {
    routes.push(firestoreDoc(404), graphOk);
    await processPayload(igPayload(), ENV);
    assert.match(calls[1].body.message.text, /deals\.example\.app/);
  });

  it('Firestore outage still answers with fallback', async () => {
    routes.push(firestoreDoc(503), graphOk);
    const [r] = await processPayload(igPayload(), ENV);
    assert.equal(r.dm, true);
    assert.match(calls[1].body.message.text, /deals\.example\.app/);
  });

  it('DM failure (e.g. >7 days old) still posts a public fallback reply', async () => {
    routes.push(firestoreDoc(), {
      match: (u) => u.endsWith('/messages'),
      respond: () => json(400, { error: { message: 'This message is sent outside of allowed window.', code: 10 } }),
    }, graphOk);
    const [r] = await processPayload(igPayload(), ENV);
    assert.equal(r.dm, false);
    assert.match(r.dmError, /outside of allowed window/);
    assert.equal(r.publicReply, true);
    assert.match(calls[2].body.message, /bio/);
  });

  it('KV dedupe prevents a second DM for a redelivered webhook', async () => {
    routes.push(firestoreDoc(), graphOk);
    const kv = new Map();
    const env = { ...ENV, DEDUPE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
    await processPayload(igPayload(), env);
    const n = calls.length;
    const [second] = await processPayload(igPayload(), env);
    assert.equal(second.skipped, 'duplicate');
    assert.equal(calls.length, n);
  });

  it('rejects tampered Firestore links', async () => {
    routes.push({
      match: (u) => u.startsWith('https://firestore'),
      respond: () => json(200, { fields: { url: { stringValue: 'https://evil.example/phish' }, title: { stringValue: 'x' } } }),
    }, graphOk);
    await processPayload(igPayload(), ENV);
    assert.doesNotMatch(calls[1].body.message.text, /evil/);
  });
});

describe('buildDm', () => {
  it('truncates long titles and always includes disclosure', () => {
    const text = buildDm({ title: 'x'.repeat(300), url: DEAL_URL }, ENV);
    assert.ok(text.includes('…'));
    assert.ok(text.includes('Amazon Associate'));
  });
});
