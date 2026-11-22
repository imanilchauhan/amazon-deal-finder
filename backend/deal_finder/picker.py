"""Choose which deal goes out in each posting slot.

The old rule (best discount first) filled the feed with colour variants of one shoe, five
suitcases in a row and 2%-off fabric conditioner. This picker scores every fresh deal for
the slot it is filling:

* Hard rules (never posted):
  - discount below MIN_SOCIAL_DISCOUNT (an empty slot beats a weak deal);
  - the same product family (colour / size / pack variants) posted in the last FAMILY_DAYS;
  - the same brand posted in the last BRAND_HOURS;
  - "uncategorised" junk with a weak discount.
* Score = discount, plus boosts for what the audience wants right now (season: winter;
  audience: women's fashion and beauty; trending lists), minus penalties for repeating
  the department / category of the last few posts, so the feed rotates.

History comes from a small post log (Firestore meta/post_log), so it still knows about deals
that have since gone inactive. Picks made earlier in the same run are added to the log in
memory, so one run that fills four slots also spreads them out.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from .captions import short_title

MIN_SOCIAL_DISCOUNT = 30      # % off; below this a deal doesn't look like a deal on a feed
FAMILY_DAYS = 7               # no colour/size variant of the same product within a week
BRAND_HOURS = 24              # one post per brand per day
LOG_KEEP = 200                # entries kept in meta/post_log
DIVERSITY_WINDOW = 6          # last N posts checked for repeats

# Winter months in India (Nov–Feb). Matching products get a boost in those months.
WINTER_MONTHS = {11, 12, 1, 2}
WINTER_RX = re.compile(
    r"\b(winter|thermal|woolen|woollen|wool|fleece|sweater|sweatshirt|hoodie|jacket|puffer|"
    r"cardigan|shawl|stole|muffler|beanie|gloves|blanket|quilt|comforter|razai|dohar|"
    r"room heater|heater|geyser|water heater|electric blanket|hot water bag|warmer|"
    r"moisturi[sz]er|body lotion|body milk|lip balm|cold cream|petroleum jelly)\b", re.I)
WOMEN_DEPARTMENTS = {"fashion", "beauty-personal-care"}

SEASON_BOOST = 18
WOMEN_BOOST = 15
TRENDING_BOOST = 10
SWEET_SPOT_BOOST = 5          # ₹199–₹2,999: impulse-buy range that converts on social
UNCATEGORISED_PENALTY = 20
SAME_CATEGORY_PENALTY = 25    # per post of the same category in the window
SAME_DEPARTMENT_PENALTY = 8   # per post of the same department in the window
BACK_TO_BACK_PENALTY = 30     # same department as the very last post

_VARIANT_WORDS = re.compile(
    r"\b(black|white|blue|navy|red|green|sea green|olive|grey|gray|silver|gold|golden|rose|pink|"
    r"peach|purple|violet|yellow|orange|brown|beige|cream|maroon|wine|teal|multicolou?r|"
    r"small|medium|large|xl|xxl|xs|s|m|l|cabin|check[- ]?in|pack|set|of|combo|size|sizes|"
    r"\d+(\.\d+)?\s?(l|ml|kg|g|gb|tb|cm|mm|inch|inches|feet|ft|pcs|pieces|litre|liter)?)\b", re.I)


def family_key(title: str, brand: str | None = None) -> str:
    """Brand + the first meaningful words of the product name, with colours/sizes removed.
    'HRX Kyoto Medium Size Peach … Suitcase' and '… White …' give the same key."""
    words = re.sub(r"[^a-z0-9 ]+", " ", _VARIANT_WORDS.sub(" ", short_title(title, 80).lower())).split()
    b = (brand or "").lower().strip()
    if b and words[: len(b.split())] == b.split():
        words = words[len(b.split()):]
    stop = {"for", "with", "and", "the", "in", "to", "a", "men", "mens", "women", "womens", "unisex",
            "boys", "girls", "kids", "adults", "adult", "new", "latest", "stylish", "premium"}
    core = [w for w in words if w not in stop][:3]
    return f"{b}|{' '.join(core)}"


def is_winter_item(title: str) -> bool:
    return bool(WINTER_RX.search(title or ""))


def is_for_her(doc: dict) -> bool:
    return doc.get("gender") == "women" and doc.get("department") in WOMEN_DEPARTMENTS | {"fashion"}


def theme(doc: dict, when: datetime) -> str:
    """One label for the card and caption: 'winter', 'her', 'trending' or ''."""
    if when.month in WINTER_MONTHS and is_winter_item(doc.get("title", "")):
        return "winter"
    if is_for_her(doc):
        return "her"
    if doc.get("source") == "trending":
        return "trending"
    return ""


@dataclass
class LogEntry:
    asin: str
    at: datetime
    brand: str
    family: str
    department: str
    category: str

    @classmethod
    def from_doc(cls, doc: dict, at: datetime) -> "LogEntry":
        brand = str(doc.get("brand") or "").strip()
        return cls(asin=doc.get("asin", ""), at=at, brand=brand.lower(),
                   family=family_key(doc.get("title", ""), brand),
                   department=str(doc.get("department") or "uncategorised"),
                   category=str(doc.get("category") or "uncategorised"))

    def to_dict(self) -> dict:
        return {"asin": self.asin, "at": self.at, "brand": self.brand, "family": self.family,
                "department": self.department, "category": self.category}

    @classmethod
    def from_dict(cls, d: dict) -> "LogEntry":
        return cls(asin=d.get("asin", ""), at=d["at"], brand=d.get("brand", ""), family=d.get("family", ""),
                   department=d.get("department", ""), category=d.get("category", ""))


def log_from_docs(docs: list[dict]) -> list[LogEntry]:
    """Rebuild a log from the deals' own `posted` stamps (first run, or when the log is missing)."""
    out = []
    for d in docs:
        stamps = [v.get("at") for v in (d.get("posted") or {}).values() if v.get("at")]
        if stamps:
            out.append(LogEntry.from_doc(d, max(stamps)))
    return sorted(out, key=lambda e: e.at)


