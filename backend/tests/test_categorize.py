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
