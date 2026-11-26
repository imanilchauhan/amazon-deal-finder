// Send the old pages.dev address and www to https://cartcrush.in (301, keeps the path and query).
// Branch previews (<hash>.cartcrush.pages.dev) are left alone. Search Console verification files
// (/google<token>.html) stay reachable on every host so the old property stays verified, which the
// Change of Address move needs.
const CANONICAL = "cartcrush.in";
const OLD_HOSTS = new Set(["cartcrush.pages.dev", "www.cartcrush.in"]);
const VERIFICATION = /^\/google[0-9a-f]+\.html$/;

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD_HOSTS.has(url.hostname) && !VERIFICATION.test(url.pathname)) {
    url.hostname = CANONICAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
