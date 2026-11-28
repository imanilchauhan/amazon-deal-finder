"""Pipeline entry point:  python -m deal_finder

scrape -> validate (JSON schema) -> Firestore upsert/dedupe -> pick post candidates
-> render media -> X / Facebook / Instagram -> record post state + comment mappings.

Each platform failure is isolated: one failing post never stops the others.
Exit code is non-zero only for configuration or Firestore failures.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .captions import build_meta_caption, is_near_duplicate
from .config import Config, ConfigError, load_config
from .models import Deal, schema_errors
from .store import DealStore, StoreError, UpsertResult, needs_post

log = logging.getLogger("deal_finder")


@dataclass
class RunSummary:
    scraped: int = 0
    valid: int = 0
    new: int = 0
    updated: int = 0
    deactivated: int = 0
    skipped_duplicates: int = 0
    posts: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class Deps:
    scrape: Callable[[], list[Deal]]
    store: DealStore | None
    x: object | None = None            # XPoster
    meta: object | None = None         # MetaClient
    render: Callable[[Deal, bool], dict] | None = None
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    catalog: object | None = None      # catalog.CatalogCache (product cache for the site/admin)


def run(cfg: Config, deps: Deps) -> RunSummary:
    s = RunSummary()
    deals = deps.scrape()
    s.scraped = len(deals)

    # Defensive re-validation right before anything leaves the process.
    valid: list[Deal] = []
    for d in deals:
        errs = schema_errors(d.to_dict())
        if errs:
            s.errors.append({"asin": d.asin, "stage": "schema", "error": "; ".join(errs)})
        else:
            valid.append(d)
    s.valid = len(valid)

    if cfg.dry_run or deps.store is None:
        log.info("DRY_RUN: %d valid deals, nothing written/posted", len(valid))
        for d in valid:
            s.posts.append({"asin": d.asin, "platform": "dry-run", "id": None})
        return s

    results: list[UpsertResult] = deps.store.upsert_deals(valid)
    if cfg.asins:
        saved = {d.asin for d in valid}
        deps.store.mark_trending([a for a in cfg.asins if a in saved])
        s.extra["trending_saved"] = len(saved & set(cfg.asins))
        s.extra["trending_skipped"] = [a for a in cfg.asins if a not in saved]
    picks = set(getattr(deps.scrape, "picks", []) or [])
    if picks:
        found = [d.asin for d in valid if d.asin in picks]
        deps.store.mark_collection_picks(found)
        s.extra["collection_picks_saved"] = len(found)
    s.new = sum(r.status == "new" for r in results)
    s.updated = sum(r.status == "updated" for r in results)
    s.deactivated = deps.store.deactivate_stale(cfg.stale_after_hours)
    if deps.catalog is not None:
        from . import catalog

        upserts = {r.deal.asin: dict(r.doc) for r in results}
        for a in cfg.asins or []:
            if a in upserts:
                upserts[a]["source"] = "trending"
        s.extra["catalog"] = catalog.sync(
            deps.catalog, deps.store, upserts=upserts,
            deactivated=getattr(deps.store, "deactivated", []),
            picks=getattr(deps.store, "last_picks", None), now=deps.now())

    now = deps.now()
    platforms = []
    if cfg.x.enabled and deps.x:
        platforms.append(("x", cfg.x.max_posts_per_run))
    if cfg.meta.enabled and deps.meta:
        if cfg.meta.fb_post_mode != "off":
            platforms.append(("facebook", cfg.meta.max_posts_per_run))
        if cfg.meta.ig_post_mode != "off":
            platforms.append(("instagram", cfg.meta.max_posts_per_run))
    if not platforms:
        return s

    # Best discounts first; a deal enters the queue if any platform still needs it.
    ranked = sorted(results, key=lambda r: r.deal.discount_pct, reverse=True)
    # Skip colour/pack variants of a product already picked this run or posted in the last 24h.
    recent = [
        r.deal.title for r in results
        if any(v.get("at") and now - v["at"] < timedelta(hours=24) for v in (r.doc.get("posted") or {}).values())
    ]
    queue = []
    for r in ranked:
        if len(queue) >= cfg.max_posts_per_run:
            break
        if not any(needs_post(r.doc, p, now) for p, _ in platforms):
            continue
        if any(is_near_duplicate(r.deal.title, t) for t in recent + [q.deal.title for q in queue]):
            s.skipped_duplicates += 1
            continue
        queue.append(r)
    budget = {p: cap for p, cap in platforms}

    for r in queue:
        deal = r.deal
        wanted = [p for p, _ in platforms if budget[p] > 0 and needs_post(r.doc, p, now)]
        if not wanted:
            continue
        media = None
        if any(p in ("facebook", "instagram") for p in wanted) and deps.render:
            want_video = cfg.meta.ig_post_mode == "reel" or cfg.meta.fb_post_mode == "video"
            try:
                media = deps.render(deal, want_video)
            except Exception as exc:  # noqa: BLE001
                s.errors.append({"asin": deal.asin, "stage": "render", "error": str(exc)})
        for platform in wanted:
            try:
                post_id = _post_one(cfg, deps, platform, deal, media)
            except Exception as exc:  # noqa: BLE001 - isolate platform failures
                log.error("%s post failed for %s: %s", platform, deal.asin, exc)
                s.errors.append({"asin": deal.asin, "stage": platform, "error": str(exc)})
                continue
            budget[platform] -= 1
            deps.store.mark_posted(deal, platform, post_id)
            if platform == "instagram":
                deps.store.map_social_post("ig_media", post_id, deal)
            elif platform == "facebook":
                deps.store.map_social_post("fb_posts", post_id, deal)
            s.posts.append({"asin": deal.asin, "platform": platform, "id": post_id})
    return s


def _post_one(cfg: Config, deps: Deps, platform: str, deal: Deal, media: dict | None) -> str:
    if platform == "x":
        return deps.x.post(deal)
    if media is None:
        raise RuntimeError("media rendering failed; skipping Meta post")
    if platform == "facebook":
        caption = build_meta_caption(deal, cfg.dm_keyword, platform="facebook")
        if cfg.meta.fb_post_mode == "video" and media.get("reel_mp4"):
            return deps.meta.post_facebook_video(media["reel_mp4"], caption)
        return deps.meta.post_facebook_photo(media["feed_jpg"], caption)
    if platform == "instagram":
        caption = build_meta_caption(deal, cfg.dm_keyword, platform="instagram")
        if cfg.meta.ig_post_mode == "reel":
            if not media.get("reel_mp4"):
                raise RuntimeError("reel video missing")
            return deps.meta.post_instagram_reel(media["reel_mp4"], caption)
        # IG image posts need a public JPEG URL; the Amazon product image already is one.
        return deps.meta.post_instagram_image(deal.image_url, caption)
    raise ValueError(platform)


def _due_for_refresh(cfg, store, cache) -> tuple[list[str], list[str]]:
    """Trending products and collection picks due a price re-check. Read from the product cache
    (no Firestore reads); Firestore only when the cache can't be loaded."""
    if store is None:
        return [], []
    if cache is not None:
        try:
            snap = cache.load()
        except Exception as exc:  # noqa: BLE001
            log.warning("product cache unavailable, reading Firestore: %s", exc)
            snap = None
        if snap and snap.get("deals"):
            from .catalog import picks_due, trending_due

            now = datetime.now(timezone.utc)
            return (trending_due(snap, cfg.trending_refresh_per_run, now),
                    picks_due(snap, cfg.collection_refresh_per_run, now))
    return (store.trending_to_refresh(cfg.trending_refresh_per_run),
            store.collection_asins_to_refresh(cfg.collection_refresh_per_run))


