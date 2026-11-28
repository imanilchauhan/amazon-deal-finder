"""Product cache: a JSON snapshot of the catalog on the cartcrush-cards Worker (Workers KV).

Why: Firestore's free plan allows 50k reads a day. Website builds and the admin used to read
every product from Firestore each time (~2,000 reads a build). Now the runner keeps a cached
copy in sync for free — it already holds every product it just scraped — and the site build
and the admin read that copy instead of Firestore.

  GET  {CARDS_BASE_URL}/catalog.json   public (the data is on the website anyway)
  PUT  {CARDS_BASE_URL}/catalog.json   Bearer CARDS_UPLOAD_SECRET; the Worker only stores bytes

Shape: {"version": 1, "updated_at", "synced_at", "deals": {asin: entry}, "picks": {slug: [asin]}}
Each run merges its upserts and deactivations into the snapshot; once a day (or when the
snapshot is missing) the runner rebuilds it from Firestore so drift from the other runner's
writes heals. An admin edit sets meta/catalog_cache.dirty_at, which triggers that rebuild on the
next pass. Ended deals older than ENDED_DAYS are dropped.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

log = logging.getLogger(__name__)

ENDED_DAYS = 31
FULL_SYNC_HOURS = 24
FIELDS = (
    "title", "price", "original_price", "discount_pct", "currency", "image_url", "images", "url",
    "active", "updated_at", "scraped_at", "first_seen_at", "department", "category", "brand",
    "gender", "source", "x_status", "collection_pick", "last_drop_at",
)


def _json(v):
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "isoformat"):  # Firestore DatetimeWithNanoseconds
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _json(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_json(x) for x in v]
    return v


def entry(doc: dict) -> dict:
    """The cached fields of one Firestore deal document (JSON-safe)."""
    out = {k: _json(doc[k]) for k in FIELDS if k in doc and doc[k] is not None}
    posted = doc.get("posted") or {}
    if isinstance(posted, dict):
        # Only which channels and when: enough for the admin's badges and "posted N h ago".
        out["posted"] = {p: {"at": _json((v or {}).get("at"))} for p, v in posted.items()
                         if not str(p).endswith("_manual_at")}
    return out


def _parse(ts) -> datetime | None:
    if not isinstance(ts, str) or not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def prune(snapshot: dict, now: datetime) -> dict:
    """Drop ended deals not seen for ENDED_DAYS (the site only keeps ended pages that long)."""
    cutoff = now - timedelta(days=ENDED_DAYS)
    deals = snapshot.get("deals") or {}
    for asin in [a for a, d in deals.items()
                 if not d.get("active") and (_parse(d.get("updated_at")) or cutoff) <= cutoff]:
        del deals[asin]
    return snapshot


def merge(snapshot: dict, upserts: dict[str, dict], deactivated: Iterable[str],
          picks: dict[str, list[str]] | None, now: datetime) -> dict:
    deals = snapshot.setdefault("deals", {})
    for asin, doc in upserts.items():
        deals[asin] = {**deals.get(asin, {}), **entry(doc)}
    for asin in deactivated:
        if asin in deals:
            deals[asin]["active"] = False
    if picks is not None:
        snapshot["picks"] = picks
    snapshot["version"] = 1
    snapshot["updated_at"] = _json(now)
    return prune(snapshot, now)


class CatalogCache:
    def __init__(self, base_url: str, secret: str, session=None, timeout: int = 60):
        import requests

        self._url = base_url.rstrip("/") + "/catalog.json"
        self._secret = secret
        self._http = session or requests.Session()
        self._timeout = timeout

    def load(self) -> dict | None:
        # ?fresh=1 skips the Worker's edge copy: we merge into this snapshot, so it must be current.
        resp = self._http.get(self._url, params={"fresh": "1"}, timeout=self._timeout,
                              headers={"Cache-Control": "no-cache"})
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def save(self, snapshot: dict) -> int:
        body = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False).encode()
        resp = self._http.put(self._url, data=body, timeout=self._timeout, headers={
            "Authorization": f"Bearer {self._secret}", "Content-Type": "application/json"})
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"catalog upload failed: HTTP {resp.status_code} {resp.text[:120]}")
        return len(body)


def trending_due(snapshot: dict, limit: int, now: datetime, older_than_hours: int = 16) -> list[str]:
    """Like DealStore.trending_to_refresh, from the cached snapshot: no Firestore reads."""
    if limit <= 0:
        return []
    cutoff = now - timedelta(hours=older_than_hours)
    stale = []
    for asin, d in (snapshot.get("deals") or {}).items():
        updated = _parse(d.get("updated_at"))
        if d.get("active") and d.get("source") == "trending" and updated is not None and updated < cutoff:
            stale.append((updated, asin))
    return [a for _, a in sorted(stale)[:limit]]


def picks_due(snapshot: dict, limit: int, now: datetime, older_than_hours: int = 16) -> list[str]:
    """Like DealStore.collection_asins_to_refresh, from the cached snapshot: no Firestore reads."""
    if limit <= 0:
        return []
    deals = snapshot.get("deals") or {}
    asins = list(dict.fromkeys(a for picks in (snapshot.get("picks") or {}).values() for a in picks))
    cutoff = now - timedelta(hours=older_than_hours)
    never, stale = [], []
    for a in asins:
        d = deals.get(a) or {}
        updated = _parse(d.get("updated_at"))
        if updated is None or not d.get("active"):
            never.append(a)
        elif updated < cutoff:
            stale.append((updated, a))
    return (never + [a for _, a in sorted(stale)])[:limit]


def needs_full_sync(snapshot: dict | None, now: datetime, dirty_at=None) -> bool:
    """Rebuild when there is no snapshot, it is a day old, or the owner edited products since."""
    synced = _parse((snapshot or {}).get("synced_at"))
    if synced is None or now - synced > timedelta(hours=FULL_SYNC_HOURS):
        return True
    dirty = _parse(_json(dirty_at)) if dirty_at is not None else None
    return dirty is not None and dirty > synced


def sync(cache: CatalogCache, store, *, upserts: dict[str, dict], deactivated: Iterable[str],
         picks: dict[str, list[str]] | None, now: datetime) -> dict:
    """Merge this run's changes into the cached snapshot (or rebuild it once a day). Never raises."""
    try:
        snapshot = cache.load()
        dirty_at = store.catalog_dirty_at() if hasattr(store, "catalog_dirty_at") else None
        if needs_full_sync(snapshot, now, dirty_at):
            docs = store.catalog_docs(ENDED_DAYS)
            snapshot = {"deals": {a: entry(d) for a, d in docs.items()},
                        "picks": picks if picks is not None else store.collection_picks(),
                        "synced_at": _json(now)}
            snapshot = merge(snapshot, {}, [], None, now)
            kind = "full"
        else:
            snapshot = merge(snapshot, upserts, deactivated, picks, now)
            kind = "patch"
        size = cache.save(snapshot)
        active = sum(1 for d in snapshot["deals"].values() if d.get("active"))
        log.info("catalog cache %s: %d products (%d live), %.0f KB", kind, len(snapshot["deals"]), active, size / 1024)
        return {"kind": kind, "products": len(snapshot["deals"]), "live": active}
    except Exception as exc:  # noqa: BLE001 - the cache is an optimisation, never fail the run
        log.warning("catalog cache not updated: %s", exc)
        return {"kind": "error", "error": str(exc)[:200]}