def merge_logs(*logs: list[LogEntry]) -> list[LogEntry]:
    seen: dict[tuple[str, datetime], LogEntry] = {}
    for log in logs:
        for e in log:
            seen.setdefault((e.asin, e.at.replace(second=0, microsecond=0)), e)
    return sorted(seen.values(), key=lambda e: e.at)[-LOG_KEEP:]


def blocked(doc: dict, history: list[LogEntry], when: datetime) -> str | None:
    """Why this deal can't go out in this slot, or None."""
    if (doc.get("discount_pct") or 0) < MIN_SOCIAL_DISCOUNT:
        return "weak discount"
    brand = str(doc.get("brand") or "").strip().lower()
    fam = family_key(doc.get("title", ""), doc.get("brand"))
    for e in history:
        age = when - e.at
        if e.asin == doc.get("asin"):
            continue  # the deal's own earlier posts: per-channel repeats are handled by the queue
        if e.family == fam and age < timedelta(days=FAMILY_DAYS):
            return "variant posted this week"
        if brand and e.brand == brand and age < timedelta(hours=BRAND_HOURS):
            return "brand posted today"
    return None


def recently_on(doc: dict, platform: str, when: datetime) -> bool:
    """Posted on this channel within FAMILY_DAYS (no re-posts inside a week, even on a price drop)."""
    at = ((doc.get("posted") or {}).get(platform) or {}).get("at")
    return bool(at) and when - at < timedelta(days=FAMILY_DAYS)


def score(doc: dict, history: list[LogEntry], when: datetime) -> float:
    s = float(doc.get("discount_pct") or 0)
    title = doc.get("title", "")
    if when.month in WINTER_MONTHS and is_winter_item(title):
        s += SEASON_BOOST
    if is_for_her(doc):
        s += WOMEN_BOOST
    if doc.get("source") == "trending":
        s += TRENDING_BOOST
    if 199 <= (doc.get("price") or 0) <= 2999:
        s += SWEET_SPOT_BOOST
    dept = str(doc.get("department") or "uncategorised")
    cat = str(doc.get("category") or "uncategorised")
    if dept == "uncategorised":
        s -= UNCATEGORISED_PENALTY
    window = [e for e in history if e.at <= when][-DIVERSITY_WINDOW:]
    s -= SAME_CATEGORY_PENALTY * sum(e.category == cat for e in window)
    s -= SAME_DEPARTMENT_PENALTY * sum(e.department == dept for e in window)
    if window and window[-1].department == dept:
        s -= BACK_TO_BACK_PENALTY
    return s


def rank(docs: list[dict], history: list[LogEntry], when: datetime) -> list[tuple[float, dict]]:
    """Eligible deals for `when`, best first."""
    out = []
    for d in docs:
        if blocked(d, history, when):
            continue
        out.append((score(d, history, when), d))
    out.sort(key=lambda x: -x[0])
    return out