def build_deps(cfg: Config) -> Deps:
    from functools import partial

    from . import graphics
    from .scraper import scrape_deals

    base_scrape = partial(
        scrape_deals,
        marketplace=cfg.marketplace,
        domain=cfg.domain,
        currency=cfg.currency,
        tag=cfg.associate_tag,
        max_products=cfg.max_products,
        min_discount_pct=cfg.min_discount_pct,
    )
    store = None
    if not cfg.dry_run:
        from .store import init_firestore

        store = DealStore(init_firestore(cfg.firebase_credentials, cfg.firebase_project_id))

    def scrape() -> list[Deal]:
        if cfg.asins:
            return base_scrape(asins=list(cfg.asins))
        refresh, picks = _due_for_refresh(cfg, store, cache)
        if refresh:
            log.info("re-checking %d trending products", len(refresh))
        if picks:
            log.info("checking %d hand-picked collection products", len(picks))
        scrape.picks = picks
        return base_scrape(extra_asins=refresh, full_price_asins=picks)

    scrape.picks = []
    cache = None
    x = meta = None
    if cfg.x.enabled and not cfg.dry_run:
        if cfg.x.publisher == "buffer":
            from .buffer import BufferPoster

            x = BufferPoster.from_config(cfg.x)
        else:
            from .twitter import XPoster

            x = XPoster.from_config(cfg.x)
    if cfg.meta.enabled and not cfg.dry_run:
        from .meta import MetaClient

        meta = MetaClient(cfg.meta)

    media_dir = Path(cfg.out_dir) / "media"

    def render(deal: Deal, want_video: bool) -> dict:
        product = graphics.download_image(deal.image_url)
        return graphics.render_media(deal, product, media_dir, cfg.dm_keyword, want_video=want_video)

    if os.environ.get("CATALOG_CACHE", "true").lower() not in {"0", "false", "no", "off"}:
        base, secret = os.environ.get("CARDS_BASE_URL", ""), os.environ.get("CARDS_UPLOAD_SECRET", "")
        if base and secret:
            from .catalog import CatalogCache

            cache = CatalogCache(base, secret)
    return Deps(scrape=scrape, store=store, x=x, meta=meta, render=render, catalog=cache)


