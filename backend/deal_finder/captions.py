"""Post text for X, Facebook and Instagram, with mandatory affiliate disclosures."""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

from .models import Deal

X_MAX_WEIGHT = 280
X_URL_WEIGHT = 23  # every URL counts as 23 on X regardless of length
AMAZON_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases."

CURRENCY_SYMBOL = {"INR": "₹", "USD": "$"}


def money(amount: float, currency: str) -> str:
    symbol = CURRENCY_SYMBOL.get(currency, currency + " ")
    if float(amount).is_integer():
        body = f"{int(amount):,}"
    else:
        body = f"{amount:,.2f}"
    if currency == "INR":
        body = _indian_grouping(body)
    return f"{symbol}{body}"


def _indian_grouping(body: str) -> str:
    """1,234,567.50 -> 12,34,567.50 (lakh/crore grouping)."""
    integer, _, frac = body.replace(",", "").partition(".")
    if len(integer) > 3:
        head, tail = integer[:-3], integer[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        integer = ",".join(groups + [tail])
    return integer + ("." + frac if frac else "")


def _char_weight(ch: str) -> int:
    cp = ord(ch)
    # twitter-text v3: these ranges weigh 1, everything else (CJK, emoji...) weighs 2
    if cp <= 4351 or 8192 <= cp <= 8205 or 8208 <= cp <= 8223 or 8242 <= cp <= 8247:
        return 1
    return 2


def x_weighted_length(text: str, urls: list[str]) -> int:
    for url in urls:
        text = text.replace(url, "")
    text = unicodedata.normalize("NFC", text)
    # variation selectors / ZWJ inside emoji sequences don't add weight
    weight = sum(_char_weight(c) for c in text if c not in {"️", "‍"})
    return weight + X_URL_WEIGHT * len(urls)


def _truncate(title: str, max_chars: int) -> str:
    if len(title) <= max_chars:
        return title
    return title[: max(0, max_chars - 1)].rstrip(" ,-|") + "…"


_TITLE_SPLIT = re.compile(r"\s*[|(\[,–—:]\s*|\s+-\s+")
_DANGLING = {"for", "with", "and", "&", "of", "in", "to", "the", "a", "-", "|"}


def short_title(title: str, max_chars: int = 70, min_chars: int = 25) -> str:
    """Drop Amazon keyword-stuffing: keep leading segments until the name reads as a product,
    then cut at a word boundary (no ellipsis)."""
    parts = [p.strip() for p in _TITLE_SPLIT.split(title) if p and p.strip()]
    out = ""
    for p in parts:
        out = f"{out} {p}".strip()
        if len(out) >= min_chars:
            break
    if not out:
        out = title.strip()
    if len(out) > max_chars:
        words, out = out.split(), ""
        for w in words:
            if len(out) + len(w) + 1 > max_chars:
                break
            out = f"{out} {w}".strip()
    words = out.split()
    while len(words) > 1 and words[-1].lower() in _DANGLING:
        words.pop()
    return " ".join(words)


def is_near_duplicate(a: str, b: str, threshold: float = 0.8) -> bool:
    """Same product family (colour/size/pack variants of one listing)."""
    x, y = short_title(a).lower(), short_title(b).lower()
    return SequenceMatcher(None, x, y).ratio() >= threshold


def build_tweet(deal: Deal) -> str:
    """'🔥 46% OFF: <title>\n💰 ₹1,299 (was ₹2,399) — save ₹1,100\n<url>\n#Ad #Deals'"""
    price_line = (
        f"💰 {money(deal.price, deal.currency)} (was {money(deal.original_price, deal.currency)})"
        f" · save {money(deal.savings, deal.currency)}"
    )
    tags = "#Ad #Deals"
    title = short_title(deal.title)
    while True:
        text = f"🔥 {deal.discount_pct}% OFF: {title}\n{price_line}\n{deal.url}\n{tags}"
        if x_weighted_length(text, [deal.url]) <= X_MAX_WEIGHT:
            return text
        if len(title) <= 10:
            raise ValueError("cannot fit tweet into 280 weighted characters")
        title = _truncate(title, len(title) - 5)


def build_meta_caption(deal: Deal, keyword: str, *, platform: str) -> str:
    """Caption for FB/IG: no link, asks people to comment the keyword to get it by DM."""
    lines = [
        f"🔥 {deal.discount_pct}% OFF — {_truncate(deal.title, 140)}",
        "",
        f"💰 Now {money(deal.price, deal.currency)} (MRP {money(deal.original_price, deal.currency)})"
        if deal.currency == "INR"
        else f"💰 Now {money(deal.price, deal.currency)} (was {money(deal.original_price, deal.currency)})",
        f"✅ You save {money(deal.savings, deal.currency)}",
        "",
        f"👇 Comment \"{keyword}\" and we'll DM you the link!",
        "⏳ Prices change fast — grab it before it's gone.",
        "",
        f"#ad {AMAZON_DISCLOSURE}",
        "#dealsoftheday #lootdeals #dealsindia" if deal.marketplace == "in" else "#dealsoftheday #savings",
    ]
    caption = "\n".join(lines)
    limit = 2200 if platform == "instagram" else 60000
    return caption[:limit]



# Post themes (picker.theme): card pill + accent colour, caption hook and extra hashtags.
THEMES = {
    "winter": {"pill": "WINTER DEAL", "accent": "#2563EB", "emoji": "❄️", "hook": "Winter steal",
               "tags": ["#winterwear", "#winterdeals"]},
    "her": {"pill": "FOR HER", "accent": "#DB2777", "emoji": "💖", "hook": "For her",
            "tags": ["#womensfashion", "#fashiondeals"]},
    "trending": {"pill": "TRENDING NOW", "accent": "#D97706", "emoji": "📈", "hook": "Trending on Amazon",
                 "tags": ["#trending"]},
    "": {"pill": "TODAY'S DEAL", "accent": None, "emoji": "🔥", "hook": "Deal alert", "tags": []},
}
DEPARTMENT_TAGS = {
    "fashion": "#fashion", "beauty-personal-care": "#beauty", "home-kitchen": "#homeessentials",
    "electronics": "#gadgets", "mobiles-tablets": "#mobileaccessories", "computers-accessories": "#techdeals",
    "toys-games": "#toys", "baby": "#babyessentials", "sports-fitness-outdoors": "#fitness",
    "large-appliances": "#appliances", "health-wellness": "#wellness", "grocery-gourmet": "#grocery",
    "home-improvement-garden": "#homeimprovement", "automotive": "#carlovers", "books-media": "#books",
    "office-stationery": "#stationery", "pet-supplies": "#petlovers",
}


def _theme(name: str) -> dict:
    return THEMES.get(name or "", THEMES[""])


def _headline(deal: Deal, theme: str) -> str:
    t = _theme(theme)
    return f"{t['emoji']} {t['hook']} · {deal.discount_pct}% OFF"


def _price_line(deal: Deal) -> str:
    mrp = "MRP" if deal.currency == "INR" else "was"
    return (f"💰 {money(deal.price, deal.currency)} ({mrp} {money(deal.original_price, deal.currency)})"
            f" · you save {money(deal.savings, deal.currency)}")


def _hashtags(base: list[str], theme: str, department: str = "") -> str:
    tags = list(_theme(theme)["tags"])
    if department in DEPARTMENT_TAGS:
        tags.append(DEPARTMENT_TAGS[department])
    return " ".join(dict.fromkeys(tags + base))


def build_facebook_post(deal: Deal, *, theme: str = "", department: str = "") -> str:
    """Facebook Page post with the affiliate link in the text, shown under the deal card.

    No "comment DEAL" prompt: Meta treats comment-baiting as engagement bait and cuts
    the Page's reach. Price wording stays soft because Amazon prices change quickly."""
    lines = [
        _headline(deal, theme),
        short_title(deal.title, max_chars=110),
        "",
        _price_line(deal),
        f"🛒 Get it here: {deal.url}",
        "",
        f"#ad {AMAZON_DISCLOSURE} Price at the time of posting; Amazon prices change fast.",
        _hashtags(["#dealsindia", "#cartcrush"], theme, department),
    ]
    return "\n".join(lines)


IG_CAPTION_MAX = 2200


def build_instagram_post(deal: Deal, *, category_tag: str = "", theme: str = "", department: str = "") -> str:
    """Instagram caption. Links aren't clickable in captions, so it points to the link in bio
    and names the product so people can find it on the site. No Amazon trademarks in hashtags."""
    base = ["#dealsoftheday", "#dealsindia", "#lootdeals", "#onlineshopping", "#savemoney", "#cartcrush"]
    if category_tag:
        base.insert(0, "#" + re.sub(r"[^a-z0-9]", "", category_tag.lower()))
    name = short_title(deal.title, max_chars=110)
    lines = [
        _headline(deal, theme),
        name,
        "",
        _price_line(deal),
        "🔗 Tap the link in our bio, then search for this product on cartcrush.pages.dev",
        "",
        f"#ad {AMAZON_DISCLOSURE} Price at the time of posting; Amazon prices change fast.",
        "",
        _hashtags(base, theme, department),
    ]
    return "\n".join(lines)[:IG_CAPTION_MAX]
