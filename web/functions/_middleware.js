// Send the old pages.dev address and www to https://cartcrush.in (301, keeps the path and query).
// Branch previews (<hash>.cartcrush.pages.dev) are left alone.
const CANONICAL = "cartcrush.in";
const OLD_HOSTS = new Set(["cartcrush.pages.dev", "www.cartcrush.in"]);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
