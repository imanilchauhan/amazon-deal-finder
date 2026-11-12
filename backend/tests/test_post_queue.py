from datetime import timedelta

from deal_finder.captions import build_facebook_post
from deal_finder.post_queue import pick_deal, run_once
from tests.conftest import NOW, make_deal


def doc(deal, *, updated=NOW - timedelta(hours=1), posted=None, active=True):
    return {**deal.to_dict(), "updated_at": updated, "posted": posted or {}, "active": active}


class Store:
    def __init__(self, docs):
        self.docs = docs
        self.marked = []

    def post_candidates(self, limit=300):
        return self.docs

    def mark_posted(self, deal, platform, post_id):
        self.marked.append((deal.asin, platform, post_id))


class Poster:
    def __init__(self, pid="p1", fail=False):
        self.pid, self.fail, self.sent = pid, fail, []

    def post(self, deal):
        if self.fail:
            raise RuntimeError("buffer down")
        self.sent.append(deal.asin)
        return self.pid


def test_posts_exactly_one_deal_to_every_channel():
    a, b = make_deal("B0AAAAAAAA"), make_deal("B0BBBBBBBB", title="Prestige Iris 750W Mixer Grinder")
    store = Store([doc(a), doc(b)])
    x, fb = Poster("x1"), Poster("fb1")
    res = run_once(store, {"x": x, "facebook": fb}, NOW)
    assert res.asin == "B0AAAAAAAA"
    assert x.sent == fb.sent == ["B0AAAAAAAA"]
    assert store.marked == [("B0AAAAAAAA", "x", "x1"), ("B0AAAAAAAA", "facebook", "fb1")]


def test_only_posts_to_the_channel_that_still_needs_it():
    a = make_deal("B0AAAAAAAA")
    store = Store([doc(a, posted={"x": {"at": NOW - timedelta(hours=2), "price": a.price, "id": "old"}})])
    x, fb = Poster(), Poster("fb9")
    res = run_once(store, {"x": x, "facebook": fb}, NOW)
    assert x.sent == [] and fb.sent == ["B0AAAAAAAA"]
    assert res.posts == [{"platform": "facebook", "id": "fb9"}]


def test_skips_stale_prices_and_variants_of_recent_posts():
    stale = make_deal("B0STALE000", title="Philips Air Fryer HD9200")
    posted = make_deal("B0POSTED00", title="Boat Rockerz 450 Wireless Headphones Black")
    variant = make_deal("B0VARIANT0", title="Boat Rockerz 450 Wireless Headphones Blue")
    fresh = make_deal("B0FRESH000", title="Lakme 9 to 5 Primer Matte Lipstick")
    every = {p: {"at": NOW - timedelta(hours=3), "price": posted.price, "id": "z"} for p in ("x", "facebook")}
    docs = [doc(stale, updated=NOW - timedelta(hours=30)), doc(posted, posted=every), doc(variant), doc(fresh)]
    deal, _ = pick_deal(docs, ["x", "facebook"], NOW)
    assert deal.asin == "B0FRESH000"


def test_one_channel_failing_does_not_block_the_other():
    a = make_deal("B0AAAAAAAA")
    store = Store([doc(a)])
    res = run_once(store, {"x": Poster(fail=True), "facebook": Poster("fb1")}, NOW)
    assert store.marked == [("B0AAAAAAAA", "facebook", "fb1")]
    assert res.errors[0]["platform"] == "x"


def test_empty_queue_and_dry_run_post_nothing():
    assert run_once(Store([]), {"x": Poster()}, NOW).asin is None
    store, x = Store([doc(make_deal())]), Poster()
    res = run_once(store, {"x": x}, NOW, dry_run=True)
    assert x.sent == [] and store.marked == [] and res.posts[0]["dry_run"]


def test_facebook_post_has_link_disclosure_and_no_comment_bait():
    d = make_deal()
    text = build_facebook_post(d)
    assert d.url in text
    assert "#ad As an Amazon Associate I earn from qualifying purchases." in text
    assert "Comment" not in text and "DM" not in text
