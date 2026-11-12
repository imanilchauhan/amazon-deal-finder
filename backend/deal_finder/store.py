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


MANUAL_MAX_AGE_HOURS = 24 * 7


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
                doc = {**fields, "active": True, "first_seen_at": now, "updated_at": now, "posted": {}, "x_status": "unposted", **cats}
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

    def deactivate_stale(self, max_age_hours: int) -> int:
        """Hide deals not seen recently (Amazon prices shouldn't be shown when >24h old)."""
        cutoff = self._now() - timedelta(hours=max_age_hours)
        manual_cutoff = self._now() - timedelta(hours=max(max_age_hours, MANUAL_MAX_AGE_HOURS))
        query = self._db.collection("deals").where(filter=_field_filter("active", "==", True))
        batch = self._db.batch()
        count = 0
        for snap in query.stream():
            data = snap.to_dict() or {}
            updated = data.get("updated_at")
            # Hand-added (manual) products are curated: they stay up for a week, not a day.
            limit = manual_cutoff if data.get("source") == "manual" else cutoff
            if updated is not None and updated < limit:
                batch.update(snap.reference, {"active": False})
                count += 1
        if count:
            batch.commit()
        return count

    # ---- posting state -----------------------------------------------------
    def mark_posted(self, deal: Deal, platform: str, post_id: str) -> None:
        if platform not in PLATFORMS:
            raise ValueError(platform)
        ref = self._db.collection("deals").document(deal.asin)
        data = {"posted": {platform: {"at": self._now(), "price": deal.price, "id": str(post_id)}}}
        if platform == "x":
            data["x_status"] = "posted"
        ref.set(data, merge=True)

    def map_social_post(self, collection: str, post_id: str, deal: Deal) -> None:
        if collection not in {"ig_media", "fb_posts"}:
            raise ValueError(collection)
        self._db.collection(collection).document(str(post_id)).set(
            {"asin": deal.asin, "url": deal.url, "title": deal.title[:120], "created_at": self._now()}
        )
