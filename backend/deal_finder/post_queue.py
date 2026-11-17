"""Post ONE deal per run from the Firestore queue:  python -m deal_finder.post_queue

The scrape workflow only fills Firestore. This lightweight job (no browser, ~1 min)
runs on its own schedule, picks the single best deal that still needs posting, and
sends it to every enabled Buffer channel (X, Facebook Page, Instagram). Steady one-at-a-time
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


IST = timezone(timedelta(hours=5, minutes=30))


@dataclass
class QueueResult:
    posts: list = field(default_factory=list)   # {"slot", "asin", "platform", "id"}
    errors: list = field(default_factory=list)
    skipped_slots: list = field(default_factory=list)

    @property
    def asins(self) -> list[str]:
        return sorted({p["asin"] for p in self.posts})


def slot_key(slot: datetime) -> str:
    return slot.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def upcoming_slots(now: datetime, *, first_hour: int = 9, last_hour: int = 22,
                   lookahead_hours: int = 6, min_lead_minutes: int = 5) -> list[datetime]:
    """Hourly IST slots (first_hour..last_hour inclusive) starting within the lookahead.

    A slot closer than `min_lead_minutes` is skipped: Buffer needs a little lead time."""
    local = now.astimezone(IST).replace(minute=0, second=0, microsecond=0)
    out = []
    for h in range(lookahead_hours + 1):
        slot = local + timedelta(hours=h)
        if not (first_hour <= slot.hour <= last_hour):
            continue
        if slot - now.astimezone(IST) < timedelta(minutes=min_lead_minutes):
            continue
        if slot - now.astimezone(IST) > timedelta(hours=lookahead_hours):
            continue
        out.append(slot.astimezone(timezone.utc))
    return out


def doc_to_deal(doc: dict) -> Deal | None:
    try:
        payload = {k: doc[k] for k in DEAL_FIELDS}
    except KeyError:
        return None
    if schema_errors(payload):
        return None
    return Deal(**payload)


def pick_deal(docs: list[dict], platforms: list[str], now: datetime,
              skip: set[str] | None = None, extra_titles: list[str] | None = None) -> tuple[Deal, dict] | None:
    """Best-discount fresh deal that some platform still needs, skipping `skip` ASINs and
    variants of anything posted in the last 24h (or picked earlier in this run).
    `docs` is already sorted best discount first."""
    skip = skip or set()
    # The trending list goes first (best discount first within it), then everything else.
    docs = sorted(docs, key=lambda d: d.get("source") != "trending")
    recent = [
        d.get("title", "") for d in docs
        if any(v.get("at") and now - v["at"] < timedelta(hours=24) for v in (d.get("posted") or {}).values())
    ] + list(extra_titles or [])
    for doc in docs:
        if doc.get("asin") in skip:
            continue
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


def run_once(store: DealStore, posters: dict[str, object], now: datetime, dry_run: bool = False,
             slots: list[datetime] | None = None) -> QueueResult:
    """Fill every free upcoming slot with its own deal, scheduled in Buffer for that time.

    Booked slots live in Firestore, so a second trigger in the same window posts nothing,
    and a missed trigger is made up by the next run (it sees more empty slots)."""
    out = QueueResult()
    if not posters:
        log.info("no channels enabled; nothing to post")
        return out
    slots = upcoming_slots(now) if slots is None else slots
    booked = store.booked_slots()
    free = [s for s in slots if slot_key(s) not in booked]
    if not free:
        log.info("all upcoming slots already booked (%d)", len(slots))
        return out
    docs = store.post_candidates()
    picked_asins: set[str] = set()
    picked_titles: list[str] = []
    for slot in free:
        picked = pick_deal(docs, list(posters), now, skip=picked_asins, extra_titles=picked_titles)
        if picked is None:
            log.info("queue empty: no fresh deal for %s", slot_key(slot))
            out.skipped_slots.append(slot_key(slot))
            continue
        deal, doc = picked
        picked_asins.add(deal.asin)
        picked_titles.append(deal.title)
        sent = 0
        for platform, poster in posters.items():
            if not needs_post(doc, platform, now):
                continue
            if dry_run:
                out.posts.append({"slot": slot_key(slot), "asin": deal.asin, "platform": platform, "id": None})
                sent += 1
                continue
            try:
                extra = {"doc": doc} if getattr(poster, "wants_doc", False) else {}
                post_id = poster.post(deal, due_at=slot, **extra)
            except Exception as exc:  # noqa: BLE001 - one channel failing must not block the other
                log.error("%s post failed for %s at %s: %s", platform, deal.asin, slot_key(slot), exc)
                out.errors.append({"slot": slot_key(slot), "asin": deal.asin, "platform": platform, "error": str(exc)})
                continue
            store.mark_posted(deal, platform, post_id)
            out.posts.append({"slot": slot_key(slot), "asin": deal.asin, "platform": platform, "id": post_id})
            sent += 1
        if sent:
            booked.add(slot_key(slot))
    if out.posts and not dry_run:
        store.save_booked_slots(booked, now)
    return out


def build_posters(env_bool: Callable[[str], bool] = _bool) -> dict[str, object]:
    from .buffer import FACEBOOK_METADATA, BufferPoster

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
        posters["facebook"] = BufferPoster(key, chan, text_builder=build_facebook_post,
                                           metadata=FACEBOOK_METADATA)
    if env_bool("IG_ENABLED"):
        from .instagram import build_instagram_poster

        chan = _str("BUFFER_IG_CHANNEL_ID")
        cards_url, cards_secret = _str("CARDS_BASE_URL"), _str("CARDS_UPLOAD_SECRET")
        if not (key and chan and cards_url and cards_secret):
            raise ConfigError("IG_ENABLED=true needs BUFFER_API_KEY, BUFFER_IG_CHANNEL_ID, CARDS_BASE_URL "
                              "and CARDS_UPLOAD_SECRET")
        posters["instagram"] = build_instagram_poster(key, chan, cards_url, cards_secret)
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
    log.info("done: %s", json.dumps(result.__dict__, default=str))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write("### Post queue\n| slot (UTC) | deal | channel | id |\n|---|---|---|---|\n")
            for p in result.posts:
                fh.write(f"| {p['slot']} | `{p['asin']}` | {p['platform']} | {p['id']} |\n")
            for e in result.errors:
                fh.write(f"- ⚠️ {e['slot']} {e['platform']}: {e['error'][:200]}\n")
            for sl in result.skipped_slots:
                fh.write(f"- slot {sl}: no fresh deal left\n")
    for e in result.errors:
        print(f"::warning::{e['platform']} {e['asin']} @ {e['slot']}: {e['error'][:180]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
