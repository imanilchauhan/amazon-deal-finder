// CartCrush card host: deal card images for Instagram posts.
//   PUT /c/<name>.jpg  (Authorization: Bearer UPLOAD_SECRET)  stores a JPEG for TTL_DAYS
//   GET /c/<name>.jpg  public, so Buffer and Instagram can fetch it
// Storage is Workers KV (free tier: 1 GB, 1,000 writes a day; we write ~14 a day).

export const TTL_DAYS = 14;
export const MAX_BYTES = 4 * 1024 * 1024;
const NAME = /^\/c\/([A-Za-z0-9_-]{1,80})\.jpg$/;

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const m = url.pathname.match(NAME);
  if (!m) return new Response('Not found', { status: 404 });
  const key = m[1];

  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = await env.CARDS.get(key, 'arrayBuffer');
    if (!body) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || '';
    if (!env.UPLOAD_SECRET || !timingSafeEqual(auth, `Bearer ${env.UPLOAD_SECRET}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await request.arrayBuffer();
    const head = new Uint8Array(body.slice(0, 3));
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
      return new Response('Expected a JPEG under 4 MB', { status: 400 });
    }
    await env.CARDS.put(key, body, { expirationTtl: TTL_DAYS * 86400 });
    return new Response(JSON.stringify({ url: `${url.origin}/c/${key}.jpg` }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, PUT' } });
}

export default { fetch: handle };
