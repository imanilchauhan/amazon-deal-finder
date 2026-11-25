/** Product cache written by the runner after each scrape (backend/deal_finder/catalog.py). */
export const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL ||
  process.env.CARTCRUSH_CATALOG_URL ||
  "https://cartcrush-cards.imanilchauhan3.workers.dev/catalog.json";
