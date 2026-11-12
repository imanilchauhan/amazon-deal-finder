import Link from "next/link";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import s from "./page.module.css";

export default async function Home() {
  const deals = await getDeals(100);
  const top = deals.slice(0, 12);
  const best = deals[0]?.discountPct ?? 0;
  const checked = lastChecked(deals);

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
        <h2>Top deals right now</h2>
        <Link href="/deals">See all {deals.length} deals →</Link>
      </div>
      <DealGrid deals={top} showControls={false} />
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
            Follow <a href={SITE.xUrl}>{SITE.xHandle}</a> on X and turn on notifications to get price drop alerts the
            moment we find them.
          </p>
        </section>
      </div>
    </main>
  );
}
