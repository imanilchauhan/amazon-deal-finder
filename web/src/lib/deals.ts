import { cacheLife } from "next/cache";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, Timestamp } from "firebase/firestore/lite";
import { db } from "./firebase";
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
};

function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return "";
}

function toDeal(asin: string, d: Record<string, unknown>): Deal {
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
  };
}

/** Active deals, biggest discount first. Security rules cap list queries at 100. */
export async function getDeals(max = 100): Promise<Deal[]> {
  "use cache";
  cacheLife("hours");
  const q = query(
    collection(db(), "deals"),
    where("active", "==", true),
    orderBy("discount_pct", "desc"),
    limit(Math.min(max, 100)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => toDeal(s.id, s.data()));
}

export async function getDeal(asin: string): Promise<Deal | null> {
  "use cache";
  cacheLife("hours");
  const snap = await getDoc(doc(db(), "deals", asin));
  return snap.exists() ? toDeal(snap.id, snap.data()) : null;
}

/** Latest check time across a list of deals. */
export function lastChecked(deals: Deal[]): string {
  return deals.reduce((m, d) => (d.checkedAt > m ? d.checkedAt : m), "");
}
