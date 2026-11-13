import json

from deal_finder.categorize import TAXONOMY_PATH, classify


def test_known_titles():
    assert classify("boAt Airdopes 141 Bluetooth TWS Earbuds")["category"] == "headphones-earbuds"
    assert classify("Prestige Non-stick Kadai 24cm")["department"] == "home-kitchen"
    c = classify("Women's Cotton Kurti Set")
    assert (c["department"], c["gender"]) == ("fashion", "women")


def test_unknown_goes_to_uncategorised_with_zero_confidence():
    c = classify("Zzxq widget")
    assert c["department"] == "uncategorised" and c["category_confidence"] == 0.0


def test_brand_handles_accents_and_skips_generic_words():
    assert classify("Lakmé 9to5 Lipstick")["brand"] == "Lakmé"
    assert classify("LED String Lights")["brand"] is None


def test_every_department_has_other_and_unique_slugs():
    t = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    slugs = [d["slug"] for d in t["departments"]]
    assert len(slugs) == len(set(slugs))
    for d in t["departments"]:
        assert any(c["slug"] == "other" for c in d["categories"])


def test_web_copy_of_taxonomy_is_in_sync():
    from pathlib import Path

    web = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "taxonomy.json"
    assert json.loads(web.read_text(encoding="utf-8")) == json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))


def test_gender_word_is_not_a_brand():
    assert classify("Women's Cotton Kurti Set")["brand"] is None


def test_backfill_tags_everything_but_manual(fake_db):
    from deal_finder.backfill import tag_all

    fake_db.data["deals"] = {
        "A": {"title": "Prestige Non-stick Kadai 24cm", "posted": {}},
        "B": {"title": "Prestige Non-stick Kadai 24cm", "category_source": "manual", "department": "fashion"},
    }
    stats = tag_all(fake_db)
    assert stats["tagged"] == 1 and stats["skipped_manual"] == 1
    assert fake_db.data["deals"]["A"]["department"] == "home-kitchen"
    assert fake_db.data["deals"]["A"]["x_status"] == "unposted"
    assert fake_db.data["deals"]["B"]["department"] == "fashion"


def test_mouse_pad_and_phone_case_land_in_the_right_shelf():
    assert classify("Ant Esports Prism Mouse Pad Gaming")["category"] == "keyboards-mice"
    assert classify("DIZORO Samsung S26 Ultra Case")["category"] == "mobile-accessories"


def test_winter_and_trending_products_are_categorised():
    from deal_finder.categorize import classify
    cases = {
        "Havells Zeta 1500 watt Immersion Heater | ISI Mark": ("large-appliances", "heaters-geysers"),
        "Orpat OEH-1220 2000-Watt Fan Heater (White)": ("large-appliances", "heaters-geysers"),
        "Havells Instanio 3L Instant Water Heater(Geyser)": ("large-appliances", "heaters-geysers"),
        "NIVEA Nourishing Body Milk 600ml Body Lotion": ("beauty-personal-care", "skincare"),
        "MEENAZ Brass copper Gold kanchain 3 layer long bridal wedding ear kan chain": ("fashion", "jewellery"),
        "Casio Vintage A-158WA-1Q Digital Grey Dial Unisex Watch": ("fashion", "watches"),
        "Comfort Morning Fresh Fabric Conditioner 2 L Refill Pack": ("home-kitchen", "cleaning"),
        "Lifelong LLKS03 Foldable Kick Skating Cycle| Skate Scooter for Kids": ("toys-games", "outdoor-play"),
    }
    for title, (dept, cat) in cases.items():
        c = classify(title)
        assert (c["department"], c["category"]) == (dept, cat), title
