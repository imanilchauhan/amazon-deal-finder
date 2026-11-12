import { cache } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore/lite";
import { db } from "./firebase";
import { toDeal, type Deal } from "./deal-model";

export type { Deal };

/** Active deals, biggest discount first. Security rules cap list queries at 500. */
export const getDeals = cache(async (max = 500): Promise<Deal[]> => {
  const q = query(
    collection(db(), "deals"),
    where("active", "==", true),
    orderBy("discount_pct", "desc"),
    limit(Math.min(max, 500)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => toDeal(s.id, s.data()));
});

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
