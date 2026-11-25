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
DEAL_FIELDS = [f.name for f in fields(Deal) if f.name != "images"]


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
    if isinstance(doc.get("images"), list) and doc["images"]:
        payload["images"] = doc["images"]
    if schema_errors(payload):
        return None
    return Deal(**{**payload, "images": tuple(payload.get("images") or ())})


def pick_deal(docs: list[dict], platforms: list[str], now: datetime,
              skip: set[str] | None = None, extra_titles: list[str] | None = None,
              history: list | None = None, when: datetime | None = None) -> tuple[Deal, dict] | None:
    """The deal for the slot at `when` (default `now`), chosen by picker.rank: fresh, still
    needed by the most channels, then the best score (discount, season, audience and variety
    against `history`, the recent post log). `skip` ASINs and variants of `extra_titles`
    (picked earlier in this run) are left out."""
    from .picker import log_from_docs, rank, recently_on

    skip = skip or set()
    when = when or now
    history = log_from_docs(docs) if history is None else history
    extra = list(extra_titles or [])
    pool: list[tuple[int, dict]] = []
    for doc in docs:
        if doc.get("asin") in skip:
            continue
        updated = doc.get("updated_at")
        if updated is None or now - updated > timedelta(hours=FRESH_HOURS):
            continue
        wanted = sum(needs_post(doc, p, now) and not recently_on(doc, p, when) for p in platforms)
        if not wanted:
            continue
        if any(t != doc.get("title") and is_near_duplicate(doc.get("title", ""), t) for t in extra):
            continue
        pool.append((wanted, doc))
    if not pool:
        return None
    wanted_by_asin = {d.get("asin"): w for w, d in pool}
    ranked = rank([d for _, d in pool], history, when)
    # Deals every channel still needs come first, so a newly added channel can't drain the slots.
    ranked.sort(key=lambda sd: (-wanted_by_asin[sd[1].get("asin")], -sd[0]))
    for _, doc in ranked:
        deal = doc_to_deal(doc)
        if deal is None or deal.discount_pct < 1:
            continue  # full-price collection products are never posted as deals
        return deal, doc
    return None


def post_collection(posters: dict[str, object], slot: datetime, *, live=None, site_url: str | None = None,
                    dry_run: bool = False) -> list[dict]:
    """Share this week's collection on X and Facebook in `slot`. Returns the posts made
    (empty when no collection page has products, so the slot falls back to a deal)."""
    from . import collections as col

    live = live or col.is_live
    targets = {p: posters[p] for p in ("x", "facebook") if p in posters and hasattr(posters[p], "post_text")}
    if not targets:
        return []
    for slug, name, pitch in col.rotation(slot):
        url = col.collection_url(slug, site_url or col.SITE_URL)
        if not live(url):
            continue
        out = []
        for platform, poster in targets.items():
            text = col.build_collection_post(name, pitch, url, platform)
            post_id = None if dry_run else poster.post_text(text, due_at=slot)
            out.append({"slot": slot_key(slot), "asin": f"collection:{slug}", "platform": platform, "id": post_id})
        return out
    return []


RUNNER = os.environ.get("CARTCRUSH_RUNNER", "cloud")


def run_once(store: DealStore, posters: dict[str, object], now: datetime, dry_run: bool = False,
             slots: list[datetime] | None = None, collections: bool = False, live=None) -> QueueResult:
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
    from .picker import LogEntry, log_from_docs, merge_logs, recently_on

    load_log = getattr(store, "post_log", None)
    history = merge_logs(load_log() if load_log else [], log_from_docs(docs))
    picked_asins: set[str] = set()
    picked_titles: list[str] = []
    from .collections import is_collection_slot

    for slot in free:
        key = slot_key(slot)
        claim = getattr(store, "claim_slot", None)
        if not dry_run and claim is not None and not claim(key, RUNNER):
            log.info("slot %s already taken by another runner", key)
            booked.add(key)
            continue
        if collections and is_collection_slot(slot):
            try:
                made = post_collection(posters, slot, live=live, site_url=_str("SITE_URL") or None, dry_run=dry_run)
            except Exception as exc:  # noqa: BLE001 - fall back to a normal deal for this slot
                log.error("collection post failed at %s: %s", slot_key(slot), exc)
                made = []
            if made:
                out.posts.extend(made)
                booked.add(slot_key(slot))
                continue
        picked = pick_deal(docs, list(posters), now, skip=picked_asins, extra_titles=picked_titles,
                           history=history, when=slot)
        if picked is None:
            if not dry_run and claim is not None:
                store.release_slot(key)
            log.info("queue empty: no fresh deal for %s", slot_key(slot))
            out.skipped_slots.append(slot_key(slot))
            continue
        deal, doc = picked
        picked_asins.add(deal.asin)
        picked_titles.append(deal.title)
        sent = 0
        for platform, poster in posters.items():
            if not needs_post(doc, platform, now) or recently_on(doc, platform, slot):
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
            history.append(LogEntry.from_doc(doc, slot))
        elif not dry_run and claim is not None:
            store.release_slot(key)
    if out.posts and not dry_run:
        store.save_booked_slots(booked, now)
        save_log = getattr(store, "save_post_log", None)
        if save_log:
            save_log(merge_logs(history))
    return out


