"""Weekly "collection of the week" posts for X and Facebook.

The collection pages live on the website (web/src/data/collections.ts). Every Sunday at
7 PM IST the post queue shares one collection instead of a deal, rotating weekly, and
skips any collection whose page currently has nothing live.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from .captions import AMAZON_DISCLOSURE

IST = timezone(timedelta(hours=5, minutes=30))
SITE_URL = "https://cartcrush.pages.dev"
EMPTY_MARKER = "Nothing in this collection is live right now"

# slug, name, one-line pitch. Keep slugs in sync with web/src/data/collections.ts (a test checks).
COLLECTIONS: list[tuple[str, str, str]] = [
    ("winter-essentials", "Winter essentials", "jackets, heaters, blankets and dry-skin care"),
    ("home-and-kitchen-must-haves", "Home & kitchen must-haves", "cookware, storage, bedding and cleaning"),
    ("gifts-for-him-under-1000", "Gifts for him under ₹1,000", "watches, wallets, grooming and gadgets"),
    ("wedding-jewellery", "Wedding jewellery", "earrings, necklace sets and bangles for the season"),
    ("winter-jackets-under-1000", "Winter jackets under ₹1,000", "warm picks for men, women and kids"),
    ("gifts-for-her-under-1000", "Gifts for her under ₹1,000", "jewellery, handbags and beauty"),
    ("ethnic-wear-for-women", "Ethnic wear for women", "sarees, kurta sets and lehengas"),
    ("everyday-footwear", "Everyday footwear", "sneakers, sandals and slippers"),
    ("room-heaters-and-geysers", "Room heaters & geysers", "stay warm and get hot water this winter"),
    ("kurta-sets-for-men", "Kurta sets for men", "wedding and festive ethnic wear"),
    ("shorts-and-track-pants", "Shorts & track pants", "for men, women, boys and girls"),
    ("gifts-for-kids-under-500", "Gifts for kids under ₹500", "toys, games and learning toys"),
    ("budget-gadgets-under-999", "Budget gadgets under ₹999", "earbuds, chargers, speakers and more"),
    ("kitchen-appliances", "Kitchen appliances", "mixer grinders, kettles and air fryers"),
    ("skincare-essentials", "Skincare essentials", "cleansers, moisturisers and sunscreens"),
    ("earbuds-and-headphones", "Earbuds & headphones", "wireless, noise cancelling and budget picks"),
    ("home-decor-and-lighting", "Home décor & lighting", "lights, wall décor and cushions"),
    ("fitness-at-home", "Fitness at home", "dumbbells, yoga mats and resistance bands"),
    ("mobile-accessories", "Mobile accessories", "chargers, cables, power banks and covers"),
    ("grooming-for-men", "Grooming for men", "trimmers, beard care and fragrances"),
    ("baby-care-essentials", "Baby care essentials", "diapers, wipes, feeding and baby gear"),
    ("work-from-home-setup", "Work from home setup", "chairs, monitors, keyboards and lamps"),
    ("travel-essentials", "Travel essentials", "trolley bags, backpacks and power banks"),
    ("smartwatches-and-fitness-bands", "Smartwatches & fitness bands", "calling, AMOLED and budget picks"),
    ("haircare", "Haircare", "shampoos, oils, dryers and straighteners"),
    ("storage-and-organisation", "Storage & organisation", "containers, organisers and racks"),
    ("watches-for-men-and-women", "Watches for men & women", "analog, digital and chronograph"),
    ("school-and-stationery", "School & stationery", "bags, pens, notebooks and art supplies"),
    ("handbags-and-wallets", "Handbags & wallets", "totes, slings, clutches and wallets"),
]

COLLECTION_WEEKDAY = 6   # Sunday
COLLECTION_HOUR = 19     # 7 PM IST


def is_collection_slot(slot: datetime) -> bool:
    local = slot.astimezone(IST)
    return local.weekday() == COLLECTION_WEEKDAY and local.hour == COLLECTION_HOUR


def rotation(slot: datetime) -> list[tuple[str, str, str]]:
    """All collections, starting with this week's (ISO week number picks the start)."""
    week = slot.astimezone(IST).isocalendar()[1]
    start = week % len(COLLECTIONS)
    return COLLECTIONS[start:] + COLLECTIONS[:start]


def collection_url(slug: str, site_url: str = SITE_URL) -> str:
    return f"{site_url.rstrip('/')}/collections/{slug}"


def is_live(url: str, session=None, timeout: int = 20) -> bool:
    """The page exists and shows at least one product."""
    import requests

    try:
        resp = (session or requests).get(url, timeout=timeout)
    except Exception:  # noqa: BLE001
        return False
    return resp.status_code == 200 and EMPTY_MARKER not in resp.text


def build_collection_post(name: str, pitch: str, url: str, platform: str) -> str:
    if platform == "x":
        return f"🧺 Collection of the week: {name}\n{pitch[:1].upper() + pitch[1:]}, picked from Amazon India.\n{url}\n#ad #Deals"
    return "\n".join([
        f"🧺 Collection of the week: {name}",
        "",
        f"{pitch[:1].upper() + pitch[1:]}, hand-picked and checked on Amazon India.",
        "",
        f"👉 See the collection: {url}",
        "⏳ Prices change fast; each product shows when its price was checked.",
        "",
        f"#ad {AMAZON_DISCLOSURE}",
        "#dealsindia #cartcrush",
    ])


def web_slugs(ts_source: str) -> list[str]:
    """Collection slugs declared in web/src/data/collections.ts."""
    return re.findall(r'^\s{4}slug: "([a-z0-9-]+)"', ts_source, flags=re.M)
