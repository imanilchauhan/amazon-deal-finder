type Named = { title: string; brand?: string };

const VARIANT_WORDS =
  /\b(black|white|blue|navy|red|green|sea green|olive|grey|gray|silver|gold|golden|rose|pink|peach|purple|violet|maroon|wine|yellow|orange|brown|beige|cream|teal|multicolou?r|small|medium|large|xl|xxl|xs|s|m|l|cabin|check[- ]?in|pack|set|of|combo|size|sizes|\d+(\.\d+)?\s?(l|ml|kg|g|gb|tb|cm|mm|inch|inches|feet|ft|pcs|pieces|litre|liter)?)\b/gi;
const STOP = new Set([
  "for", "with", "and", "the", "in", "to", "a", "men", "mens", "women", "womens", "unisex", "boys", "girls",
  "kids", "adults", "adult", "new", "latest", "stylish", "premium",
]);

/** Same product in another colour/size/pack gets the same key (mirrors backend picker.family_key). */
export function familyKey(deal: Named): string {
  const words = deal.title
    .toLowerCase()
    .replace(VARIANT_WORDS, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const brand = (deal.brand ?? "").toLowerCase().trim();
  const b = brand ? brand.split(/\s+/) : [];
  const rest = b.length && b.every((w, i) => words[i] === w) ? words.slice(b.length) : words;
  return `${brand}|${rest.filter((w) => !STOP.has(w)).slice(0, 3).join(" ")}`;
}

/** Keep the first deal of each product family (lists are already sorted best first). */
export function withoutVariants<T extends Named>(deals: T[]): T[] {
  const seen = new Set<string>();
  return deals.filter((d) => {
    const k = familyKey(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
