from datetime import datetime, timedelta, timezone

from deal_finder.picker import (LogEntry, blocked, family_key, is_winter_item, merge_logs, rank, score,
                                theme)

WHEN = datetime(2026, 11, 23, 4, 30, tzinfo=timezone.utc)


def d(asin, title, *, brand="", dept="fashion", cat="clothing", pct=60, price=999, gender=None, source=None):
    return {"asin": asin, "title": title, "brand": brand, "department": dept, "category": cat,
            "discount_pct": pct, "price": price, "gender": gender, "source": source}


def logged(doc, hours_ago):
    return LogEntry.from_doc(doc, WHEN - timedelta(hours=hours_ago))


def test_colour_and_size_variants_share_a_family():
    a = family_key("HRX Kyoto Medium Size Peach Polypropylene Hard Shell Suitcase", "HRX")
    b = family_key("HRX Kyoto Medium Size White Polypropylene Hard Shell Suitcase", "HRX")
    c = family_key("HRX Zanzibar Cabin Size Haileys Black Polypropylene Hard Shell", "HRX")
    assert a == b and a != c


def test_weak_discounts_variants_and_same_brand_are_blocked():
    shoe = d("B1", "Red Tape Sports Shoes for Men in White Blue", brand="Red", cat="footwear")
    assert blocked(d("B0", "Comfort Fabric Conditioner 2 L", pct=2), [], WHEN) == "weak discount"
    variant = d("B2", "Red Tape Sports Shoes for Men in Sea Green", brand="Red", cat="footwear")
    assert blocked(variant, [logged(shoe, 30)], WHEN) == "variant posted this week"
    other = d("B3", "Red Tape Casual Loafers Brown", brand="Red", cat="footwear")
    assert blocked(other, [logged(shoe, 5)], WHEN) == "brand posted today"
    assert blocked(other, [logged(shoe, 30)], WHEN) is None
    assert blocked(shoe, [logged(shoe, 5)], WHEN) is None  # own history is the queue's job


def test_winter_and_women_get_boosted_and_repeats_get_pushed_down():
    socks = d("W1", "Thermal Woollen Socks", dept="fashion", cat="accessories", pct=50)
    kurta = d("K1", "Women Rayon Kurta Set", gender="women", pct=50)
    cable = d("C1", "USB Type-C Cable", dept="mobiles-tablets", cat="mobile-accessories", pct=50)
    assert score(socks, [], WHEN) > score(cable, [], WHEN)
    assert score(kurta, [], WHEN) > score(cable, [], WHEN)
    history = [logged(d("L1", "Hard Shell Suitcase", brand="Safari", cat="bags-luggage"), 1)]
    luggage = d("L2", "Trolley Bag Large", brand="Skybags", cat="bags-luggage", pct=70)
    lamp = d("H1", "LED Table Lamp", dept="home-kitchen", cat="lighting", pct=60)
    assert rank([luggage, lamp], history, WHEN)[0][1]["asin"] == "H1"
    assert is_winter_item("Polar Fleece Single Bed Blanket") and not is_winter_item("Pressure Cooker")
    assert not is_winter_item("Microfiber Reversible Single Bed AC Comforter")


def test_theme_labels():
    assert theme(d("A", "Puffer Winter Jacket"), WHEN) == "winter"
    assert theme(d("B", "Anarkali Kurta", gender="women"), WHEN) == "her"
    assert theme(d("C", "Steel Bottle", dept="home-kitchen", cat="storage-containers", source="trending"), WHEN) == "trending"
    assert theme(d("D", "Puffer Winter Jacket"), WHEN.replace(month=6)) == ""
    assert theme(d("E", "Girls Half Saree Langa Voni 5-6 Years", gender="women"), WHEN) == ""


def test_merge_logs_dedupes_and_keeps_order():
    a = logged(d("A", "x"), 3)
    b = logged(d("B", "y"), 1)
    assert [e.asin for e in merge_logs([b, a], [a])] == ["A", "B"]


def test_a_run_spreads_slots_across_products_and_skips_weak_deals():
    from deal_finder.post_queue import run_once
    from tests.conftest import make_deal
    from tests.test_post_queue import MORNING, Poster, Store, doc

    def deal(asin, title, price, original, **extra):
        dd = doc(make_deal(asin, title=title, price=price, original=original))
        dd.update(extra)
        return dd

    pool = [
        deal("B0SHOE0001", "Red Tape Sports Shoes for Men in White Blue", 300, 2000,
             brand="Red", department="fashion", category="footwear"),
        deal("B0SHOE0002", "Red Tape Sports Shoes for Men in Sea Green", 300, 2000,
             brand="Red", department="fashion", category="footwear"),
        deal("B0SHOE0003", "Red Tape Sports Shoes for Men in Black", 300, 2000,
             brand="Red", department="fashion", category="footwear"),
        deal("B0KURTA001", "KLOSIA Women Rayon Anarkali Kurta Set", 500, 1500,
             brand="KLOSIA", department="fashion", category="clothing", gender="women"),
        deal("B0BLANKET1", "Polar Fleece Double Bed Blanket", 600, 1800,
             brand="BSB", department="home-kitchen", category="bedding-bath"),
        deal("B0WEAK0001", "Comfort Fabric Conditioner 2 L", 490, 500,
             brand="Comfort", department="home-kitchen", category="cleaning"),
    ]
    x = Poster("x")
    slots = [MORNING + timedelta(hours=h) for h in (1, 2, 3, 4)]
    out = run_once(Store(pool), {"x": x}, MORNING, slots=slots)
    picked = [a for a, _ in x.sent]
    assert len(picked) == 3 and len(out.skipped_slots) == 1   # 4th slot: only shoe variants / weak left
    assert sum(a.startswith("B0SHOE") for a in picked) == 1
    assert {"B0KURTA001", "B0BLANKET1"} <= set(picked) and "B0WEAK0001" not in picked
