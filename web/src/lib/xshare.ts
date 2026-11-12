import { money, shortTitle } from "./format";

const ASIN_BARE = /^[A-Z0-9]{10}$/i;
const ASIN_IN_URL = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

export const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || "cartcrush004-21";

/** Pull the ASIN from a pasted Amazon product URL or a bare ASIN. */
export function parseAsin(input: string): string | null {
  const v = input.trim();
  if (ASIN_BARE.test(v)) return v.toUpperCase();
  return ASIN_IN_URL.exec(v)?.[1]?.toUpperCase() ?? null;
}

/** Same shape the backend validates: https://www.amazon.in/dp/ASIN/?tag=TAG */
export function affiliateUrl(asin: string, tag = AMAZON_TAG): string {
  return `https://www.amazon.in/dp/${asin}/?tag=${tag}`;
}

type Postable = { title: string; price: number; originalPrice: number; discountPct: number; url: string; currency?: string };

const X_LIMIT = 280;
const X_LINK_LEN = 23; // X counts every link as 23 characters

/** Post text for X: short title, price, discount, link, #ad. Title is trimmed so the whole post fits. */
export function buildPostText(d: Postable): string {
  const cur = d.currency ?? "INR";
  const tail = `\n\n${d.url}\n\n#ad #Deals`;
  const head = (title: string) =>
    `🔥 ${title} at ${money(d.price, cur)} (${d.discountPct}% off, MRP ${money(d.originalPrice, cur)})`;
  let max = 70;
  let text = head(shortTitle(d.title, max)) + tail;
  while (max > 20 && text.length - d.url.length + X_LINK_LEN > X_LIMIT) {
    max -= 5;
    text = head(shortTitle(d.title, max)) + tail;
  }
  return text;
}

export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
