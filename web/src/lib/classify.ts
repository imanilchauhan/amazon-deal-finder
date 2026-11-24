import { DEPARTMENTS } from "./taxonomy";

/** Browser/TS port of backend/deal_finder/categorize.py (same taxonomy.json, same scoring). */
export type Classified = {
  department: string;
  category: string;
  category_path: string[];
  category_source: "rules" | "manual";
  category_confidence: number;
  brand: string | null;
  gender: "men" | "women" | "kids" | null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RULES = DEPARTMENTS.flatMap((d) =>
  d.categories.flatMap((c) =>
    c.keywords
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .map((k) => ({
        dep: d.slug,
        cat: c.slug,
        weight: k.length,
        rx: new RegExp(`(?<![a-z0-9])${esc(k)}(?:s|es)?(?![a-z0-9])`),
      })),
  ),
);

const GENDERS: [Classified["gender"], RegExp][] = [
  ["women", /\b(women|woman|womens|women's|ladies|girls?|female|her)\b/i],
  ["men", /\b(men|mens|men's|boys?|male|gents)\b/i],
  ["kids", /\b(kids?|children|toddler|infant)\b/i],
];
const GENERIC = new Set(
  "women women's womens men men's mens kids boys girls ladies pack set new premium original best pure organic smart pro portable electric led usb hd lcd ac some combo mini super ultra high multi for the".split(" "),
);

function guessBrand(title: string): string | null {
  const first = (title.match(/[\p{L}\p{N}&'.-]+/u)?.[0] ?? "").replace(/^[.'-]+|[.'-]+$/g, "");
  if (first.length < 2 || GENERIC.has(first.toLowerCase()) || /^\d+$/.test(first)) return null;
  return first.slice(0, 30);
}

export function classify(title: string): Classified {
  const text = title.toLowerCase();
  const scores = new Map<string, number>();
  for (const r of RULES) if (r.rx.test(text)) scores.set(`${r.dep}/${r.cat}`, (scores.get(`${r.dep}/${r.cat}`) ?? 0) + r.weight);
  const gender = GENDERS.find(([, rx]) => rx.test(title))?.[0] ?? null;
  // Same as the backend: "for Women" / "Men's" tips a tie towards fashion or beauty.
  if (gender === "women" || gender === "men") {
    for (const [k, v] of scores) if (k.startsWith("fashion/") || k.startsWith("beauty-personal-care/")) scores.set(k, v + 4);
  }
  const brand = guessBrand(title);
  if (!scores.size) {
    return { department: "uncategorised", category: "uncategorised", category_path: ["uncategorised"], category_source: "rules", category_confidence: 0, brand, gender };
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [key, best] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const [department, category] = key.split("/");
  const category_confidence = Math.round(Math.min(0.95, 0.5 + 0.05 * best) * (best > second ? 1 : 0.7) * 100) / 100;
  return { department, category, category_path: [department, category], category_source: "rules", category_confidence, brand, gender };
}
