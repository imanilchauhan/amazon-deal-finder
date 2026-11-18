import { cache } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore/lite";
import { db } from "./firebase";
import { toDeal, type Deal } from "./deal-model";

export type { Deal };

/**
 * Every live product, biggest discount first: deals plus full-price collection picks
 * (discount 0, at the end). Security rules cap list queries at 500.
 */
export const getActiveProducts = cache(async (max = 500): Promise<Deal[]> => {
  const q = query(
    collection(db(), "deals"),
    where("active", "==", true),
    orderBy("discount_pct", "desc"),
    limit(Math.min(max, 500)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => toDeal(s.id, s.data()));
});

/** Live deals only (a real discount), biggest first. Collection picks at full price are left out. */
export const getDeals = cache(async (max = 500): Promise<Deal[]> => {
  return (await getActiveProducts(max)).filter((d) => d.discountPct > 0);
});

/** Hand-picked ASINs per collection slug, edited in /admin (collections/{slug}.asins). */
export const getCollectionPicks = cache(async (): Promise<Record<string, string[]>> => {
  try {
    const snap = await getDocs(collection(db(), "collections"));
    const out: Record<string, string[]> = {};
    for (const d of snap.docs) {
      const asins = (d.data().asins as unknown[] | undefined)?.filter((a): a is string => typeof a === "string") ?? [];
      out[d.id] = asins;
    }
    return out;
  } catch (err) {
    console.warn("collection picks unavailable:", err instanceof Error ? err.message : err);
    return {};
  }
});

/** Ended deal pages stay up this long (marked noindex) so a page Google crawled does not turn into a 404 overnight. */
export const ENDED_PAGE_DAYS = 30;

/**
 * Deals that ended within the last ENDED_PAGE_DAYS, newest first. The cutoff is measured from the
 * latest live price check, because the build can't read the clock during prerender.
 * Returns [] if the query is refused (e.g. older security rules) so the build never fails on it.
 */
export const getEndedDeals = cache(async (): Promise<Deal[]> => {
  const live = await getActiveProducts();
  const ref = Date.parse(lastChecked(live));
  if (!Number.isFinite(ref)) return [];
  const cutoff = ref - ENDED_PAGE_DAYS * 24 * 3600 * 1000;
  try {
    // Page through every deal that ended inside the window. Each ended URL must keep being built:
    // when a page disappears, Cloudflare Pages keeps serving its last copy (old price included)
    // for up to a week, so every deal needs a price-free "ended" version before it drops out.
    const liveAsins = new Set(live.map((d) => d.asin));
    const out: Deal[] = [];
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < 10; page++) {
      const parts = [where("active", "==", false), orderBy("updated_at", "desc"), ...(last ? [startAfter(last)] : []), limit(500)];
      const snap = await getDocs(query(collection(db(), "deals"), ...parts));
      let reachedCutoff = false;
      for (const s of snap.docs) {
        const d = toDeal(s.id, s.data());
        if (Date.parse(d.checkedAt) < cutoff) {
          reachedCutoff = true;
          break;
        }
        if (!liveAsins.has(d.asin)) out.push(d);
      }
      if (reachedCutoff || snap.docs.length < 500) break;
      last = snap.docs[snap.docs.length - 1];
    }
    return out;
  } catch (err) {
    console.warn("ended deals unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
});

/** Live deals most like this one: same category, then same department, then the rest. */
export async function similarDeals(deal: Deal, count: number): Promise<Deal[]> {
  const live = (await getDeals()).filter((d) => d.asin !== deal.asin);
  const rank = (d: Deal) => (d.category === deal.category && d.department === deal.department ? 0 : d.department === deal.department ? 1 : 2);
  return [...live].sort((a, b) => rank(a) - rank(b)).slice(0, count);
}

export const getDeal = cache(async (asin: string): Promise<Deal | null> => {
  const snap = await getDoc(doc(db(), "deals", asin));
  return snap.exists() ? toDeal(snap.id, snap.data()) : null;
});

/** Latest check time across a list of deals. */
export function lastChecked(deals: Deal[]): string {
  return deals.reduce((m, d) => (d.checkedAt > m ? d.checkedAt : m), "");
}

export async function getDealsInDepartment(department: string, category?: string): Promise<Deal[]> {
  const all = await getDeals(500);
  return all.filter((d) => d.department === department && (!category || d.category === category));
}
