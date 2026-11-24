import type { Deal } from "./deal-model";

/** Mirrors backend picker.py: winter items (Nov–Feb), women's fashion and beauty (not kids'). */
const WINTER_RX =
  /\b(winter|thermal|woolen|woollen|wool|fleece|sweater|sweatshirt|hoodie|jacket|puffer|cardigan|shawl|stole|muffler|beanie|gloves|blanket|quilt|comforter|razai|dohar|room heater|heater|geyser|water heater|electric blanket|hot water bag|warmer)\b/i;
const NOT_WINTER_RX = /\bac\s+(comforter|blanket|quilt|dohar|duvet)|\bsummer\b|\bcooling\b/i;
const KIDS_RX = /\b(girls?|kids?|baby|babies|toddler|infant|child|children|years?)\b/i;
const GIFT_DEPTS = new Set(["electronics", "toys-games"]);
const GIFT_CATS = new Set(["watches", "jewellery", "bags-luggage", "fragrance", "smartwatches-bands", "headphones-earbuds"]);
const HOME_DEPTS = new Set(["home-kitchen", "large-appliances", "home-improvement-garden"]);

export const WINTER_MONTHS = new Set([10, 11, 0, 1]); // Nov–Feb (0-based)

export function isWinter(d: Pick<Deal, "title">, now = new Date()): boolean {
  return WINTER_MONTHS.has(now.getMonth()) && WINTER_RX.test(d.title) && !NOT_WINTER_RX.test(d.title);
}

export function isForHer(d: Pick<Deal, "title" | "gender" | "department">): boolean {
  return d.gender === "women" && (d.department === "fashion" || d.department === "beauty-personal-care") && !KIDS_RX.test(d.title);
}

export type Mood = "winter" | "her" | "gifts" | "home" | "under499";

export const MOODS: { id: Mood | "all"; label: string }[] = [
  { id: "all", label: "All deals" },
  { id: "winter", label: "Winter" },
  { id: "her", label: "For her" },
  { id: "gifts", label: "Gifts" },
  { id: "home", label: "Home" },
  { id: "under499", label: "Under ₹499" },
];

export function moodsOf(d: Deal, now = new Date()): Mood[] {
  const out: Mood[] = [];
  if (isWinter(d, now)) out.push("winter");
  if (isForHer(d)) out.push("her");
  if (GIFT_DEPTS.has(d.department) || GIFT_CATS.has(d.category)) out.push("gifts");
  if (HOME_DEPTS.has(d.department)) out.push("home");
  if (d.price < 500) out.push("under499");
  return out;
}

/** One short, factual label for a card ("Winter warmer", "Gift idea"…), or "" for none. */
export function dealTag(d: Deal, now = new Date()): string {
  if (isWinter(d, now)) return "Winter warmer";
  if (isForHer(d)) return "For her";
  if (GIFT_CATS.has(d.category) || GIFT_DEPTS.has(d.department)) return "Gift idea";
  if (d.department === "home-kitchen") return "Home pick";
  if (d.price < 500) return "Under ₹500";
  return "";
}
