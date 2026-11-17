/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { getDeal, getDeals, getEndedDeals, similarDeals, type Deal } from "@/lib/deals";
import { asinFromSlug, istDateTime, money } from "@/lib/format";
import { AMAZON_DISCLOSURE, PRICE_DISCLAIMER, SITE } from "@/lib/site";
import s from "./deal.module.css";

export async function generateStaticParams() {
  const [live, ended] = await Promise.all([getDeals(), getEndedDeals()]);
  return [...live, ...ended].map((d) => ({ slug: d.slug }));
}

async function dealFromParams(params: PageProps<"/deals/[slug]">["params"]): Promise<Deal | null> {
  const { slug } = await params;
  const asin = asinFromSlug(slug);
  return asin ? getDeal(asin) : null;
}

export async function generateMetadata({ params }: PageProps<"/deals/[slug]">): Promise<Metadata> {
  const deal = await dealFromParams(params);
  if (!deal) return { title: "Deal not found", robots: { index: false } };
  if (!deal.active) {
    // Ended: no old price in the title or snippet (Amazon prices may only be shown when under 24 hours old).
    return {
      title: `${deal.shortTitle} – deal ended`,
      description: `The ${deal.shortTitle} deal has ended. See similar live Amazon deals on CartCrush, checked every few hours.`,
      alternates: { canonical: `/deals/${deal.slug}` },
      robots: { index: false, follow: true },
    };
  }
  const title = `${deal.shortTitle} at ${money(deal.price, deal.currency)} (${deal.discountPct}% off)`;
  const description = `${deal.shortTitle} is ${deal.discountPct}% off on Amazon: ${money(deal.price, deal.currency)} instead of ${money(
    deal.originalPrice,
    deal.currency,
  )}. You save ${money(deal.savings, deal.currency)}. Price checked ${istDateTime(deal.checkedAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: `/deals/${deal.slug}` },
    openGraph: { type: "website", url: `/deals/${deal.slug}`, title, description, images: [{ url: deal.imageUrl, alt: deal.shortTitle }] },
    twitter: { card: "summary_large_image", title, description, images: [deal.imageUrl] },
  };
}

async function DealDetails({ params }: { params: PageProps<"/deals/[slug]">["params"] }) {
  const deal = await dealFromParams(params);
  if (!deal) notFound();

  const related = await similarDeals(deal, deal.active ? 8 : 6);
  const pageUrl = `${SITE.url}/deals/${deal.slug}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              name: deal.shortTitle,
              description: deal.title,
              image: deal.imageUrl,
              sku: deal.asin,
              url: pageUrl,
              ...(deal.active && {
                offers: {
                  "@type": "Offer",
                  price: deal.price,
                  priceCurrency: deal.currency,
                  availability: "https://schema.org/InStock",
                  url: pageUrl,
                  seller: { "@type": "Organization", name: "Amazon.in" },
                },
              }),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: "Deals", item: `${SITE.url}/deals` },
                { "@type": "ListItem", position: 3, name: deal.shortTitle, item: pageUrl },
              ],
            },
          ],
        }}
      />
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>/<Link href="/deals">Deals</Link>/<span>{deal.shortTitle}</span>
      </nav>

      <div className={s.layout}>
        <div className={s.media}>
          {deal.active && <span className={s.badge}>-{deal.discountPct}%</span>}
          <img src={deal.imageUrl} alt={deal.shortTitle} width={600} height={600} />
        </div>

        <div className={s.info}>
          <h1>{deal.shortTitle}</h1>
          {deal.title !== deal.shortTitle && <p className={s.fullTitle}>{deal.title}</p>}

          {deal.active && (
          <div className={s.priceBox}>
            <span className={s.price}>{money(deal.price, deal.currency)}</span>
            <span className={s.was}>
              Regular price <s>{money(deal.originalPrice, deal.currency)}</s>
            </span>
            <span className={s.save}>
              You save {money(deal.savings, deal.currency)} ({deal.discountPct}% off)
            </span>
            <p className={s.asOf}>Price checked {istDateTime(deal.checkedAt)}</p>
          </div>
          )}

          {!deal.active && (
            <p className={s.ended}>
              <strong>This deal has ended.</strong> Check Amazon for today&apos;s price, or see similar live deals below.
            </p>
          )}
          <a className={s.buy} href={deal.url} target="_blank" rel="sponsored nofollow noopener">
            {deal.active ? "Buy on Amazon" : "Check today's price on Amazon"}
          </a>
          <p className={s.small}>{PRICE_DISCLAIMER}</p>
          <p className={s.small}>{AMAZON_DISCLOSURE}</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className={s.related}>
          <h2>{deal.active ? "More deals you might like" : "Similar deals live right now"}</h2>
          <DealGrid deals={related} showControls={false} />
        </section>
      )}
    </>
  );
}

export default function DealPage(props: PageProps<"/deals/[slug]">) {
  return (
    <main>
      <Suspense fallback={<div className={s.skeleton} aria-busy="true" />}>
        <DealDetails params={props.params} />
      </Suspense>
    </main>
  );
}
