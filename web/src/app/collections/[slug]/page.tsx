import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealGrid } from "@/components/DealGrid";
import { JsonLd } from "@/components/SiteChrome";
import { COLLECTIONS, buildCollection, getCollection } from "@/data/collections";
import { getGuide } from "@/data/guides";
import { getActiveProducts, getCollectionPicks, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import c from "@/components/content.module.css";

export function generateStaticParams() {
  return COLLECTIONS.map((col) => ({ slug: col.slug }));
}

async function resolve(slug: string) {
  const col = getCollection(slug);
  if (!col) return null;
  const [live, picks] = await Promise.all([getActiveProducts(), getCollectionPicks()]);
  return { col, ...buildCollection(col, live, picks[slug] ?? []) };
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const r = await resolve((await params).slug);
  if (!r) return { title: "Collection not found", robots: { index: false } };
  const count = r.picks.length + r.sections.reduce((n, s) => n + s.items.length, 0);
  return {
    title: { absolute: r.col.title },
    description: r.col.description,
    alternates: { canonical: `/collections/${r.col.slug}` },
    robots: count ? undefined : { index: false, follow: true }, // empty pages stay out of the index
    openGraph: { url: `/collections/${r.col.slug}`, title: r.col.title, description: r.col.description },
  };
}

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const r = await resolve((await params).slug);
  if (!r) notFound();
  const { col, picks, sections } = r;
  const all = [...picks, ...sections.flatMap((s) => s.items)];
  const checked = lastChecked(all);
  const url = `${SITE.url}/collections/${col.slug}`;
  const guides = (col.guides ?? []).map(getGuide).filter((g): g is NonNullable<typeof g> => !!g);

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: col.h1,
              description: col.description,
              url,
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: all.length,
                itemListElement: all.slice(0, 50).map((d, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: `${SITE.url}/deals/${d.slug}`,
                  name: d.shortTitle,
                })),
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: "Collections", item: `${SITE.url}/collections` },
                { "@type": "ListItem", position: 3, name: col.h1, item: url },
              ],
            },
          ],
        }}
      />
      <nav className={c.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/collections">Collections</Link> / <span>{col.h1}</span>
      </nav>
      <article className={c.article}>
        <p className={c.meta}>{col.group}</p>
        <h1>{col.h1}</h1>
        {col.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {guides.length > 0 && (
          <p className={c.guideLinks}>
            {guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}`}>
                📖 {g.h1}
              </Link>
            ))}
          </p>
        )}
        {checked && <p className={c.meta}>Prices last checked {istDateTime(checked)}. Amazon prices change often.</p>}
      </article>

      {picks.length > 0 && (
        <section className={c.deals}>
          <h2>Our picks</h2>
          <DealGrid deals={picks} />
        </section>
      )}
      {sections.map((s) => (
        <section key={s.heading} className={c.deals}>
          <h2>{s.heading}</h2>
          <DealGrid deals={s.items} />
        </section>
      ))}
      {!all.length && (
        <p className={c.empty}>
          Nothing in this collection is live right now; we check Amazon every few hours. Meanwhile, see <Link href="/deals">all deals</Link>.
        </p>
      )}
      <p className={c.meta} style={{ marginTop: 24 }}>
        {PRICE_DISCLAIMER}
      </p>
    </main>
  );
}
