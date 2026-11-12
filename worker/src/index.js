/**
 * Comment-to-DM webhook for Instagram + Facebook Page comments (Cloudflare Workers free tier).
 *
 * Flow: Meta webhook (POST) -> verify X-Hub-Signature-256 -> 200 OK immediately ->
 *       (in ctx.waitUntil) for each comment containing KEYWORD:
 *         look up the post -> deal link in Firestore (ig_media/{mediaId} or fb_posts/{postId})
 *         send ONE private reply DM to the commenter (Meta allows one per comment, within 7 days)
 *         post a short public reply under the comment
 *
 * Env vars (wrangler.toml [vars]):  KEYWORD, GRAPH_VERSION, IG_USER_ID, PAGE_ID,
 *                                   FIREBASE_PROJECT_ID, FALLBACK_URL
 * Secrets (wrangler secret put):    APP_SECRET, VERIFY_TOKEN, PAGE_ACCESS_TOKEN, FIREBASE_WEB_API_KEY
 * Optional KV binding:              DEDUPE  (prevents double DMs when Meta retries a webhook)
 */

const DISCLOSURE = '#ad As an Amazon Associate I earn from qualifying purchases.';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/webhook') return new Response('Not found', { status: 404 });

    if (request.method === 'GET') return handleVerify(url, env);
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const raw = await request.text();
    const ok = await verifySignature(raw, request.headers.get('x-hub-signature-256'), env.APP_SECRET);
    if (!ok) return new Response('Invalid signature', { status: 401 });

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }
    // Acknowledge fast; Meta retries (and eventually disables) slow webhooks.
    ctx.waitUntil(processPayload(payload, env).catch((e) => console.error('process failed', e)));
    return new Response('EVENT_RECEIVED', { status: 200 });
  },
};

export function handleVerify(url, env) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && env.VERIFY_TOKEN && timingSafeEqual(token, env.VERIFY_TOKEN)) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, header.toLowerCase());
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Normalise IG + FB webhook shapes into {platform, commentId, postId, fromId, text}. */
export function extractComments(payload, env) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (payload.object === 'instagram' && change.field === 'comments') {
        out.push({
          platform: 'instagram',
          commentId: v.id,
          postId: v.media?.id,
          fromId: v.from?.id,
          text: v.text ?? '',
          ownerId: entry.id,
        });
      } else if (payload.object === 'page' && change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        out.push({
          platform: 'facebook',
          commentId: v.comment_id,
          postId: v.post_id,
          fromId: v.from?.id,
          text: v.message ?? '',
          ownerId: entry.id,
        });
      }
    }
  }
  // Ignore our own replies (prevents reply loops) and malformed events.
  const own = new Set([env.IG_USER_ID, env.PAGE_ID].filter(Boolean));
  return out.filter((c) => c.commentId && c.postId && c.fromId && !own.has(c.fromId) && c.fromId !== c.ownerId);
}

export function matchesKeyword(text, keywords = 'DEAL') {
  const words = String(keywords).split(',').map((k) => k.trim()).filter(Boolean);
  return words.some((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}($|[^\\p{L}\\p{N}])`, 'iu').test(text));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function lookupDeal(env, platform, postId) {
  const coll = platform === 'instagram' ? 'ig_media' : 'fb_posts';
  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
    `${coll}/${encodeURIComponent(postId)}?key=${env.FIREBASE_WEB_API_KEY}`;
  const res = await fetch(docUrl);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const doc = await res.json();
  const f = doc.fields ?? {};
  const link = f.url?.stringValue;
  if (!link || !/^https:\/\/www\.amazon\.(in|com)\/dp\/[A-Z0-9]{10}\/\?tag=/.test(link)) return null;
  return { url: link, title: f.title?.stringValue ?? 'Your deal' };
}

export function buildDm(deal, env) {
  if (!deal) {
    return `Thanks for commenting! This deal has expired, but you can find today's live deals here: ${env.FALLBACK_URL}\n\n${DISCLOSURE}`;
  }
  const title = deal.title.length > 100 ? deal.title.slice(0, 99) + '…' : deal.title;
  return `Here's your link 🛒\n${title}\n${deal.url}\n\nPrices can change anytime.\n${DISCLOSURE}`;
}

async function graphPost(env, path, body) {
  const host = env.GRAPH_HOST || 'https://graph.facebook.com';
  const res = await fetch(`${host}/${env.GRAPH_VERSION || 'v26.0'}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PAGE_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = new Error(`Graph ${res.status}: ${json.error?.message ?? 'unknown error'}`);
    err.code = json.error?.code;
    throw err;
  }
  return json;
}

export async function sendPrivateReply(env, c, text) {
  // Private Replies: recipient is the COMMENT id, sent from the IG account / Page.
  const sender = c.platform === 'instagram' ? env.IG_USER_ID : env.PAGE_ID;
  return graphPost(env, `${sender}/messages`, { recipient: { comment_id: c.commentId }, message: { text } });
}

export async function sendPublicReply(env, c, message) {
  const edge = c.platform === 'instagram' ? 'replies' : 'comments';
  return graphPost(env, `${c.commentId}/${edge}`, { message });
}

export async function processPayload(payload, env) {
  const results = [];
  for (const c of extractComments(payload, env)) {
    if (!matchesKeyword(c.text, env.KEYWORD)) continue;

    const dedupeKey = `c:${c.commentId}`;
    if (env.DEDUPE) {
      if (await env.DEDUPE.get(dedupeKey)) {
        results.push({ commentId: c.commentId, skipped: 'duplicate' });
        continue;
      }
      // claim first: Meta may redeliver while we are still working
      await env.DEDUPE.put(dedupeKey, '1', { expirationTtl: 7 * 24 * 3600 });
    }

    let deal = null;
    try {
      deal = await lookupDeal(env, c.platform, c.postId);
    } catch (e) {
      console.error('lookup failed', c.postId, e.message);
    }

    const r = { commentId: c.commentId, platform: c.platform, dm: false, publicReply: false };
    try {
      await sendPrivateReply(env, c, buildDm(deal, env));
      r.dm = true;
    } catch (e) {
      r.dmError = e.message;
      console.error('private reply failed', c.commentId, e.message);
    }
    try {
      await sendPublicReply(env, c, r.dm ? 'Sent you a DM 📩 Check your message requests!' : 'Grab it from the link in our bio 🔗');
      r.publicReply = true;
    } catch (e) {
      r.replyError = e.message;
      console.error('public reply failed', c.commentId, e.message);
    }
    results.push(r);
  }
  return results;
}
