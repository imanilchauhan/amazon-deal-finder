import Link from "next/link";
import { CategoryNav } from "@/components/CategoryNav";
import { DealGrid } from "@/components/DealGrid";
import { DealRow } from "@/components/DealRow";
import { COLLECTIONS, buildCollection } from "@/data/collections";
import { JsonLd } from "@/components/SiteChrome";
import { getActiveProducts, getCollectionPicks, getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import { DEPARTMENTS } from "@/lib/taxonomy";
import s from "./page.module.css";

export default async function Home() {
  const [deals, products, picks] = await Promise.all([getDeals(), getActiveProducts(), getCollectionPicks()]);
  const top = deals.slice(0, 12);
  const best = deals[0]?.discountPct ?? 0;
  const checked = lastChecked(deals);
  const counts: Record<string, number> = {};
  for (const d of deals) counts[d.department] = (counts[d.department] ?? 0) + 1;
  // Every department with live deals, busiest first, each with its own top deals.
  const shelves = DEPARTMENTS.filter((d) => (counts[d.slug] ?? 0) > 0).sort((a, b) => counts[b.slug] - counts[a.slug]);
  // Every collection with something live: its top deals first, then picks and sections.
  const collectionRows = COLLECTIONS.map((col) => {
    const r = buildCollection(col, products, picks[col.slug] ?? []);
    const items = [...r.topDeals, ...r.picks, ...r.sections.flatMap((x) => x.items)].slice(0, 10);
    return { col, items, hasDeals: r.topDeals.length > 0 };
  })
    .filter((x) => x.items.length > 0)
    .sort((a, b) => Number(b.hasDeals) - Number(a.hasDeals));

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Today's best Amazon deals in India",
    itemListElement: top.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE.url}/deals/${d.slug}`,
      name: d.shortTitle,
    })),
  };

  return (
    <main>
      <JsonLd data={itemList} />
      <section className={s.hero}>
        <p className={s.eyebrow}>
          <span className={s.dot} aria-hidden /> Updated every few hours
        </p>
        <h1>
          Today&apos;s best Amazon deals, <em>crushed</em> down to the lowest price
        </h1>
        <p className={s.lead}>
          CartCrush tracks Amazon India around the clock and lists only real price drops: loot deals, lightning offers and
          big discounts on electronics, fashion, home and kitchen. No fake MRPs, no spam.
        </p>
        <ul className={s.stats}>
          <li>
            <b>{deals.length}</b> live deals
          </li>
          <li>
            Up to <b>{best}% off</b>
          </li>
          {checked && (
            <li>
              Last checked <b>{istDateTime(checked)}</b>
            </li>
          )}
        </ul>
      </section>

      <div className={s.sectionHead}>
        <h2>Shop by category</h2>
      </div>
      <CategoryNav counts={counts} />

      <div className={s.sectionHead}>
        <h2>Top deals right now</h2>
        <Link href="/deals">See all {deals.length} deals →</Link>
      </div>
      <DealGrid deals={top} showControls={false} />

      {collectionRows.length > 0 && (
        <div className={s.sectionHead}>
          <h2>Collections</h2>
          <Link href="/collections">All {COLLECTIONS.length} collections →</Link>
        </div>
      )}
      {collectionRows.map(({ col, items }) => (
        <DealRow
          key={col.slug}
          title={col.h1}
          label={col.h1}
          note={col.group}
          href={`/collections/${col.slug}`}
          linkLabel="See collection"
          deals={items}
        />
      ))}

      <div className={s.sectionHead}>
        <h2>Top deals by category</h2>
        <Link href="/deals">All {deals.length} deals →</Link>
      </div>
      {shelves.map((dep) => (
        <DealRow
          key={dep.slug}
          title={
            <>
              {dep.icon} {dep.name}
            </>
          }
          label={dep.name}
          href={`/c/${dep.slug}`}
          linkLabel={`See all ${counts[dep.slug]}`}
          deals={deals.filter((d) => d.department === dep.slug).slice(0, 10)}
        />
      ))}
      <p className={s.note}>{PRICE_DISCLAIMER}</p>

      <div className={s.seo}>
        <section>
          <h2>Amazon deals today, checked every 4 hours</h2>
          <p>
            Our deal finder scans Amazon.in for the biggest price drops of the day, so you can see today&apos;s offers in
            one place instead of scrolling through sale pages.
          </p>
        </section>
        <section>
          <h2>Real discounts, not inflated MRPs</h2>
          <p>
            Every deal shows the current price, the regular price and exactly how much you save. Deals that end are
            removed automatically.
          </p>
        </section>
        <section>
          <h2>Never miss a loot deal</h2>
          <p>
            Follow <a href={SITE.xUrl}>{SITE.xHandle}</a> on X and turn on notifications to see new deals the moment we
            post them.
          </p>
        </section>
      </div>
    </main>
  );
}
