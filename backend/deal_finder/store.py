"""Firestore persistence: upsert + dedupe deals, mark posts, map social posts to deals.

Collections
  deals/{asin}        the deal, plus active flag, timestamps and per-platform post state
  ig_media/{media_id} {asin, url, title} so the Cloudflare Worker can resolve comment -> link
  fb_posts/{post_id}  same for Facebook Page posts

Free-tier budget (Spark plan: 50k reads / 20k writes per day): one run reads about
MAX_PRODUCTS + active-deal count and writes about MAX_PRODUCTS + posts, so a 4-hour
cron stays far below the quota.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from .categorize import classify
from .models import Deal

log = logging.getLogger(__name__)

PLATFORMS = ("x", "facebook", "instagram")
REPOST_DROP_PCT = 5  # re-post a deal only if the price fell at least this much since last post
REPOST_MIN_HOURS = 24


class StoreError(RuntimeError):
    pass


@dataclass
class UpsertResult:
    deal: Deal
    status: str  # "new" | "updated" | "unchanged"
    doc: dict


def init_firestore(credentials_info: dict | None, project_id: str = ""):
    """Firestore client from a service-account dict, or keyless via Application Default
    Credentials (GitHub OIDC -> Workload Identity Federation). Idempotent."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    try:
        app = firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(credentials_info) if credentials_info else credentials.ApplicationDefault()
        options = {"projectId": project_id} if project_id else None
        app = firebase_admin.initialize_app(cred, options)
    return firestore.client(app)


def _field_filter(field: str, op: str, value):
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter
    except ImportError:  # unit tests run without firebase-admin installed
        return (field, op, value)
    return FieldFilter(field, op, value)


def needs_post(doc: dict, platform: str, now: datetime) -> bool:
    """Has this deal never been posted on `platform`, or has its price dropped enough since?"""
    posted = (doc.get("posted") or {}).get(platform)
    if not posted:
        return True
    last_price = posted.get("price")
    last_at = posted.get("at")
    if last_price is None or last_at is None:
        return True
    if now - last_at < timedelta(hours=REPOST_MIN_HOURS):
        return False
    return doc["price"] <= last_price * (1 - REPOST_DROP_PCT / 100)


# Amazon Associates: prices may be shown for at most 24 hours without a refresh, so curated
# products follow the same rule as everything else. Trending products are refreshed each run.
MANUAL_MAX_AGE_HOURS = 24
CURATED_SOURCES = {"manual", "trending", "collection"}


