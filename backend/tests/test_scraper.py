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

    assert source_urls("amazon.in", 15) == ["https://amazon.in/deals"]
    bulk = source_urls("amazon.in", 150)
    assert bulk[0] == "https://amazon.in/deals" and len(bulk) > 20
    assert "https://amazon.in/gp/bestsellers/kitchen" in bulk
