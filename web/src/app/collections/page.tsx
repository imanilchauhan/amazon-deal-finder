import type { Metadata } from "next";
import Link from "next/link";
import { COLLECTIONS, COLLECTION_GROUPS, buildCollection } from "@/data/collections";
import { getActiveProducts, getCollectionPicks } from "@/lib/deals";
import c from "@/components/content.module.css";

export const metadata: Metadata = {
  title: "Collections – Winter, Wedding, Gifts & Everyday Picks",
  description:
    "Curated collections of good products from Amazon India: winter essentials, wedding jewellery and ethnic wear, gifts under ₹500 and ₹1,000, and everyday basics.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsIndex() {
  const [live, picks] = await Promise.all([getActiveProducts(), getCollectionPicks()]);
  const counts = Object.fromEntries(
    COLLECTIONS.map((col) => {
      const r = buildCollection(col, live, picks[col.slug] ?? []);
      return [col.slug, r.topDeals.length + r.picks.length + r.sections.reduce((n, s) => n + s.items.length, 0)];
    }),
  );
  return (
    <main>
      <article className={c.article}>
        <h1>Collections</h1>
        <p>
          Hand-picked and always-current lists of good products for the season and for everyday life, not only today&apos;s deals.
          Every product links to Amazon India, and every price shows when it was checked.
        </p>
      </article>
      {COLLECTION_GROUPS.map((group) => (
        <section key={group} className={c.deals}>
          <h2>{group}</h2>
          <div className={c.cards}>
            {COLLECTIONS.filter((col) => col.group === group).map((col) => (
              <Link key={col.slug} href={`/collections/${col.slug}`} className={c.card}>
                <h2>{col.h1}</h2>
                <p>{col.description}</p>
                <p className={c.meta}>{counts[col.slug] ? `${counts[col.slug]} products` : "Updating soon"}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
