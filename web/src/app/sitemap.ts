import type { MetadataRoute } from "next";
import { getDeals, lastChecked } from "@/lib/deals";
import { SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const deals = await getDeals(100);
  // Cache Components disallows reading the clock during prerender; use the data's own timestamp.
  const now = lastChecked(deals) || undefined;
  const pages: MetadataRoute.Sitemap = [
    { url: SITE.url, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE.url}/deals`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE.url}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE.url}/affiliate-disclosure`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  return pages.concat(
    deals.map((d) => ({
      url: `${SITE.url}/deals/${d.slug}`,
      lastModified: d.checkedAt || now,
      changeFrequency: "daily" as const,
      priority: 0.7,
      images: d.imageUrl ? [d.imageUrl] : undefined,
    })),
  );
}
