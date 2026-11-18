import type { MetadataRoute } from "next";
import { getActiveProducts, getCollectionPicks, getDeals, lastChecked } from "@/lib/deals";
import { SITE } from "@/lib/site";
import { DEPARTMENTS } from "@/lib/taxonomy";
import { GUIDES } from "@/data/guides";
import { COLLECTIONS, buildCollection } from "@/data/collections";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [deals, products, picks] = await Promise.all([getDeals(), getActiveProducts(), getCollectionPicks()]);
  // Cache Components disallows reading the clock during prerender; use the data's own timestamp.
  const now = lastChecked(deals) || undefined;
  const pages: MetadataRoute.Sitemap = [
    { url: SITE.url, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE.url}/deals`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE.url}/black-friday`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE.url}/guides`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE.url}/collections`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...COLLECTIONS.filter((col) => {
      const r = buildCollection(col, products, picks[col.slug] ?? []);
      return r.picks.length + r.sections.length > 0; // empty collections are noindex
    }).map((col) => ({
      url: `${SITE.url}/collections/${col.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...GUIDES.map((g) => ({
      url: `${SITE.url}/guides/${g.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    { url: `${SITE.url}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE.url}/affiliate-disclosure`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  const live = new Set(deals.map((d) => `${d.department}/${d.category}`));
  const liveDeps = new Set(deals.map((d) => d.department));
  const categories: MetadataRoute.Sitemap = DEPARTMENTS.flatMap((dep) => [
    ...(liveDeps.has(dep.slug)
      ? [{ url: `${SITE.url}/c/${dep.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 }]
      : []),
    ...dep.categories
      .filter((c) => live.has(`${dep.slug}/${c.slug}`))
      .map((c) => ({ url: `${SITE.url}/c/${dep.slug}/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
  ]);
  return pages.concat(
    categories,
    products.map((d) => ({
      url: `${SITE.url}/deals/${d.slug}`,
      lastModified: d.checkedAt || now,
      changeFrequency: "daily" as const,
      priority: 0.7,
      images: d.imageUrl ? [d.imageUrl] : undefined,
    })),
  );
}
