from datetime import datetime, timedelta, timezone

from deal_finder import catalog

NOW = datetime(2026, 11, 26, 6, 0, tzinfo=timezone.utc)


def doc(**kw):
    return {"title": "Fleece hoodie", "price": 499.0, "original_price": 999.0, "discount_pct": 50,
            "currency": "INR", "image_url": "https://m.media-amazon.com/images/I/a.jpg", "active": True,
            "url": "https://www.amazon.in/dp/B0TEST1234/?tag=cartcrush004-21", "updated_at": NOW,
            "posted": {"x": {"at": NOW, "id": "123", "price": 499.0}, "x_manual_at": NOW}, **kw}


def test_entry_is_json_safe_and_keeps_only_cached_fields():
    e = catalog.entry(doc(secret_field="nope"))
    assert e["updated_at"] == "2026-11-26T06:00:00Z"
    assert e["posted"] == {"x": {"at": "2026-11-26T06:00:00Z"}}       # no ids, no *_manual_at
    assert "secret_field" not in e


def test_merge_upserts_deactivates_and_prunes_old_ended_deals():
    old = (NOW - timedelta(days=40)).isoformat()
    snap = {"deals": {"B0GONE": {"active": False, "updated_at": old},
                      "B0LIVE": {"active": True, "title": "x", "updated_at": NOW.isoformat()},
                      "B0KEEP": {"active": True, "title": "y", "updated_at": NOW.isoformat()}}}
    out = catalog.merge(snap, {"B0NEW": doc()}, ["B0LIVE"], {"winter": ["B0NEW"]}, NOW)
    assert "B0GONE" not in out["deals"]                       # ended > 31 days ago
    assert out["deals"]["B0LIVE"]["active"] is False and out["deals"]["B0KEEP"]["active"] is True
    assert out["deals"]["B0NEW"]["price"] == 499.0 and out["picks"] == {"winter": ["B0NEW"]}


class Cache:
    def __init__(self, snap):
        self.snap, self.saved = snap, None

    def load(self):
        return self.snap

    def save(self, s):
        self.saved = s
        return 10


class Store:
    def __init__(self):
        self.full_reads = 0

    def catalog_docs(self, days):
        self.full_reads += 1
        return {"B0A": doc(), "B0B": doc(active=False)}

    def collection_picks(self):
        return {"gifts": ["B0A"]}


def test_sync_patches_a_fresh_snapshot_without_reading_firestore():
    cache, store = Cache({"synced_at": (NOW - timedelta(hours=2)).isoformat(), "deals": {}}), Store()
    out = catalog.sync(cache, store, upserts={"B0NEW": doc()}, deactivated=[], picks=None, now=NOW)
    assert out["kind"] == "patch" and store.full_reads == 0 and "B0NEW" in cache.saved["deals"]


def test_sync_rebuilds_once_a_day_or_when_missing():
    for snap in (None, {"synced_at": (NOW - timedelta(hours=30)).isoformat(), "deals": {}}):
        cache, store = Cache(snap), Store()
        out = catalog.sync(cache, store, upserts={}, deactivated=[], picks=None, now=NOW)
        assert out == {"kind": "full", "products": 2, "live": 1}
        assert store.full_reads == 1 and cache.saved["picks"] == {"gifts": ["B0A"]}
        assert cache.saved["synced_at"] == "2026-11-26T06:00:00Z"


def test_sync_never_raises():
    class Broken(Cache):
        def load(self):
            raise OSError("network down")

    assert catalog.sync(Broken(None), Store(), upserts={}, deactivated=[], picks=None, now=NOW)["kind"] == "error"


def test_sync_rebuilds_after_an_admin_edit():
    class Edited(Store):
        def catalog_dirty_at(self):
            return NOW - timedelta(minutes=5)

    cache, store = Cache({"synced_at": (NOW - timedelta(hours=2)).isoformat(), "deals": {}}), Edited()
    assert catalog.sync(cache, store, upserts={}, deactivated=[], picks=None, now=NOW)["kind"] == "full"
    cache, store = Cache({"synced_at": (NOW - timedelta(minutes=1)).isoformat(), "deals": {}}), Edited()
    assert catalog.sync(cache, store, upserts={}, deactivated=[], picks=None, now=NOW)["kind"] == "patch"


def test_trending_and_picks_due_from_snapshot():
    from datetime import datetime, timezone

    from deal_finder.catalog import picks_due, trending_due

    now = datetime(2026, 11, 28, 12, tzinfo=timezone.utc)
    snap = {
        "deals": {
            "OLD": {"active": True, "source": "trending", "updated_at": "2026-11-27T10:00:00Z"},
            "OLDER": {"active": True, "source": "trending", "updated_at": "2026-11-27T08:00:00Z"},
            "FRESH": {"active": True, "source": "trending", "updated_at": "2026-11-28T11:00:00Z"},
            "ENDED": {"active": False, "source": "trending", "updated_at": "2026-11-26T08:00:00Z"},
            "P1": {"active": True, "updated_at": "2026-11-27T09:00:00Z"},
            "P2": {"active": True, "updated_at": "2026-11-28T11:30:00Z"},
        },
        "picks": {"winter": ["P1", "P2", "NEW"]},
    }
    assert trending_due(snap, 5, now) == ["OLDER", "OLD"]
    assert trending_due(snap, 1, now) == ["OLDER"]
    assert picks_due(snap, 5, now) == ["NEW", "P1"]
    assert picks_due(snap, 0, now) == []