def _write_summary(cfg: Config, summary: RunSummary) -> None:
    out = Path(cfg.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(summary.to_dict(), indent=2, default=str))
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(
                f"### Deal run\n- scraped: {summary.scraped}\n- valid: {summary.valid}\n"
                f"- new: {summary.new} · updated: {summary.updated} · deactivated: {summary.deactivated}\n"
                f"- posts: {sum(p['platform'] != 'dry-run' for p in summary.posts)}"
                f" · dry-run previews: {sum(p['platform'] == 'dry-run' for p in summary.posts)}"
                f" · errors: {len(summary.errors)}\n"
            )
            for e in summary.errors:
                fh.write(f"  - `{e['asin']}` {e['stage']}: {e['error'][:200]}\n")
            if "trending_saved" in summary.extra:
                fh.write(f"- trending saved: {summary.extra['trending_saved']}\n")
                skipped = summary.extra.get("trending_skipped") or []
                if skipped:
                    fh.write(f"- trending skipped (no discount, no page or robot check): {', '.join(skipped)}\n")


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        cfg = load_config()
    except ConfigError as exc:
        log.error("configuration error: %s", exc)
        return 2
    try:
        summary = run(cfg, build_deps(cfg))
    except StoreError as exc:
        log.error("%s", exc)
        return 3
    _write_summary(cfg, summary)
    log.info("done: %s", json.dumps({k: v for k, v in summary.to_dict().items() if k != "posts"}, default=str))
    if summary.scraped == 0:
        print("::warning::No deals scraped this run (layout change or robot check?)")
    for e in summary.errors:
        print(f"::warning::{e['stage']} {e['asin']}: {e['error'][:180]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
