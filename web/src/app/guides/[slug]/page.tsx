import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { GUIDES, getGuide, matchesGuide } from "@/data/guides";
import { getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import c from "@/components/content.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-14" -> "14 November 2026", without time zones getting in the way. */
function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const g = getGuide((await params).slug);
  if (!g) return { title: "Guide not found", robots: { index: false } };
  return {
    title: { absolute: g.title },
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", url: `/guides/${g.slug}`, title: g.title, description: g.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  const deals = (await getDeals()).filter((d) => matchesGuide(d, g.match));
  const checked = lastChecked(deals);
  const url = `${SITE.url}/guides/${g.slug}`;

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: g.h1,
              description: g.description,
              dateModified: g.reviewed,
              url,
              author: { "@type": "Organization", name: SITE.name, url: SITE.url },
              publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
            },
            {
              "@type": "FAQPage",
              mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: "Buying guides", item: `${SITE.url}/guides` },
                { "@type": "ListItem", position: 3, name: g.h1, item: url },
              ],
            },
          ],
        }}
      />
      <nav className={c.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/guides">Buying guides</Link> / <span>{g.h1}</span>
      </nav>
      <article className={c.article}>
        <h1>{g.h1}</h1>
        <p className={c.meta}>
          By the {SITE.name} team · Reviewed{" "}
          {longDate(g.reviewed)}
        </p>
        {g.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p>
          <a href="#deals">Jump to today&apos;s deals ↓</a>
        </p>
        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paras.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.points && (
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <h2>Questions people ask</h2>
        <div className={c.faq}>
          {g.faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </article>

      <section className={c.deals} id="deals">
        <h2>{g.dealsHeading}</h2>
        {deals.length ? (
          <>
            <p className={c.meta}>
              {deals.length} live {deals.length === 1 ? "deal" : "deals"}, biggest discount first
              {checked && <>, prices last checked {istDateTime(checked)}</>}.{" "}
              <Link href={g.categoryHref}>See {g.categoryName} →</Link>
            </p>
            <DealGrid deals={deals} />
          </>
        ) : (
          <p className={c.empty}>
            No matching deals are live right now; we check Amazon every few hours. Meanwhile, browse{" "}
            <Link href={g.categoryHref}>{g.categoryName}</Link>.
          </p>
        )}
        <p className={c.meta} style={{ marginTop: 18 }}>
          {PRICE_DISCLAIMER}
        </p>
      </section>
    </main>
  );
}
