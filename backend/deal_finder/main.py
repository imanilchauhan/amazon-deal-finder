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
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .captions import build_meta_caption
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
    posts: list = field(default_factory=list)
    errors: list = field(default_factory=list)

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
    s.new = sum(r.status == "new" for r in results)
    s.updated = sum(r.status == "updated" for r in results)
    s.deactivated = deps.store.deactivate_stale(cfg.stale_after_hours)

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
    queue = [r for r in ranked if any(needs_post(r.doc, p, now) for p, _ in platforms)][: cfg.max_posts_per_run]
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


def build_deps(cfg: Config) -> Deps:
    from functools import partial

    from . import graphics
    from .scraper import scrape_deals

    scrape = partial(
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

    return Deps(scrape=scrape, store=store, x=x, meta=meta, render=render)


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
