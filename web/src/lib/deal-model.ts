import { dealSlug, shortTitle } from "./format";

export type Deal = {
  asin: string;
  title: string;
  shortTitle: string;
  slug: string;
  price: number;
  originalPrice: number;
  savings: number;
  discountPct: number;
  currency: string;
  imageUrl: string;
  url: string;
  active: boolean;
  /** ISO time the price was last checked */
  checkedAt: string;
  firstSeenAt: string;
  department: string;
  category: string;
  brand: string;
  gender: string;
  xStatus: "posted" | "unposted";
};

function iso(v: unknown): string {
  // duck-typed so it works with both the lite and the full Firestore SDK's Timestamp
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return "";
}

export function toDeal(asin: string, d: Record<string, unknown>): Deal {
  const title = String(d.title ?? "");
  const price = Number(d.price ?? 0);
  const originalPrice = Number(d.original_price ?? price);
  return {
    asin,
    title,
    shortTitle: shortTitle(title),
    slug: dealSlug(title, asin),
    price,
    originalPrice,
    savings: Math.max(0, Math.round((originalPrice - price) * 100) / 100),
    discountPct: Number(d.discount_pct ?? 0),
    currency: String(d.currency ?? "INR"),
    imageUrl: String(d.image_url ?? ""),
    url: String(d.url ?? ""),
    active: d.active === true,
    checkedAt: iso(d.updated_at) || iso(d.scraped_at),
    firstSeenAt: iso(d.first_seen_at),
    department: String(d.department ?? "uncategorised"),
    category: String(d.category ?? "uncategorised"),
    brand: String(d.brand ?? ""),
    gender: String(d.gender ?? ""),
    xStatus: d.x_status === "posted" ? "posted" : "unposted",
  };
}
