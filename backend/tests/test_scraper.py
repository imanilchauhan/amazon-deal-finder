import re
from datetime import datetime, timezone

import pytest

from deal_finder.models import schema_errors
from deal_finder.scraper import (
    COLLECT_LINKS_JS,
    EXTRACT_PRODUCT_JS,
    collect_asins,
    normalize_product,
)
from tests.conftest import FIXTURES

KW = dict(marketplace="in", domain="www.amazon.in", currency="INR", tag="mytag-21",
          min_discount_pct=20, now=datetime(2026, 11, 5, 12, tzinfo=timezone.utc))

RAW = {
    "title": "  boAt Rockerz 450   Bluetooth Headphones ",
    "price_text": "₹1,299",
    "mrp_text": "₹2,399",
    "savings_text": "-46%",
    "image": "https://m.media-amazon.com/images/I/61u1VALn6JL._SL1500_.jpg",
}


def test_collect_asins_dedupes_and_limits():
    hrefs = ["/a/dp/B07PR1CL3S/x", "/dp/B07PR1CL3S?th=1", "/dp/B01N7GYQ7M/", "/deal/x", "/dp/B0CHX1W1XY"]
    assert collect_asins(hrefs, 10) == ["B07PR1CL3S", "B01N7GYQ7M", "B0CHX1W1XY"]
    assert collect_asins(hrefs, 2) == ["B07PR1CL3S", "B01N7GYQ7M"]


def test_normalize_product_builds_schema_valid_deal():
    deal = normalize_product(RAW, asin="B07PR1CL3S", **KW)
    assert deal is not None
    assert deal.title == "boAt Rockerz 450 Bluetooth Headphones"
    assert (deal.price, deal.original_price, deal.discount_pct) == (1299.0, 2399.0, 46)
    assert deal.url == "https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21"
    assert deal.scraped_at == "2026-11-05T12:00:00+00:00"
    assert schema_errors(deal.to_dict()) == []


def test_normalize_back_computes_mrp_from_savings_pct():
    raw = {**RAW, "mrp_text": None, "savings_text": "-40%", "price_text": "₹899.00"}
    deal = normalize_product(raw, asin="B01N7GYQ7M", **KW)
    assert deal.original_price == pytest.approx(1498.33)
    assert deal.discount_pct == 40


@pytest.mark.parametrize(
    "override",
    [
        {"price_text": None},
        {"title": ""},
        {"image": "http://insecure/img.jpg"},
        {"mrp_text": None, "savings_text": None},
        {"mrp_text": "₹1,000"},              # price above MRP
        {"mrp_text": "₹1,400"},              # 7% < 20% threshold
    ],
)
def test_normalize_rejects_non_deals(override):
    assert normalize_product({**RAW, **override}, asin="B07PR1CL3S", **KW) is None


# --- Runs the real in-page JavaScript against saved Amazon-like HTML -----------
@pytest.fixture(scope="module")
def page():
    sync_api = pytest.importorskip("playwright.sync_api")
    try:
        pw = sync_api.sync_playwright().start()
        browser = pw.chromium.launch()
    except Exception as exc:  # browser binaries not installed
        pytest.skip(f"Chromium not available: {exc}")
    pg = browser.new_page()
    yield pg
    browser.close()
    pw.stop()


@pytest.mark.browser
def test_extract_js_on_product_fixture(page):
    page.set_content((FIXTURES / "product_page.html").read_text(encoding="utf-8"))
    raw = page.evaluate(EXTRACT_PRODUCT_JS)
    assert raw["price_text"] == "₹1,299"
    assert raw["mrp_text"] == "₹2,399"
    assert raw["image"].endswith("_SL1500_.jpg")
    assert raw["captcha"] is False
    deal = normalize_product(raw, asin="B07PR1CL3S", **KW)
    assert deal.discount_pct == 46
    assert deal.title.startswith("boAt Rockerz 450 Bluetooth On Ear Headphones")


@pytest.mark.browser
def test_extract_js_picks_largest_dynamic_image(page):
    page.set_content((FIXTURES / "product_page_savings_only.html").read_text(encoding="utf-8"))
    raw = page.evaluate(EXTRACT_PRODUCT_JS)
    assert raw["image"] == "https://m.media-amazon.com/images/I/big.jpg"
    assert raw["mrp_text"] is None and raw["savings_text"] == "-40%"


@pytest.mark.browser
def test_collect_links_js_on_deals_fixture(page):
    page.set_content((FIXTURES / "deals_page.html").read_text(encoding="utf-8"))
    hrefs = page.evaluate(COLLECT_LINKS_JS)
    assert collect_asins(hrefs, 10) == ["B07PR1CL3S", "B01N7GYQ7M", "B0CHX1W1XY"]


@pytest.mark.browser
def test_captcha_page_is_detected(page):
    page.set_content('<form action="/errors/validateCaptcha"><input name="field-keywords"></form>')
    assert page.evaluate(EXTRACT_PRODUCT_JS)["captcha"] is True
    assert re.search("validateCaptcha", page.content())


