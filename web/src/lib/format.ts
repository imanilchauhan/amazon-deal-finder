const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

/** ₹1,23,456 (Indian grouping for INR). */
export function money(amount: number, currency = "INR"): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const digits = Number.isInteger(amount) ? 0 : 2;
  const body = amount.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${SYMBOL[currency] ?? currency + " "}${body}`;
}

const SPLIT = /\s*[|([,–—:]\s*|\s+-\s+/;
const DANGLING = new Set(["for", "with", "and", "&", "of", "in", "to", "the", "a", "-", "|"]);

/** Strip Amazon keyword stuffing: "Brand Product Name" (≤ maxChars, cut at a word). */
export function shortTitle(title: string, maxChars = 70, minChars = 25): string {
  let out = "";
  for (const part of title.split(SPLIT)) {
    const p = part.trim();
    if (!p) continue;
    out = `${out} ${p}`.trim();
    if (out.length >= minChars) break;
  }
  if (!out) out = title.trim();
  if (out.length > maxChars) {
    let cut = "";
    for (const w of out.split(/\s+/)) {
      if (cut.length + w.length + 1 > maxChars) break;
      cut = `${cut} ${w}`.trim();
    }
    out = cut;
  }
  const words = out.split(/\s+/);
  while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const ASIN = /^[A-Z0-9]{10}$/;

export function dealSlug(title: string, asin: string): string {
  const base = slugify(shortTitle(title));
  return base ? `${base}-${asin.toLowerCase()}` : asin.toLowerCase();
}

/** "/deals/boat-rockerz-450-b0abc12345" → "B0ABC12345" */
export function asinFromSlug(slug: string): string | null {
  const last = slug.split("-").pop()?.toUpperCase() ?? "";
  return ASIN.test(last) ? last : null;
}

/** "12 Nov 2026, 1:26 pm IST" */
export function istDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " IST"
  );
}
