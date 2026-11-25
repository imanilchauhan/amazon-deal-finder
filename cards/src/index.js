// CartCrush card host: deal card images and Reel videos for the social posts, plus the product cache.
//   GET /catalog.json public, PUT /catalog.json with the secret (see backend/deal_finder/catalog.py)
//   PUT /c/<name>.jpg | .mp4  (Authorization: Bearer UPLOAD_SECRET)  stores the file for TTL_DAYS
//   GET /c/<name>.jpg | .mp4  public, so Zernio, Buffer and Meta can fetch it (videos support Range)
// Storage is Workers KV (free tier: 1 GB, 1,000 writes a day, 25 MB a value; we write ~30 a day).

export const TTL_DAYS = 14;
export const MAX_BYTES = 4 * 1024 * 1024;        // cards
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // reels (an 8 s reel is ~2–6 MB)
const NAME = /^\/c\/([A-Za-z0-9_-]{1,80})\.(jpg|mp4)$/;

const KINDS = {
  jpg: { type: 'image/jpeg', max: MAX_BYTES, key: (n) => n, ok: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  // MP4: bytes 4–7 are "ftyp"
  mp4: { type: 'video/mp4', max: MAX_VIDEO_BYTES, key: (n) => `${n}.mp4`, ok: (h) => h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70 },
};

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Parse a single "bytes=a-b" range against `size`; null when absent or unusable. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

export const MAX_CATALOG_BYTES = 20 * 1024 * 1024;
const CATALOG_KEY = 'catalog:v1';
const CORS = { 'Access-Control-Allow-Origin': '*' };

// Product cache (backend/deal_finder/catalog.py writes it after each scrape; the site build and
// the admin read it instead of Firestore). The Worker only stores and serves the bytes.
async function catalog(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = await env.CARDS.get(CATALOG_KEY, 'arrayBuffer');
    if (!body) return new Response('Not found', { status: 404, headers: CORS });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': String(body.byteLength) },
    });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD' } });
  }
  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || '';
    if (!env.UPLOAD_SECRET || !timingSafeEqual(auth, `Bearer ${env.UPLOAD_SECRET}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await request.arrayBuffer();
    const first = new Uint8Array(body.slice(0, 1))[0];
    if (body.byteLength === 0 || body.byteLength > MAX_CATALOG_BYTES || first !== 0x7b /* { */) {
      return new Response('Expected a JSON object under 20 MB', { status: 400 });
    }
    await env.CARDS.put(CATALOG_KEY, body);
    return new Response(JSON.stringify({ bytes: body.byteLength }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, PUT' } });
}

// Background music for deal videos (royalty-free tracks; see backend/deal_finder/music.py).
export const MAX_MUSIC_BYTES = 5 * 1024 * 1024;
const MUSIC = /^\/m\/([a-z0-9-]{1,40})\.mp3$/;

async function music(request, env, name) {
  const key = `music:${name}`;
  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = await env.CARDS.get(key, 'arrayBuffer');
    if (!body) return new Response('Not found', { status: 404, headers: CORS });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'Content-Length': String(body.byteLength) },
    });
  }
  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || '';
    if (!env.UPLOAD_SECRET || !timingSafeEqual(auth, `Bearer ${env.UPLOAD_SECRET}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await request.arrayBuffer();
    const h = new Uint8Array(body.slice(0, 3));
    const isMp3 = (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0);
    if (body.byteLength === 0 || body.byteLength > MAX_MUSIC_BYTES || !isMp3) {
      return new Response('Expected an MP3 under 5 MB', { status: 400 });
    }
    await env.CARDS.put(key, body);
    return new Response(JSON.stringify({ url: `${new URL(request.url).origin}/m/${name}.mp3` }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, PUT' } });
}

export async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/catalog.json') return catalog(request, env);
  const mm = url.pathname.match(MUSIC);
  if (mm) return music(request, env, mm[1]);
  const m = url.pathname.match(NAME);
  if (!m) return new Response('Not found', { status: 404 });
  const [, name, ext] = m;
  const kind = KINDS[ext];
  const key = kind.key(name);

  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = await env.CARDS.get(key, 'arrayBuffer');
    if (!body) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': kind.type,
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
    };
    const range = parseRange(request.headers.get('Range'), body.byteLength);
    if (range && range.invalid) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${body.byteLength}` } });
    }
    if (range) {
      const part = body.slice(range.start, range.end + 1);
      return new Response(request.method === 'HEAD' ? null : part, {
        status: 206,
        headers: { ...headers, 'Content-Length': String(part.byteLength), 'Content-Range': `bytes ${range.start}-${range.end}/${body.byteLength}` },
      });
    }
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...headers, 'Content-Length': String(body.byteLength) },
    });
  }

  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || '';
    if (!env.UPLOAD_SECRET || !timingSafeEqual(auth, `Bearer ${env.UPLOAD_SECRET}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await request.arrayBuffer();
    const head = new Uint8Array(body.slice(0, 8));
    if (body.byteLength === 0 || body.byteLength > kind.max || !kind.ok(head)) {
      return new Response(ext === 'jpg' ? 'Expected a JPEG under 4 MB' : 'Expected an MP4 under 20 MB', { status: 400 });
    }
    await env.CARDS.put(key, body, { expirationTtl: TTL_DAYS * 86400 });
    return new Response(JSON.stringify({ url: `${url.origin}/c/${name}.${ext}` }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, PUT' } });
}

export default { fetch: handle };
