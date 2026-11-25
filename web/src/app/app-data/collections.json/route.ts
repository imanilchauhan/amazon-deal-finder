/**
 * Collections for the mobile app, built with the site from the same product cache, so the app
 * shows exactly what the website shows without reading Firestore. Products are listed by ASIN;
 * the app looks them up in catalog.json.
 */
import { COLLECTIONS, COLLECTION_GROUPS, buildCollection } from "@/data/collections";
import { getActiveProducts, getCollectionPicks, lastChecked } from "@/lib/deals";

export const dynamic = "force-static";

export async function GET() {
  const [live, picks] = await Promise.all([getActiveProducts(), getCollectionPicks()]);
  const collections = COLLECTIONS.map((col) => {
    const built = buildCollection(col, live, picks[col.slug] ?? []);
    const ids = <T extends { asin: string }>(xs: T[]) => xs.map((d) => d.asin);
    return {
      slug: col.slug,
      group: col.group,
      title: col.h1,
      description: col.description,
      intro: col.intro,
      picks: ids(built.picks),
      topDeals: ids(built.topDeals),
      sections: built.sections.map((s) => ({ heading: s.heading, asins: ids(s.items) })),
    };
  }).filter((c) => c.picks.length + c.topDeals.length + c.sections.length > 0);
  return Response.json({ version: 1, checked: lastChecked(live), groups: COLLECTION_GROUPS, collections });
}
