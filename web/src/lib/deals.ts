import fs from "node:fs";
import path from "node:path";
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
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore/lite";
import { db } from "./firebase";
import { toDeal, type Deal } from "./deal-model";
import { CATALOG_URL } from "./catalog-url";

export type { Deal };

/** Ended deal pages stay up this long (marked noindex) so a page Google crawled does not turn into a 404 overnight. */
export const ENDED_PAGE_DAYS = 30;
/** Upper bound on live products read per build (the site is fine with thousands). */
const MAX_ACTIVE = 5000;
const PAGE = 500; // security rules cap each list query at 500

type Catalog = { active: Deal[]; ended: Deal[]; picks: Record<string, string[]> };

/** Page through a query 500 docs at a time; `keep` returns false to stop early. */
async function pageThrough(
  base: QueryConstraint[],
  max: number,
  keep: (d: Deal) => boolean = () => true,
): Promise<Deal[]> {
  const out: Deal[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (out.length < max) {
    const snap = await getDocs(query(collection(db(), "deals"), ...base, ...(last ? [startAfter(last)] : []), limit(PAGE)));
    for (const s of snap.docs) {
      const d = toDeal(s.id, s.data());
      if (!keep(d)) return out;
      out.push(d);
    }
    if (snap.docs.length < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}


type Snapshot = { updated_at?: string; deals?: Record<string, Record<string, unknown>>; picks?: Record<string, unknown> };

/** Build the catalog from a cache snapshot: no Firestore reads at all. */
export function catalogFromSnapshot(snap: Snapshot): Catalog {
  const all = Object.entries(snap.deals ?? {}).map(([asin, d]) => toDeal(asin, d));
  const active = all
    .filter((d) => d.active)
    .sort((a, b) => b.discountPct - a.discountPct || a.asin.localeCompare(b.asin))
    .slice(0, MAX_ACTIVE);
  const ref = Date.parse(lastChecked(active));
  const cutoff = Number.isFinite(ref) ? ref - ENDED_PAGE_DAYS * 24 * 3600 * 1000 : Infinity;
  const ended = all
    .filter((d) => !d.active && Date.parse(d.checkedAt) >= cutoff)
    .sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : -1));
  const picks: Record<string, string[]> = {};
  for (const [slug, list] of Object.entries(snap.picks ?? {})) {
    if (Array.isArray(list)) picks[slug] = list.filter((a): a is string => typeof a === "string");
  }
  return { active, ended, picks };
}

async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(CATALOG_URL, { cache: "no-store" });
    if (res.ok) {
      const snap = (await res.json()) as Snapshot;
      const cat = catalogFromSnapshot(snap);
      if (cat.active.length) {
        console.log(`catalog: ${cat.active.length} live + ${cat.ended.length} ended from the product cache (updated ${snap.updated_at})`);
        return cat;
      }
    }
    console.warn(`catalog: product cache unavailable (HTTP ${res.status}); reading Firestore`);
  } catch (err) {
    console.warn("catalog: product cache unavailable; reading Firestore:", err instanceof Error ? err.message : err);
  }
  return fetchCatalogFromFirestore();
}

