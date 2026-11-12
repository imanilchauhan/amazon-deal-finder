from datetime import timedelta

import pytest

from deal_finder.store import DealStore, StoreError, needs_post
from tests.conftest import NOW, make_deal


@pytest.fixture
def clock():
    state = {"now": NOW}
    return state


@pytest.fixture
def store(fake_db, clock):
    return DealStore(fake_db, clock=lambda: clock["now"])


def test_insert_new_deal(store, fake_db):
    [res] = store.upsert_deals([make_deal()])
    assert res.status == "new"
    doc = fake_db.data["deals"]["B0TESTASIN"]
    assert doc["active"] is True and doc["posted"] == {}
    assert doc["first_seen_at"] == NOW and doc["updated_at"] == NOW
    assert doc["url"].endswith("?tag=mytag-21")


def test_dedupe_same_deal_is_unchanged_and_keeps_first_seen(store, fake_db, clock):
    store.upsert_deals([make_deal()])
    clock["now"] = NOW + timedelta(hours=4)
    [res] = store.upsert_deals([make_deal()])
    assert res.status == "unchanged"
    assert len(fake_db.data["deals"]) == 1
    doc = fake_db.data["deals"]["B0TESTASIN"]
    assert doc["first_seen_at"] == NOW
    assert doc["updated_at"] == NOW + timedelta(hours=4)


def test_price_drop_is_updated_and_flagged(store, fake_db):
    store.upsert_deals([make_deal(price=1299)])
    [res] = store.upsert_deals([make_deal(price=999)])
    assert res.status == "updated"
    assert fake_db.data["deals"]["B0TESTASIN"]["price"] == 999
    assert "last_drop_at" in fake_db.data["deals"]["B0TESTASIN"]


def test_mark_posted_merges_per_platform(store, fake_db, deal):
    store.upsert_deals([deal])
    store.mark_posted(deal, "x", "111")
    store.mark_posted(deal, "instagram", "222")
    posted = fake_db.data["deals"][deal.asin]["posted"]
    assert posted["x"]["id"] == "111" and posted["instagram"]["id"] == "222"
    assert posted["x"]["price"] == deal.price
    with pytest.raises(ValueError):
        store.mark_posted(deal, "myspace", "1")


def test_social_mapping(store, fake_db, deal):
    store.map_social_post("ig_media", "17890000", deal)
    m = fake_db.data["ig_media"]["17890000"]
    assert m["asin"] == deal.asin and m["url"] == deal.url


def test_deactivate_stale(store, fake_db, clock):
    store.upsert_deals([make_deal(asin="B0OLDXXXXX")])
    clock["now"] = NOW + timedelta(hours=30)
    store.upsert_deals([make_deal(asin="B0NEWXXXXX")])
    assert store.deactivate_stale(24) == 1
    assert fake_db.data["deals"]["B0OLDXXXXX"]["active"] is False
    assert fake_db.data["deals"]["B0NEWXXXXX"]["active"] is True


def test_read_failure_raises_store_error(store, fake_db):
    fake_db.fail_reads = True
    with pytest.raises(StoreError, match="read failed"):
        store.upsert_deals([make_deal()])


def test_write_failure_raises_store_error(store, fake_db):
    fake_db.fail_writes = True
    with pytest.raises(StoreError, match="write failed"):
        store.upsert_deals([make_deal()])


def test_empty_input_does_nothing(store, fake_db):
    assert store.upsert_deals([]) == []
    assert fake_db.writes == 0


@pytest.mark.parametrize(
    "posted,price,hours_ago,expected",
    [
        (None, 1000, 0, True),                       # never posted
        ({"price": 1000}, 1000, 0, True),            # malformed state (no "at") -> post
        ({"price": 1000}, 1000, 48, False),          # same price, already posted
        ({"price": 1000}, 900, 2, False),            # dropped but posted too recently
        ({"price": 1000}, 960, 48, False),           # only 4% lower
        ({"price": 1000}, 950, 48, True),            # 5% lower and >24h
    ],
)
def test_needs_post(posted, price, hours_ago, expected):
    if posted and hours_ago:
        posted = {**posted, "at": NOW - timedelta(hours=hours_ago)}
    doc = {"price": price, "posted": {"x": posted} if posted else {}}
    assert needs_post(doc, "x", NOW) is expected


def test_x_status_starts_unposted_and_flips_when_posted(store, fake_db, deal):
    store.upsert_deals([deal])
    assert fake_db.data["deals"][deal.asin]["x_status"] == "unposted"
    store.mark_posted(deal, "x", "111")
    assert fake_db.data["deals"][deal.asin]["x_status"] == "posted"
    store.upsert_deals([deal])  # a later scrape must not reset it
    assert fake_db.data["deals"][deal.asin]["x_status"] == "posted"


def test_x_status_backfilled_for_old_docs(store, fake_db, deal):
    store.upsert_deals([deal])
    del fake_db.data["deals"][deal.asin]["x_status"]
    store.upsert_deals([deal])
    assert fake_db.data["deals"][deal.asin]["x_status"] == "unposted"
