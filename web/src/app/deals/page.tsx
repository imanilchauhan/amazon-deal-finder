import type { Metadata } from "next";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import s from "../page.module.css";

export const metadata: Metadata = {
  title: "All Amazon Deals Today – Biggest Discounts & Price Drops",
  description:
    "Every live Amazon India deal we're tracking right now, sorted by biggest discount. Filter loot deals by 50% or 70% off, or find deals under ₹500 and ₹1,000.",
  alternates: { canonical: "/deals" },
  openGraph: { url: "/deals" },
};

export default async function DealsPage() {
  const deals = await getDeals(100);
  const checked = lastChecked(deals);

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "All Amazon deals today",
          numberOfItems: deals.length,
          itemListElement: deals.map((d, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE.url}/deals/${d.slug}`,
            name: d.shortTitle,
          })),
        }}
      />
      <section className={s.hero}>
        <h1>All deals today</h1>
        <p className={s.lead}>
          {deals.length} live Amazon deals, biggest discount first. Filter by discount or budget to find your next steal.
          {checked && <> Prices last checked {istDateTime(checked)}.</>}
        </p>
      </section>
      <DealGrid deals={deals} />
      <p className={s.note}>{PRICE_DISCLAIMER}</p>
    </main>
  );
}
