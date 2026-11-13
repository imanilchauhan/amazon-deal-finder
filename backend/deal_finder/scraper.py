"""Playwright scraper for Amazon daily deals.

Two-stage strategy (more robust than parsing the JS-heavy deals grid):
  1. Open the /deals page and collect product ASINs from every /dp/ link.
  2. Open each product page and read title, price, list price (MRP) and image
     with stable product-page selectors.

The DOM extraction runs as JavaScript inside the page (EXTRACT_PRODUCT_JS), and the
result is normalised in pure Python (normalize_product) so it can be unit tested.

The scraper never tries to solve or evade CAPTCHAs. If Amazon serves a robot check,
it stops and returns what it has.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timezone
from typing import Iterable

from .models import (
    Deal,
    InvalidDeal,
    affiliate_url,
    clean_title,
    compute_discount_pct,
    extract_asin,
    parse_price,
    validate_deal,
)

log = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

COLLECT_LINKS_JS = """
() => Array.from(document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]'))
        .map(a => a.getAttribute('href'))
        .filter(Boolean)
"""

EXTRACT_PRODUCT_JS = """
() => {
  const text = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.textContent || '').trim() : null;
  };
  const firstText = (sels) => {
    for (const s of sels) { const t = text(s); if (t) return t; }
    return null;
  };
  const img = document.querySelector('#landingImage, #imgBlkFront, #main-image');
  let image = null;
  if (img) {
    image = img.getAttribute('data-old-hires') || null;
    if (!image) {
      const dyn = img.getAttribute('data-a-dynamic-image');
      if (dyn) {
        try {
          const entries = Object.entries(JSON.parse(dyn));
          entries.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
          if (entries.length) image = entries[0][0];
        } catch (e) { /* ignore */ }
      }
    }
    if (!image) image = img.getAttribute('src');
  }
  return {
    title: text('#productTitle'),
    price_text: firstText([
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#corePrice_feature_div .a-price .a-offscreen',
      '#corePrice_desktop .a-price .a-offscreen',
      '.priceToPay .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
    ]),
    mrp_text: firstText([
      '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
      '.basisPrice .a-price.a-text-price .a-offscreen',
      '#corePrice_desktop .a-text-price .a-offscreen',
      '#corePrice_feature_div .a-text-price .a-offscreen',
      '.a-price.a-text-price[data-a-strike="true"] .a-offscreen',
    ]),
    savings_text: firstText([
      '#corePriceDisplay_desktop_feature_div .savingsPercentage',
      '.savingsPercentage',
    ]),
    image: image,
    captcha: !!document.querySelector('form[action*="validateCaptcha"]'),
  };
}
"""


# Extra ASIN sources for large (festive) runs: Amazon.in category bestseller / movers pages.
# Every candidate still has to pass the product-page discount check, so only real deals are kept.
CATEGORY_SLUGS = [
    # Weighted to who actually buys: Tier 2/3 value shoppers (85% of festive orders were under ₹1,000),
    # beauty and personal care, fashion, footwear, kitchen and home, everyday gadgets and small appliances.
    "beauty", "hpc", "apparel", "shoes", "kitchen", "home-improvement", "electronics", "jewelry",
    "grocery", "appliances", "watches", "luggage", "toys", "sports", "baby", "office", "computers",
    "furniture", "lawn-garden", "books", "automotive", "pet-supplies", "musical-instruments",
]
BULK_RUN_THRESHOLD = 30


def interleave(lists: list[list[str]], limit: int) -> list[str]:
    """Round-robin across sources so one busy category cannot crowd out the others; unique, capped."""
    seen: dict[str, None] = {}
    depth = 0
    while len(seen) < limit and any(depth < len(x) for x in lists):
        for x in lists:
            if depth < len(x) and x[depth] not in seen:
                seen[x[depth]] = None
                if len(seen) >= limit:
                    break
        depth += 1
    return list(seen)


def source_urls(domain: str, max_products: int) -> list[str]:
    urls = [f"https://{domain}/deals"]
    if max_products > BULK_RUN_THRESHOLD:
        for kind in ("movers-and-shakers", "bestsellers"):
            urls += [f"https://{domain}/gp/{kind}/{slug}" for slug in CATEGORY_SLUGS]
    return urls


class CaptchaEncountered(RuntimeError):
    pass


def collect_asins(hrefs: Iterable[str], limit: int) -> list[str]:
    """Unique ASINs in page order."""
    seen: dict[str, None] = {}
    for href in hrefs:
        asin = extract_asin(href or "")
        if asin and asin not in seen:
            seen[asin] = None
            if len(seen) >= limit:
                break
    return list(seen)


def normalize_product(
    raw: dict,
    *,
    asin: str,
    marketplace: str,
    domain: str,
    currency: str,
    tag: str,
    min_discount_pct: int,
    now: datetime | None = None,
) -> Deal | None:
    """Turn raw DOM text into a validated Deal, or None if it is not a qualifying deal."""
    title = clean_title(raw.get("title") or "")
    price = parse_price(raw.get("price_text"))
    original = parse_price(raw.get("mrp_text"))
    image = (raw.get("image") or "").strip()

    if not title or price is None or not image.startswith("https://"):
        log.info("skip %s: missing title/price/image", asin)
        return None

    if original is None and raw.get("savings_text"):
        # e.g. "-45%": back-compute the list price from the shown saving.
        pct = parse_price((raw.get("savings_text") or "").replace("-", ""))
        if pct and 0 < pct < 95:
            original = round(price / (1 - pct / 100), 2)

    if original is None or original <= price:
        log.info("skip %s: no discount", asin)
        return None

    discount = compute_discount_pct(price, original)
    if discount < min_discount_pct:
        log.info("skip %s: discount %s%% below threshold", asin, discount)
        return None

    payload = {
        "asin": asin,
        "title": title,
        "price": price,
        "original_price": original,
        "discount_pct": discount,
        "currency": currency,
        "image_url": image,
        "url": affiliate_url(asin, tag, domain),
        "marketplace": marketplace,
        "scraped_at": (now or datetime.now(timezone.utc)).replace(microsecond=0).isoformat(),
    }
    try:
        return validate_deal(payload)
    except InvalidDeal as exc:
        log.warning("skip %s: schema validation failed: %s", asin, exc)
        return None


def _polite_pause(min_s: float = 2.0, max_s: float = 5.0) -> None:
    time.sleep(random.uniform(min_s, max_s))


def scrape_deals(
    *,
    marketplace: str,
    domain: str,
    currency: str,
    tag: str,
    max_products: int,
    min_discount_pct: int,
    headless: bool = True,
    asins: list[str] | None = None,
    extra_asins: list[str] | None = None,
) -> list[Deal]:
    """Launch headless Chromium, collect deal ASINs, extract product details.

    `asins`: scrape exactly these products and skip discovery (the trending list).
    `extra_asins`: products to re-check first on a normal run (stale trending items).
    Both accept any real discount (>= 1%): they were chosen because they sell, not
    because of the size of the drop."""
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    deals: list[Deal] = []
    locale = "en-IN" if marketplace == "in" else "en-US"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        context = browser.new_context(
            user_agent=USER_AGENT,
            locale=locale,
            viewport={"width": 1366, "height": 900},
        )
        # Skip fonts/media to save bandwidth; keep images metadata (we only read attributes).
        context.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in {"media", "font"}
            else route.continue_(),
        )
        page = context.new_page()
        page.set_default_timeout(30_000)
        try:
            wanted = max_products * 2  # extra: many candidates fail the discount check
            explicit = list(asins or [])
            sources = [] if explicit else source_urls(domain, max_products)
            per_source: list[list[str]] = []
            for url in sources:
                try:
                    page.goto(url, wait_until="domcontentloaded")
                except PlaywrightError as exc:
                    log.warning("source %s failed: %s", url, str(exc).splitlines()[0])
                    continue
                try:
                    _raise_if_captcha(page)
                except CaptchaEncountered:
                    log.warning("robot check on %s; using the %d sources collected so far", url, len(per_source))
                    break
                for _ in range(max(4, min(max_products // 6, 25)) if url.endswith("/deals") else 3):
                    page.mouse.wheel(0, 2500)
                    page.wait_for_timeout(1200)
                per_source.append(collect_asins(page.evaluate(COLLECT_LINKS_JS), 1000))
                if not url.endswith("/deals"):
                    _polite_pause()
            pinned = explicit or list(extra_asins or [])
            discovered = [a for a in interleave(per_source, wanted) if a not in pinned]
            queue = pinned + discovered
            log.info("collected %d candidate ASINs (%d pinned)", len(queue), len(pinned))
            limit = len(explicit) if explicit else max_products + len(pinned)

            for asin in queue:
                if len(deals) >= limit:
                    break
                _polite_pause()
                try:
                    page.goto(f"https://{domain}/dp/{asin}", wait_until="domcontentloaded")
                    page.wait_for_selector("#productTitle", timeout=15_000)
                except PlaywrightTimeout:
                    _raise_if_captcha(page)
                    log.info("skip %s: product page timed out", asin)
                    continue
                except PlaywrightError as exc:  # DNS/TLS/connection reset on one product
                    log.warning("skip %s: navigation failed: %s", asin, str(exc).splitlines()[0])
                    continue
                raw = page.evaluate(EXTRACT_PRODUCT_JS)
                if raw.get("captcha"):
                    raise CaptchaEncountered(f"robot check on /dp/{asin}")
                deal = normalize_product(
                    raw,
                    asin=asin,
                    marketplace=marketplace,
                    domain=domain,
                    currency=currency,
                    tag=tag,
                    min_discount_pct=1 if asin in pinned else min_discount_pct,
                )
                if deal:
                    deals.append(deal)
        except CaptchaEncountered as exc:
            log.warning("Amazon served a robot check, stopping early: %s", exc)
        except PlaywrightError as exc:
            # Deals page unreachable: keep what we have; main() emits a ::warning:: for 0 deals.
            log.error("deals page failed: %s", str(exc).splitlines()[0])
        finally:
            context.close()
            browser.close()
    return deals


def _raise_if_captcha(page) -> None:
    if page.query_selector('form[action*="validateCaptcha"]') is not None:
        raise CaptchaEncountered(page.url)
