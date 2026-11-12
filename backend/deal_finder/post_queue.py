"""Post ONE deal per run from the Firestore queue:  python -m deal_finder.post_queue

The scrape workflow only fills Firestore. This lightweight job (no browser, ~1 min)
runs on its own schedule, picks the single best deal that still needs posting, and
sends it to every enabled Buffer channel (X, Facebook Page). Steady one-at-a-time
posting keeps us inside Buffer's free cap and avoids looking like a spam burst.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, field, fields
from datetime import datetime, timedelta, timezone
from typing import Callable

from .captions import build_facebook_post, build_tweet, is_near_duplicate
from .config import ConfigError, _bool, _str
from .models import Deal, schema_errors
from .store import DealStore, StoreError, needs_post

log = logging.getLogger("deal_finder.post_queue")

FRESH_HOURS = 24  # never post a price older than this (Amazon prices change fast)
DEAL_FIELDS = [f.name for f in fields(Deal)]


@dataclass
class QueueResult:
    asin: str | None = None
    posts: list = field(default_factory=list)
    errors: list = field(default_factory=list)


def doc_to_deal(doc: dict) -> Deal | None:
    try:
        payload = {k: doc[k] for k in DEAL_FIELDS}
    except KeyError:
        return None
    if schema_errors(payload):
        return None
    return Deal(**payload)


def pick_deal(docs: list[dict], platforms: list[str], now: datetime) -> tuple[Deal, dict] | None:
    """Best-discount fresh deal that some platform still needs, skipping variants of
    anything posted in the last 24h. `docs` is already sorted best discount first."""
    recent = [
        d.get("title", "") for d in docs
        if any(v.get("at") and now - v["at"] < timedelta(hours=24) for v in (d.get("posted") or {}).values())
    ]
    for doc in docs:
        updated = doc.get("updated_at")
        if updated is None or now - updated > timedelta(hours=FRESH_HOURS):
            continue
        if not any(needs_post(doc, p, now) for p in platforms):
            continue
        deal = doc_to_deal(doc)
        if deal is None:
            continue
        if any(t != deal.title and is_near_duplicate(deal.title, t) for t in recent):
            continue
        return deal, doc
    return None


def run_once(store: DealStore, posters: dict[str, object], now: datetime, dry_run: bool = False) -> QueueResult:
    out = QueueResult()
    if not posters:
        log.info("no channels enabled; nothing to post")
        return out
    picked = pick_deal(store.post_candidates(), list(posters), now)
    if picked is None:
        log.info("queue empty: no fresh deal needs posting")
        return out
    deal, doc = picked
    out.asin = deal.asin
    for platform, poster in posters.items():
        if not needs_post(doc, platform, now):
            continue
        if dry_run:
            out.posts.append({"platform": platform, "id": None, "dry_run": True})
            continue
        try:
            post_id = poster.post(deal)
        except Exception as exc:  # noqa: BLE001 - one channel failing must not block the other
            log.error("%s post failed for %s: %s", platform, deal.asin, exc)
            out.errors.append({"platform": platform, "error": str(exc)})
            continue
        store.mark_posted(deal, platform, post_id)
        out.posts.append({"platform": platform, "id": post_id})
    return out


def build_posters(env_bool: Callable[[str], bool] = _bool) -> dict[str, object]:
    from .buffer import BufferPoster

    key = _str("BUFFER_API_KEY")
    posters: dict[str, object] = {}
    if env_bool("X_ENABLED"):
        chan = _str("BUFFER_CHANNEL_ID")
        if not (key and chan):
            raise ConfigError("X_ENABLED=true needs BUFFER_API_KEY and BUFFER_CHANNEL_ID")
        posters["x"] = BufferPoster(key, chan, text_builder=build_tweet)
    if env_bool("FB_ENABLED"):
        chan = _str("BUFFER_FB_CHANNEL_ID")
        if not (key and chan):
            raise ConfigError("FB_ENABLED=true needs BUFFER_API_KEY and BUFFER_FB_CHANNEL_ID")
        posters["facebook"] = BufferPoster(key, chan, text_builder=build_facebook_post)
    return posters


def main() -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    project = _str("FIREBASE_PROJECT_ID")
    if not project:
        log.error("FIREBASE_PROJECT_ID is required")
        return 2
    try:
        posters = build_posters()
    except ConfigError as exc:
        log.error("configuration error: %s", exc)
        return 2
    from .store import init_firestore

    store = DealStore(init_firestore(None, project))
    try:
        result = run_once(store, posters, datetime.now(timezone.utc), dry_run=_bool("DRY_RUN"))
    except StoreError as exc:
        log.error("%s", exc)
        return 3
    log.info("done: %s", json.dumps(result.__dict__))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Post queue\n- deal: `{result.asin}`\n")
            for p in result.posts:
                fh.write(f"- {p['platform']}: {p['id']}\n")
            for e in result.errors:
                fh.write(f"- ⚠️ {e['platform']}: {e['error'][:200]}\n")
    for e in result.errors:
        print(f"::warning::{e['platform']} {result.asin}: {e['error'][:180]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
