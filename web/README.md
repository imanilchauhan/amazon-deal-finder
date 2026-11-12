# CartCrush website (Next.js + Firebase)

Server-rendered deals site that reads live deals from Firestore (`deals` collection, written by the backend).

```bash
cp .env.example .env.local   # fill in the Firebase web config
npm install
npm run dev                  # http://localhost:3000
```

- `src/lib/deals.ts` – Firestore reads, cached with `"use cache"` + `cacheLife("hours")`
- `src/app` – home, `/deals`, `/deals/[slug]`, about, affiliate disclosure, privacy, `sitemap.xml`, `robots.txt`
- SEO: per-page metadata, canonical URLs, Open Graph/X cards, JSON-LD (Organization, ItemList, Product, Breadcrumb)
