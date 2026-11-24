/**
 * "Ask CartCrush": turn a sentence like "warm jacket under ₹1,000 for my dad" into the deal
 * filters the catalogue already understands (keywords, max price, who it's for). No AI service:
 * it runs in the browser, instantly and free.
 */
export type Ask = { words: string[]; max?: number; min?: number; who?: "men" | "women" | "kids" };

const WHO: [Ask["who"], RegExp][] = [
  ["women", /\b(women|woman|womens|ladies|her|she|mom|mother|mum|wife|girlfriend|sister|daughter in law|bhabhi|didi|aunt)\b/i],
  ["men", /\b(men|man|mens|him|he|dad|father|papa|husband|boyfriend|brother|bhai|uncle)\b/i],
  ["kids", /\b(kids?|child|children|son|daughter|baby|toddler|boy|girl)\b/i],
];
const STOP = new Set(
  "a an the for my me to of and or with in on at under below less than within upto up over above from best good nice cheap cheapest new buy deal deals gift gifts present something some any i need want looking find show please".split(
    " ",
  ),
);
/** A few everyday words that mean several product words. */
const SYNONYMS: Record<string, string[]> = {
  warm: ["jacket", "sweater", "sweatshirt", "hoodie", "thermal", "blanket", "heater", "shawl", "fleece", "cardigan"],
  winter: ["jacket", "sweater", "sweatshirt", "hoodie", "thermal", "blanket", "heater", "shawl", "fleece", "cardigan"],
  earphones: ["earbuds", "earphone", "headphone", "neckband"],
  phone: ["phone", "mobile"],
};

function amount(s: string): number {
  const m = s.replace(/[,₹\s]/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/i);
  return m ? Math.round(Number(m[1]) * (m[2] ? 1000 : 1)) : NaN;
}

export function parseAsk(text: string): Ask {
  let t = ` ${text.toLowerCase()} `;
  const out: Ask = { words: [] };
  const num = "₹?\\s?([\\d,]+(?:\\.\\d+)?k?)";
  const under = t.match(new RegExp(`\\b(?:under|below|less than|within|upto|up to|max|<)\\s*(?:rs\\.?|inr)?\\s*${num}`, "i"));
  if (under) {
    out.max = amount(under[1]);
    t = t.replace(under[0], " ");
  }
  const over = t.match(new RegExp(`\\b(?:over|above|more than|from|min|>)\\s*(?:rs\\.?|inr)?\\s*${num}`, "i"));
  if (over) {
    out.min = amount(over[1]);
    t = t.replace(over[0], " ");
  }
  for (const [who, rx] of WHO) {
    if (rx.test(t)) {
      out.who = who;
      t = t.replace(new RegExp(rx.source, "gi"), " ");
      break;
    }
  }
  out.words = t
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  return out;
}

/** True when the deal title fits every keyword (a keyword with synonyms fits any of them). */
export function titleMatches(title: string, words: string[]): boolean {
  const t = title.toLowerCase();
  return words.every((w) => {
    const alts = SYNONYMS[w] ?? [w.replace(/s$/, "")];
    return alts.some((a) => t.includes(a));
  });
}

/** /deals query string for an ask. */
export function askToQuery(text: string): string {
  const a = parseAsk(text);
  const p = new URLSearchParams();
  if (a.words.length) p.set("q", a.words.join(" "));
  if (a.max && Number.isFinite(a.max)) p.set("max", String(a.max));
  if (a.min && Number.isFinite(a.min)) p.set("min", String(a.min));
  if (a.who) p.set("for", a.who);
  p.set("ask", text.trim().slice(0, 120));
  return p.toString();
}