def test_source_urls_expand_only_for_bulk_runs():
    from deal_finder.scraper import source_urls

    from datetime import datetime, timezone

    nov = datetime(2026, 11, 22, 14, 0, tzinfo=timezone.utc)
    small = source_urls("amazon.in", 15, nov)
    assert small[0] == "https://amazon.in/deals" and len(small) == 3
    assert all(u.startswith("https://amazon.in/s?k=") for u in small[1:])
    assert len(source_urls("amazon.in", 15, nov.replace(month=6))) == 2  # no winter search in June
    bulk = source_urls("amazon.in", 150, nov)
    assert bulk[0] == "https://amazon.in/deals" and len(bulk) > 20
    assert "https://amazon.in/gp/bestsellers/kitchen" in bulk


def test_interleave_is_round_robin_unique_and_capped():
    from deal_finder.scraper import interleave

    out = interleave([["A", "B", "C"], ["D", "A", "E"], ["F"]], 6)
    assert out == ["A", "D", "F", "B", "C", "E"]
    assert interleave([["A", "B"], ["C", "D"]], 3) == ["A", "C", "B"]


def test_full_price_product_kept_only_for_collection_picks():
    raw = {**RAW, "mrp_text": None, "savings_text": None}
    assert normalize_product(raw, asin="B07PR1CL3S", **KW) is None  # normal scrape: no discount, skip
    kw = {**KW, "min_discount_pct": 0}
    deal = normalize_product(raw, asin="B07PR1CL3S", **kw)
    assert (deal.price, deal.original_price, deal.discount_pct) == (1299.0, 1299.0, 0)
    assert schema_errors(deal.to_dict()) == []


def test_focus_searches_rotate_through_women_and_winter_lists():
    from datetime import datetime, timedelta, timezone

    from deal_finder.scraper import WINTER_SEARCHES, WOMEN_SEARCHES, focus_searches

    start = datetime(2026, 11, 22, 0, 0, tzinfo=timezone.utc)
    seen = {q for i in range(48) for q in focus_searches(start + timedelta(minutes=15 * i))}
    assert set(WOMEN_SEARCHES) <= seen and set(WINTER_SEARCHES) <= seen


def test_gallery_images_dedupes_keeps_main_first_and_caps():
    from deal_finder.scraper import MAX_IMAGES, gallery_images

    main = "https://m.media-amazon.com/images/I/71main._SL1500_.jpg"
    raw = [
        "https://m.media-amazon.com/images/I/71main._AC_SL1200_.jpg",  # same photo, other size
        "https://m.media-amazon.com/images/I/61b.jpg",
        "https://evil.example.com/images/I/x.jpg",
        "http://m.media-amazon.com/images/I/insecure.jpg",
        *[f"https://m.media-amazon.com/images/I/8{i}x.jpg" for i in range(10)],
    ]
    out = gallery_images(raw, main)
    assert out[0] == main
    assert out[1] == "https://m.media-amazon.com/images/I/61b.jpg"
    assert len(out) == MAX_IMAGES
    assert all(u.startswith("https://m.media-amazon.com/") for u in out)


def test_gallery_images_empty_when_only_the_main_photo():
    from deal_finder.scraper import gallery_images

    main = "https://m.media-amazon.com/images/I/71main.jpg"
    assert gallery_images([main], main) == []
    assert gallery_images(None, main) == []


def test_deal_to_dict_omits_empty_gallery_and_lists_it_otherwise():
    from deal_finder.models import validate_deal

    base = {
        "asin": "B0TEST1234", "title": "Test product", "price": 50.0, "original_price": 100.0,
        "discount_pct": 50, "currency": "INR", "image_url": "https://m.media-amazon.com/images/I/a.jpg",
        "url": "https://www.amazon.in/dp/B0TEST1234/?tag=cartcrush004-21", "marketplace": "in",
        "scraped_at": "2026-11-25T10:00:00+00:00",
    }
    assert "images" not in validate_deal(base).to_dict()
    pics = ["https://m.media-amazon.com/images/I/a.jpg", "https://m.media-amazon.com/images/I/b.jpg"]
    assert validate_deal({**base, "images": pics}).to_dict()["images"] == pics


def test_gallery_images_drops_amazon_measurement_path():
    from deal_finder.scraper import gallery_images

    main = "https://m.media-amazon.com/images/I/71Q3OAOmstL._SL1500_.jpg"
    raw = [
        "https://m.media-amazon.com/images/W/BW_MEDIAX_AVIF_MEASUREMENT_1306696-T4/images/I/71Q3OAOmstL._SL1500_.jpg",
        "https://m.media-amazon.com/images/W/BW_MEDIAX_AVIF_MEASUREMENT_1306696-T4/images/I/81W+YLXXUJL._SL1500_.jpg",
    ]
    assert gallery_images(raw, main) == [main, "https://m.media-amazon.com/images/I/81W+YLXXUJL._SL1500_.jpg"]
