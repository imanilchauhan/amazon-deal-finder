// Google AdSense, off until NEXT_PUBLIC_ADSENSE_CLIENT is set (ca-pub-…, from the approved AdSense account).
// Ads only run on pages with real original writing (guides, collections, Black Friday, home), never on
// product pages, the admin, saved deals or thin pages: AdSense does not allow ads on pages that are
// mostly affiliate links.
export const ADSENSE_CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "").trim();

/** Optional manual ad unit ids (AdSense → Ads → By ad unit). Without them, Auto ads place the ads. */
export const AD_SLOTS = {
  article: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE ?? "").trim(),
  display: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY ?? "").trim(),
};

export const adsEnabled = () => /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);

/** The ads.txt line Google needs (pub id without the "ca-" prefix). */
export function adsTxt(): string {
  if (!adsEnabled()) return "# CartCrush: no ad networks yet\n";
  return `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
}
