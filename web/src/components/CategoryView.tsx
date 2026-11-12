import Link from "next/link";
import { notFound } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { CategoryNav } from "@/components/CategoryNav";
import { JsonLd } from "@/components/SiteChrome";
import { getDeals, lastChecked } from "@/lib/deals";
import { istDateTime } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE } from "@/lib/site";
import { getCategory, getDepartment } from "@/lib/taxonomy";
import s from "@/app/page.module.css";

export async function CategoryView({ department, category }: { department: string; category?: string }) {
  const dep = getDepartment(department);
  const cat = category ? getCategory(department, category) : undefined;
  if (!dep || (category && !cat)) notFound();

  const all = await getDeals();
  const counts: Record<string, number> = {};
  for (const d of all) counts[d.department] = (counts[d.department] ?? 0) + 1;
  const inDept = all.filter((d) => d.department === department);
  const deals = cat ? inDept.filter((d) => d.category === category) : inDept;
  const name = cat ? `${cat.name}` : dep.name;
  const path = cat ? `/c/${department}/${category}` : `/c/${department}`;
  const best = deals.reduce((m, d) => Math.max(m, d.discountPct), 0);
  const checked = lastChecked(deals);

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: dep.name, item: `${SITE.url}/c/${department}` },
                ...(cat ? [{ "@type": "ListItem", position: 3, name: cat.name, item: `${SITE.url}${path}` }] : []),
              ],
            },
            {
              "@type": "ItemList",
              name: `${name} deals`,
              numberOfItems: deals.length,
              itemListElement: deals.slice(0, 50).map((d, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE.url}/deals/${d.slug}`,
                name: d.shortTitle,
              })),
            },
          ],
        }}
      />
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link> / {cat ? <Link href={`/c/${department}`}>{dep.name}</Link> : <span>{dep.name}</span>}
        {cat && <> / <span>{cat.name}</span></>}
      </nav>
      <section className={s.hero}>
        <h1>
          {dep.icon} {name} deals today
        </h1>
        <p className={s.lead}>
          {deals.length
            ? `${deals.length} live ${name.toLowerCase()} deals on Amazon India, up to ${best}% off.`
            : `No live ${name.toLowerCase()} deals right now. New deals are added every few hours.`}
          {checked && <> Prices last checked {istDateTime(checked)}.</>}
        </p>
      </section>
      <CategoryNav counts={counts} active={department} />
      {!cat && dep.categories.length > 1 && (
        <p className={s.subcats}>
          {dep.categories
            .filter((c) => inDept.some((d) => d.category === c.slug))
            .map((c) => (
              <Link key={c.slug} href={`/c/${department}/${c.slug}`}>
                {c.name}
              </Link>
            ))}
        </p>
      )}
      {deals.length > 0 && (
        <Catalog deals={deals} categories={cat ? undefined : dep.categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      )}
      <p className={s.note}>{PRICE_DISCLAIMER}</p>
    </main>
  );
}