async function fetchCatalogFromFirestore(): Promise<Catalog> {
  // Every live product, biggest discount first (full-price collection picks come last).
  const active = await pageThrough([where("active", "==", true), orderBy("discount_pct", "desc")], MAX_ACTIVE);

  // Deals that ended within ENDED_PAGE_DAYS keep a price-free page: when a page disappears,
  // Cloudflare Pages keeps serving its last copy (old price included) for up to a week.
  // The cutoff is measured from the latest live price check (no clock reads during prerender).
  let ended: Deal[] = [];
  const ref = Date.parse(lastChecked(active));
  if (Number.isFinite(ref)) {
    const cutoff = ref - ENDED_PAGE_DAYS * 24 * 3600 * 1000;
    const liveAsins = new Set(active.map((d) => d.asin));
    try {
      ended = (
        await pageThrough([where("active", "==", false), orderBy("updated_at", "desc")], 5000, (d) => Date.parse(d.checkedAt) >= cutoff)
      ).filter((d) => !liveAsins.has(d.asin));
    } catch (err) {
      console.warn("ended deals unavailable:", err instanceof Error ? err.message : err);
    }
  }

  const picks: Record<string, string[]> = {};
  try {
    const snap = await getDocs(collection(db(), "collections"));
    for (const d of snap.docs) {
      picks[d.id] = ((d.data().asins as unknown[] | undefined) ?? []).filter((a): a is string => typeof a === "string");
    }
  } catch (err) {
    console.warn("collection picks unavailable:", err instanceof Error ? err.message : err);
  }
  return { active, ended, picks };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read Firestore once per build, not once per page. next.config sets CARTCRUSH_BUILD_TOKEN in
 * the main build process; the static-generation workers inherit it and share one JSON file:
 * the first worker to take the lock fetches, the others wait for the file.
 */
async function loadCatalog(): Promise<Catalog> {
  const token = process.env.CARTCRUSH_BUILD_TOKEN;
  if (!token) return fetchCatalog();
  const dir = path.join(process.cwd(), ".next", "cartcrush");
  const file = path.join(dir, `catalog-${token}.json`);
  const lock = `${file}.lock`;
  const read = () => JSON.parse(fs.readFileSync(file, "utf8")) as Catalog;
  if (fs.existsSync(file)) return read();
  fs.mkdirSync(dir, { recursive: true });
  let owner = false;
  try {
    fs.closeSync(fs.openSync(lock, "wx"));
    owner = true;
  } catch {
    /* another worker is fetching */
  }
  if (owner) {
    const data = await fetchCatalog();
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
    return data;
  }
  for (let i = 0; i < 600; i++) {
    if (fs.existsSync(file)) return read();
    await sleep(200);
  }
  return fetchCatalog(); // the owner died; fetch ourselves
}

let catalog: Promise<Catalog> | null = null;
const getCatalog = () => (catalog ??= loadCatalog());

/** Every live product, biggest discount first: deals plus full-price collection picks (discount 0, last). */
export async function getActiveProducts(): Promise<Deal[]> {
  return (await getCatalog()).active;
}

/** Live deals only (a real discount), biggest first. Collection picks at full price are left out. */
export async function getDeals(): Promise<Deal[]> {
  return (await getCatalog()).active.filter((d) => d.discountPct > 0);
}

/** Hand-picked ASINs per collection slug, edited in /admin (collections/{slug}.asins). */
export async function getCollectionPicks(): Promise<Record<string, string[]>> {
  return (await getCatalog()).picks;
}

/** Deals that ended within the last ENDED_PAGE_DAYS, newest first. */
export async function getEndedDeals(): Promise<Deal[]> {
  return (await getCatalog()).ended;
}

/** Live deals most like this one: same category, then same department, then the rest. */
export async function similarDeals(deal: Deal, count: number): Promise<Deal[]> {
  const live = (await getDeals()).filter((d) => d.asin !== deal.asin);
  const rank = (d: Deal) => (d.category === deal.category && d.department === deal.department ? 0 : d.department === deal.department ? 1 : 2);
  return [...live].sort((a, b) => rank(a) - rank(b)).slice(0, count);
}

export async function getDeal(asin: string): Promise<Deal | null> {
  const { active, ended } = await getCatalog();
  const hit = active.find((d) => d.asin === asin) ?? ended.find((d) => d.asin === asin);
  if (hit) return hit;
  const snap = await getDoc(doc(db(), "deals", asin));
  return snap.exists() ? toDeal(snap.id, snap.data()) : null;
}

/** Latest check time across a list of deals. */
export function lastChecked(deals: Deal[]): string {
  return deals.reduce((m, d) => (d.checkedAt > m ? d.checkedAt : m), "");
}

export async function getDealsInDepartment(department: string, category?: string): Promise<Deal[]> {
  const all = await getDeals();
  return all.filter((d) => d.department === department && (!category || d.category === category));
}