def run_test(store: DealStore, platform: str, poster, now: datetime, lead_minutes: int = 10) -> QueueResult:
    """Send the next fresh deal to one channel, due in a few minutes, outside the slot plan.
    Used to check a newly connected channel without waiting for a free slot."""
    out = QueueResult()
    picked = pick_deal(store.post_candidates(), [platform], now)
    if picked is None:
        out.skipped_slots.append("test")
        return out
    deal, doc = picked
    due = now + timedelta(minutes=lead_minutes)
    extra = {"doc": doc} if getattr(poster, "wants_doc", False) else {}
    try:
        post_id = poster.post(deal, due_at=due, **extra)
    except Exception as exc:  # noqa: BLE001
        out.errors.append({"slot": slot_key(due), "asin": deal.asin, "platform": platform, "error": str(exc)})
        return out
    store.mark_posted(deal, platform, post_id)
    out.posts.append({"slot": slot_key(due), "asin": deal.asin, "platform": platform, "id": post_id})
    return out


def build_posters(env_bool: Callable[[str], bool] = _bool) -> dict[str, object]:
    """X goes through Buffer. Facebook and Instagram go through Zernio when ZERNIO_API_KEY
    and the account id are set, with Buffer as the automatic backup; otherwise Buffer alone."""
    from .buffer import FACEBOOK_METADATA, BufferPoster

    key = _str("BUFFER_API_KEY")
    zkey = _str("ZERNIO_API_KEY")
    posters: dict[str, object] = {}
    if env_bool("X_ENABLED"):
        chan = _str("BUFFER_CHANNEL_ID")
        if not (key and chan):
            raise ConfigError("X_ENABLED=true needs BUFFER_API_KEY and BUFFER_CHANNEL_ID")
        posters["x"] = BufferPoster(key, chan, text_builder=build_tweet)
    if env_bool("FB_ENABLED"):
        chan, zacc = _str("BUFFER_FB_CHANNEL_ID"), _str("ZERNIO_FB_ACCOUNT_ID")
        providers: list[tuple[str, object]] = []
        if zkey and zacc:
            from .zernio import ZernioPoster

            providers.append(("zernio", ZernioPoster(zkey, "facebook", zacc, text_builder=build_facebook_post)))
        if key and chan:
            providers.append(("buffer", BufferPoster(key, chan, text_builder=build_facebook_post,
                                                     metadata=FACEBOOK_METADATA)))
        if not providers:
            raise ConfigError("FB_ENABLED=true needs BUFFER_API_KEY + BUFFER_FB_CHANNEL_ID "
                              "or ZERNIO_API_KEY + ZERNIO_FB_ACCOUNT_ID")
        if len(providers) == 1 and providers[0][0] == "buffer":
            fb = providers[0][1]
        else:
            from .zernio import FallbackPoster

            fb = FallbackPoster(providers, "facebook")
        cards_url, cards_secret = _str("CARDS_BASE_URL"), _str("CARDS_UPLOAD_SECRET")
        if cards_url and cards_secret:
            # Facebook gets the same themed deal card as Instagram, with the link in the text.
            from .instagram import CardPoster, CardUploader

            fb = CardPoster(fb, CardUploader(cards_url, cards_secret), caption=build_facebook_post,
                            platform="facebook")
        posters["facebook"] = fb
    if env_bool("IG_ENABLED"):
        from .instagram import build_instagram_poster

        chan, zacc = _str("BUFFER_IG_CHANNEL_ID"), _str("ZERNIO_IG_ACCOUNT_ID")
        cards_url, cards_secret = _str("CARDS_BASE_URL"), _str("CARDS_UPLOAD_SECRET")
        if not (cards_url and cards_secret and ((key and chan) or (zkey and zacc))):
            raise ConfigError("IG_ENABLED=true needs CARDS_BASE_URL, CARDS_UPLOAD_SECRET and either "
                              "BUFFER_API_KEY + BUFFER_IG_CHANNEL_ID or ZERNIO_API_KEY + ZERNIO_IG_ACCOUNT_ID")
        posters["instagram"] = build_instagram_poster(key or "", chan or "", cards_url, cards_secret,
                                                      zernio_key=zkey or "", zernio_account=zacc or "")
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
    test_platform = _str("TEST_PLATFORM")
    try:
        if test_platform:
            if test_platform not in posters:
                log.error("TEST_PLATFORM=%s is not enabled", test_platform)
                return 2
            result = run_test(store, test_platform, posters[test_platform], datetime.now(timezone.utc))
        else:
            result = run_once(store, posters, datetime.now(timezone.utc), dry_run=_bool("DRY_RUN"),
                              collections=_bool("COLLECTION_POSTS", True))
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