class DealStore:
    def __init__(self, db, *, clock=lambda: datetime.now(timezone.utc)):
        self._db = db
        self._now = clock

    # ---- deals -------------------------------------------------------------
    def upsert_deals(self, deals: Iterable[Deal]) -> list[UpsertResult]:
        deals = list(deals)
        if not deals:
            return []
        now = self._now()
        coll = self._db.collection("deals")
        refs = [coll.document(d.asin) for d in deals]
        try:
            snaps = {s.id: s for s in self._db.get_all(refs)}
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc

        results: list[UpsertResult] = []
        batch = self._db.batch()
        for deal, ref in zip(deals, refs):
            snap = snaps.get(deal.asin)
            fields = deal.to_dict()
            cats = classify(deal.title)
            if snap is None or not snap.exists:
                doc = {
                    **fields,
                    "active": True,
                    "first_seen_at": now,
                    "updated_at": now,
                    "posted": {},
                    "x_status": "unposted",
                    **cats,
                }
                batch.set(ref, doc)
                results.append(UpsertResult(deal, "new", doc))
                continue
            old = snap.to_dict() or {}
            changed = any(old.get(k) != fields[k] for k in ("price", "original_price", "discount_pct", "title", "image_url"))
            update = {**fields, "active": True, "updated_at": now}
            if old.get("category_source") != "manual":  # manual overrides always win
                update.update(cats)
            if "x_status" not in old:  # backfill docs created before the marker existed
                update["x_status"] = "posted" if (old.get("posted") or {}).get("x") else "unposted"
            if old.get("price") and deal.price < old["price"]:
                update["last_drop_at"] = now
            batch.set(ref, update, merge=True)
            results.append(UpsertResult(deal, "updated" if changed else "unchanged", {**old, **update}))
        try:
            batch.commit()
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore write failed: {exc}") from exc
        return results

    def mark_trending(self, asins: Iterable[str]) -> int:
        """Tag scraped products as part of the trending list (stays up 7 days, posted first)."""
        asins = list(asins)
        if not asins:
            return 0
        now = self._now()
        batch = self._db.batch()
        for a in asins:
            batch.set(self._db.collection("deals").document(a), {"source": "trending", "trending_at": now}, merge=True)
        try:
            batch.commit()
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore write failed: {exc}") from exc
        return len(asins)

    def trending_to_refresh(self, limit: int, older_than_hours: int = 16) -> list[str]:
        """Active trending products whose price is the oldest, so each run re-checks a few."""
        if limit <= 0:
            return []
        cutoff = self._now() - timedelta(hours=older_than_hours)
        # Only active deals not checked since the cutoff (existing active+updated_at index), so a
        # run reads the few deals that are due, not every trending product.
        try:
            docs = [(s.id, s.to_dict() or {}) for s in self._stale_active(cutoff).stream()]
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc
        stale = [(d.get("updated_at"), a) for a, d in docs if d.get("source") == "trending" and d.get("updated_at")]
        return [a for _, a in sorted(stale)[:limit]]

    def _stale_active(self, cutoff: datetime):
        """Active deals whose price is older than `cutoff`, newest first (index: active, updated_at desc)."""
        try:
            from google.cloud.firestore_v1 import Query
            desc = Query.DESCENDING
        except ImportError:  # unit tests
            desc = "DESCENDING"
        return (
            self._db.collection("deals")
            .where(filter=_field_filter("active", "==", True))
            .where(filter=_field_filter("updated_at", "<", cutoff))
            .order_by("updated_at", direction=desc)
        )

    # ---- collections (hand-picked products) ---------------------------------
    def collection_picks(self) -> dict[str, list[str]]:
        """{collection slug: [ASIN, ...]} from collections/{slug}.asins (edited in the admin)."""
        try:
            snaps = list(self._db.collection("collections").stream())
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc
        out: dict[str, list[str]] = {}
        for s in snaps:
            asins = [a for a in ((s.to_dict() or {}).get("asins") or []) if isinstance(a, str)]
            if asins:
                out[s.id] = asins
        self.last_picks = out   # reused by the product cache, no second read
        return out

    def collection_asins_to_refresh(self, limit: int, older_than_hours: int = 16) -> list[str]:
        """Hand-picked products never checked, or whose price is the oldest, so each run
        refreshes a few and every pick keeps a price under 24 hours old."""
        if limit <= 0:
            return []
        asins = list(dict.fromkeys(a for picks in self.collection_picks().values() for a in picks))
        if not asins:
            return []
        coll = self._db.collection("deals")
        try:
            snaps = {s.id: s for s in self._db.get_all([coll.document(a) for a in asins])}
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc
        cutoff = self._now() - timedelta(hours=older_than_hours)
        never, stale = [], []
        for a in asins:
            snap = snaps.get(a)
            data = (snap.to_dict() or {}) if snap is not None and snap.exists else {}
            updated = data.get("updated_at")
            if updated is None or not data.get("active"):
                never.append(a)
            elif updated < cutoff:
                stale.append((updated, a))
        return (never + [a for _, a in sorted(stale)])[:limit]

    def mark_collection_picks(self, asins) -> int:
        """Tag refreshed picks so they are re-checked as collection items (kept at full price)."""
        asins = list(asins)
        if not asins:
            return 0
        batch = self._db.batch()
        for a in asins:
            batch.set(self._db.collection("deals").document(a), {"collection_pick": True}, merge=True)
        try:
            batch.commit()
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore write failed: {exc}") from exc
        return len(asins)

    def deactivate_stale(self, max_age_hours: int) -> int:
        """Hide deals not seen recently (Amazon prices shouldn't be shown when >24h old)."""
        cutoff = self._now() - timedelta(hours=max_age_hours)
        manual_cutoff = self._now() - timedelta(hours=max(max_age_hours, MANUAL_MAX_AGE_HOURS))
        # Read only the active deals that are already past the shorter cutoff, not every active deal.
        query = self._stale_active(max(cutoff, manual_cutoff))  # the later cutoff covers both rules
        batch = self._db.batch()
        count = 0
        self.deactivated: list[str] = []
        for snap in query.stream():
            data = snap.to_dict() or {}
            updated = data.get("updated_at")
            limit = manual_cutoff if data.get("source") in CURATED_SOURCES else cutoff
            if updated is not None and updated < limit:
                batch.update(snap.reference, {"active": False})
                self.deactivated.append(snap.id)
                count += 1
        if count:
            batch.commit()
        return count

    def catalog_dirty_at(self):
        """When the owner last edited products in the admin (meta/catalog_cache.dirty_at), or None."""
        try:
            snap = self._db.collection("meta").document("catalog_cache").get()
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc
        return (snap.to_dict() or {}).get("dirty_at") if snap.exists else None

    def catalog_docs(self, ended_days: int) -> dict[str, dict]:
        """Every active deal plus deals that ended within `ended_days` (for the daily cache rebuild)."""
        try:
            from google.cloud.firestore_v1 import Query
            desc = Query.DESCENDING
        except ImportError:  # unit tests
            desc = "DESCENDING"
        coll = self._db.collection("deals")
        cutoff = self._now() - timedelta(days=ended_days)
        try:
            out = {s.id: s.to_dict() or {} for s in coll.where(filter=_field_filter("active", "==", True)).stream()}
            ended = (coll.where(filter=_field_filter("active", "==", False))
                     .order_by("updated_at", direction=desc).stream())
            for s in ended:
                d = s.to_dict() or {}
                if d.get("updated_at") is None or d["updated_at"] < cutoff:
                    break   # newest first: the rest are older
                out.setdefault(s.id, d)
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc
        return out

    def post_candidates(self, limit: int = 150) -> list[dict]:
        """Active deals, best discount first (uses the active+discount_pct index)."""
        try:
            from google.cloud.firestore_v1 import Query
            desc = Query.DESCENDING
        except ImportError:  # unit tests
            desc = "DESCENDING"
        query = (
            self._db.collection("deals")
            .where(filter=_field_filter("active", "==", True))
            .order_by("discount_pct", direction=desc)
            .limit(limit)
        )
        try:
            return [{**(snap.to_dict() or {}), "asin": snap.id} for snap in query.stream()]
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Firestore read failed: {exc}") from exc

    # ---- posting state -----------------------------------------------------
    def mark_posted(self, deal: Deal, platform: str, post_id: str) -> None:
        if platform not in PLATFORMS:
            raise ValueError(platform)
        ref = self._db.collection("deals").document(deal.asin)
        data = {"posted": {platform: {"at": self._now(), "price": deal.price, "id": str(post_id)}}}
        if platform == "x":
            data["x_status"] = "posted"
        ref.set(data, merge=True)

    # ---- posting slots (meta/post_slots.slots = ISO UTC times already booked) --
    def booked_slots(self) -> set[str]:
        snap = self._db.collection("meta").document("post_slots").get()
        if not getattr(snap, "exists", False):
            return set()
        return set((snap.to_dict() or {}).get("slots", []))

    def claim_slot(self, key: str, runner: str) -> bool:
        """Atomically claim one posting slot, so the Mac and the cloud never fill the same hour.
        Returns False if another runner already holds it."""
        from google.api_core.exceptions import AlreadyExists, Conflict

        try:
            self._db.collection("post_slot_claims").document(key).create({"by": runner, "at": self._now()})
            return True
        except (AlreadyExists, Conflict):
            return False

    def release_slot(self, key: str) -> None:
        self._db.collection("post_slot_claims").document(key).delete()

    def save_booked_slots(self, slots: set[str], now: datetime) -> None:
        """Keep the last 2 days of bookings; older ones can never matter again."""
        cutoff = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        keep = sorted(x for x in slots if x >= cutoff)
        self._db.collection("meta").document("post_slots").set({"slots": keep, "updated_at": now})

    # ---- post log (meta/post_log.entries: what went out, for variety and de-duplication) --
    def post_log(self) -> list:
        from .picker import LogEntry

        snap = self._db.collection("meta").document("post_log").get()
        if not getattr(snap, "exists", False):
            return []
        out = []
        for d in (snap.to_dict() or {}).get("entries", []):
            try:
                out.append(LogEntry.from_dict(d))
            except (KeyError, TypeError):
                continue
        return out

    def save_post_log(self, entries: list) -> None:
        from .picker import LOG_KEEP

        self._db.collection("meta").document("post_log").set(
            {"entries": [e.to_dict() for e in entries[-LOG_KEEP:]], "updated_at": self._now()})

    def map_social_post(self, collection: str, post_id: str, deal: Deal) -> None:
        if collection not in {"ig_media", "fb_posts"}:
            raise ValueError(collection)
        self._db.collection(collection).document(str(post_id)).set(
            {"asin": deal.asin, "url": deal.url, "title": deal.title[:120], "created_at": self._now()}
        )
