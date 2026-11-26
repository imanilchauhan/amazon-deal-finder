import type { Metadata } from "next";
import Link from "next/link";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { GUIDES } from "@/data/guides";
import { getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import c from "@/components/content.module.css";
import { AdSlot, AdsScript } from "@/components/Ads";

/**
 * Black Friday 2026 page. Update EVENT when Amazon announces its sale window; until then the
 * copy only states what is known (the calendar date and earlier years' sales).
 */
const EVENT = {
  year: 2026,
  blackFriday: "Friday, 27 November 2026",
  cyberMonday: "Monday, 30 November 2026",
  /** Set once Amazon India confirms dates, e.g. "27 November to 1 December 2026". */
  amazonWindow: "",
  minDiscount: 40,
  reviewed: "2026-11-14",
};

const TITLE = `Amazon Black Friday Sale ${EVENT.year} India – Live Deals & Dates`;
const DESCRIPTION = `Amazon India Black Friday ${EVENT.year}: sale dates, what usually gets discounted, how to spot a real deal, and live Amazon deals at ${EVENT.minDiscount}% off or more, checked every few hours.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/black-friday" },
  openGraph: { url: "/black-friday", title: TITLE, description: DESCRIPTION },
};

const FAQ = [
  {
    q: `When is the Amazon Black Friday sale ${EVENT.year} in India?`,
    a: EVENT.amazonWindow
      ? `Amazon India's Black Friday sale runs ${EVENT.amazonWindow}.`
      : `Black Friday falls on ${EVENT.blackFriday}. Amazon India has not announced its sale dates yet; in 2025 its Black Friday sale ran from 28 November to 1 December. This page will be updated when the dates are confirmed.`,
  },
  {
    q: "Does Amazon India have a Black Friday sale?",
    a: "Yes. Amazon India held its first Black Friday sale in 2024 and ran another in 2025, alongside the Black Friday weekend in other countries.",
  },
  {
    q: "Are Black Friday prices really lower than Diwali sale prices?",
    a: "Sometimes, not always. Compare the deal price with the product's recent price rather than the MRP. CartCrush shows the time each price was checked so you can judge it.",
  },
  {
    q: "What is Cyber Monday?",
    a: `Cyber Monday is the Monday after Black Friday (${EVENT.cyberMonday}), when many online stores extend or add deals, especially on electronics.`,
  },
];

export default async function BlackFridayPage() {
  const deals = (await getDeals()).filter((d) => d.discountPct >= EVENT.minDiscount).slice(0, 60);
  const checked = lastChecked(deals);
  const url = `${SITE.url}/black-friday`;

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: TITLE,
              description: DESCRIPTION,
              dateModified: EVENT.reviewed,
              url,
              author: { "@type": "Organization", name: SITE.name, url: SITE.url },
              publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: `Black Friday ${EVENT.year}`, item: url },
              ],
            },
          ],
        }}
      />
      <nav className={c.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <span>Black Friday {EVENT.year}</span>
      </nav>
      <article className={c.article}>
        <h1>Amazon Black Friday sale {EVENT.year}: India deals</h1>
        <p className={c.meta}>By the {SITE.name} team · Updated as deals change</p>
        <p>
          Black Friday is on <strong>{EVENT.blackFriday}</strong>, and Cyber Monday follows on {EVENT.cyberMonday}.{" "}
          {EVENT.amazonWindow
            ? `Amazon India's Black Friday sale runs ${EVENT.amazonWindow}.`
            : "Amazon India has not announced its sale dates yet. Its first Black Friday sale ran in 2024, and in 2025 the sale ran from 28 November to 1 December, so a similar long weekend is likely."}{" "}
          This page lists every Amazon deal CartCrush has found at {EVENT.minDiscount}% off or more, re-checked every few hours, so you
          can see real price drops without scrolling through the sale pages.
        </p>
        <p>
          <a href="#deals">Jump to live deals ↓</a>
        </p>

        <h2>What usually gets discounted</h2>
        <ul>
          <li>Electronics: earbuds, smartwatches, speakers and laptops, often with extra bank card offers.</li>
          <li>Fashion: winter wear, sneakers, ethnic wear and handbags, which have the biggest percentage discounts.</li>
          <li>Home and kitchen: cookware, bedsheets, storage and small appliances.</li>
          <li>Beauty: skincare and haircare combos from big brands.</li>
          <li>Winter appliances: room heaters, geysers and immersion rods, which are in season.</li>
        </ul>

        <h2>How to spot a real Black Friday deal</h2>
        <ul>
          <li>Judge the final price, not the percentage. A high MRP makes any discount look big.</li>
          <li>Check the price a few days before the sale; CartCrush shows when each price was last checked.</li>
          <li>Read the bank offer terms: many give the discount only on EMI or above a minimum order value.</li>
          <li>Check who sells the product. Listings sold by the brand or fulfilled by Amazon are safer for electronics and beauty.</li>
          <li>Look at the return policy before buying clothes, shoes and large items.</li>
        </ul>

        <h2>Buying guides for the season</h2>
        <ul>
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`}>{g.h1}</Link>
            </li>
          ))}
        </ul>

        <h2>Questions people ask</h2>
        <div className={c.faq}>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </article>
      <AdsScript />
      <AdSlot kind="article" />

      <section className={c.deals} id="deals">
        <h2>Live deals at {EVENT.minDiscount}% off or more</h2>
        {deals.length ? (
          <>
            <p className={c.meta}>
              {deals.length} deals, biggest discount first{checked && <>, prices last checked {istDateTime(checked)}</>}.{" "}
              <Link href="/deals">See all deals →</Link>
            </p>
            <DealGrid deals={deals} />
          </>
        ) : (
          <p className={c.empty}>
            No deals at {EVENT.minDiscount}% off or more are live right now. See <Link href="/deals">all deals</Link>.
          </p>
        )}
        <p className={c.meta} style={{ marginTop: 18 }}>
          {PRICE_DISCLAIMER}
        </p>
      </section>
    </main>
  );
}
