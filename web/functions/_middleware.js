// Send the old pages.dev address and www to https://cartcrush.in (301, keeps the path and query).
// Branch previews (<hash>.cartcrush.pages.dev) are left alone. Search Console verification files
// (/google<token>.html) stay reachable on every host so the old property stays verified, which the
// Change of Address move needs.
const CANONICAL = "cartcrush.in";
const OLD_HOSTS = new Set(["cartcrush.pages.dev", "www.cartcrush.in"]);
const VERIFICATION = /^\/(google[0-9a-f]+)(?:\.html)?$/;
// Only our own Search Console tokens (the files in public/); any other name falls through.
const TOKENS = new Set(["google3d64a905e63c6b6a", "googlecb95d0553787210d"]);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  // Answer Search Console's file check here, on every host: Pages would 308 /x.html to /x, and a
  // redirect to another domain fails verification.
  const token = url.pathname.match(VERIFICATION);
  if (token && TOKENS.has(token[1])) {
    return new Response(`google-site-verification: ${token[1]}.html`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (OLD_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
