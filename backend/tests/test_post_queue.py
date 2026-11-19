from datetime import datetime, timedelta, timezone

from deal_finder.captions import build_facebook_post
from deal_finder.post_queue import IST, pick_deal, run_once, slot_key, upcoming_slots
from tests.conftest import NOW, make_deal

# 11:18 IST on 13 Nov 2026
MORNING = datetime(2026, 11, 13, 5, 48, tzinfo=timezone.utc)


def doc(deal, *, updated=None, posted=None, active=True, now=MORNING):
    return {**deal.to_dict(), "asin": deal.asin, "updated_at": updated or now - timedelta(hours=1),
            "posted": posted or {}, "active": active}


class Store:
    def __init__(self, docs, booked=()):
        self.docs = docs
        self.marked = []
        self.booked = set(booked)
        self.saved = None

    def post_candidates(self, limit=300):
        return self.docs

    def mark_posted(self, deal, platform, post_id):
        self.marked.append((deal.asin, platform, post_id))

    def booked_slots(self):
        return set(self.booked)

    def save_booked_slots(self, slots, now):
        self.saved = set(slots)


class Poster:
    def __init__(self, pid="p", fail=False):
        self.pid, self.fail, self.sent = pid, fail, []

    def post(self, deal, due_at=None):
        if self.fail:
            raise RuntimeError("buffer down")
        self.sent.append((deal.asin, due_at))
        return f"{self.pid}-{len(self.sent)}"


def deals(n):
    names = ["Philips Air Fryer HD9200", "Lakme 9 to 5 Primer Lipstick", "Boat Airdopes 141 Earbuds",
             "Prestige Iris Mixer Grinder", "Noise ColorFit Pro Smartwatch", "Wildcraft Laptop Backpack",
             "Milton Thermosteel Flask 1L", "Bajaj Majesty Room Heater"]
    return [make_deal(f"B0TEST{i:04d}", title=names[i]) for i in range(n)]


def ist(slot):
    return slot.astimezone(IST).strftime("%H:%M")


def test_upcoming_slots_are_hourly_ist_inside_posting_hours():
    assert [ist(s) for s in upcoming_slots(MORNING)] == ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
    late = datetime(2026, 11, 13, 15, 0, tzinfo=timezone.utc)  # 20:30 IST
    assert [ist(s) for s in upcoming_slots(late)] == ["21:00", "22:00"]
    night = datetime(2026, 11, 13, 20, 0, tzinfo=timezone.utc)  # 01:30 IST
    assert upcoming_slots(night) == []


def test_slot_too_close_is_skipped():
    at_1157 = datetime(2026, 11, 13, 6, 27, tzinfo=timezone.utc)  # 11:57 IST
    assert ist(upcoming_slots(at_1157)[0]) == "13:00"


def test_each_run_fills_every_free_slot_with_a_different_deal():
    store = Store([doc(d) for d in deals(8)])
    x, fb = Poster("x"), Poster("fb")
    res = run_once(store, {"x": x, "facebook": fb}, MORNING)
    assert len(res.asins) == 6
    assert [ist(due) for _, due in x.sent] == ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
    assert [a for a, _ in x.sent] == [a for a, _ in fb.sent]
    assert len(store.saved) == 6


def test_booked_slots_are_not_filled_twice():
    slots = upcoming_slots(MORNING)
    store = Store([doc(d) for d in deals(8)], booked={slot_key(s) for s in slots[:4]})
    x = Poster()
    run_once(store, {"x": x}, MORNING)
    assert [ist(due) for _, due in x.sent] == ["16:00", "17:00"]


def test_runs_out_of_deals_gracefully():
    store = Store([doc(d) for d in deals(2)])
    res = run_once(store, {"x": Poster()}, MORNING)
    assert len(res.asins) == 2 and len(res.skipped_slots) == 4
    assert len(store.saved) == 2


def test_only_posts_to_the_channel_that_still_needs_it():
    a = make_deal("B0AAAAAAAA")
    posted = {"x": {"at": MORNING - timedelta(hours=2), "price": a.price, "id": "old"}}
    store = Store([doc(a, posted=posted)])
    x, fb = Poster(), Poster("fb")
    run_once(store, {"x": x, "facebook": fb}, MORNING, slots=upcoming_slots(MORNING)[:1])
    assert x.sent == [] and [s[0] for s in fb.sent] == ["B0AAAAAAAA"]


def test_skips_stale_prices_and_variants_of_recent_posts():
    stale = make_deal("B0STALE000", title="Philips Air Fryer HD9200")
    posted = make_deal("B0POSTED00", title="Boat Rockerz 450 Wireless Headphones Black")
    variant = make_deal("B0VARIANT0", title="Boat Rockerz 450 Wireless Headphones Blue")
    fresh = make_deal("B0FRESH000", title="Lakme 9 to 5 Primer Matte Lipstick")
    every = {p: {"at": NOW - timedelta(hours=3), "price": posted.price, "id": "z"} for p in ("x", "facebook")}
    docs = [doc(stale, updated=NOW - timedelta(hours=30), now=NOW), doc(posted, posted=every, now=NOW),
            doc(variant, now=NOW), doc(fresh, now=NOW)]
    deal, _ = pick_deal(docs, ["x", "facebook"], NOW)
    assert deal.asin == "B0FRESH000"


def test_one_channel_failing_does_not_block_the_other():
    store = Store([doc(make_deal("B0AAAAAAAA"))])
    res = run_once(store, {"x": Poster(fail=True), "facebook": Poster("fb")}, MORNING,
                   slots=upcoming_slots(MORNING)[:1])
    assert store.marked == [("B0AAAAAAAA", "facebook", "fb-1")]
    assert res.errors[0]["platform"] == "x" and len(store.saved) == 1


def test_slot_stays_free_when_every_channel_fails():
    store = Store([doc(make_deal())])
    run_once(store, {"x": Poster(fail=True)}, MORNING, slots=upcoming_slots(MORNING)[:1])
    assert store.saved is None


def test_dry_run_posts_and_books_nothing():
    store, x = Store([doc(d) for d in deals(3)]), Poster()
    res = run_once(store, {"x": x}, MORNING, dry_run=True)
    assert x.sent == [] and store.marked == [] and store.saved is None and len(res.posts) == 3


def test_facebook_post_has_link_disclosure_and_no_comment_bait():
    d = make_deal()
    text = build_facebook_post(d)
    assert d.url in text
    assert "#ad As an Amazon Associate I earn from qualifying purchases." in text
    assert "Comment" not in text and "DM" not in text


def test_trending_products_are_posted_first():
    big = make_deal("B0BIGDROP0", title="Philips Air Fryer HD9200")
    hot = make_deal("B0TRENDING", title="Cetaphil Gentle Skin Hydrating Face Wash")
    docs = [doc(big), {**doc(hot), "source": "trending"}]
    deal, _ = pick_deal(docs, ["x"], MORNING)
    assert deal.asin == "B0TRENDING"


def test_instagram_poster_gets_the_firestore_doc():
    class DocPoster(Poster):
        wants_doc = True

        def post(self, deal, due_at=None, doc=None):
            self.docs = getattr(self, "docs", []) + [doc]
            return super().post(deal, due_at)

    d = deals(1)[0]
    store = Store([{**doc(d), "brand": "Philips"}])
    ig, x = DocPoster("ig"), Poster("x")
    run_once(store, {"x": x, "instagram": ig}, MORNING)
    assert ig.docs[0]["brand"] == "Philips"
    assert ("B0TEST0000", "instagram", "ig-1") in store.marked


def test_run_test_posts_one_deal_to_one_channel_soon():
    from deal_finder.post_queue import run_test

    store = Store([doc(d) for d in deals(3)])
    ig = Poster("ig")
    res = run_test(store, "instagram", ig, MORNING)
    assert len(ig.sent) == 1 and ig.sent[0][1] == MORNING + timedelta(minutes=10)
    assert store.marked == [(ig.sent[0][0], "instagram", "ig-1")]
    assert store.saved is None  # slot plan untouched


def test_full_price_products_are_never_posted():
    full = make_deal("B0FULL0001", title="Woodland Mens Leather Boots", price=2999, original=2999)
    store = Store([doc(full)])
    x = Poster("x")
    run_once(store, {"x": x}, MORNING)
    assert x.sent == []


class TextPoster(Poster):
    def __init__(self, pid):
        super().__init__(pid)
        self.texts = []

    def post_text(self, text, due_at=None):
        self.texts.append((text, due_at))
        return f"{self.pid}-c{len(self.texts)}"


def test_sunday_7pm_slot_shares_a_collection_on_x_and_facebook():
    from deal_finder.collections import is_collection_slot

    sunday = datetime(2026, 11, 22, 13, 30, tzinfo=timezone.utc)  # 7 PM IST, Sunday
    assert is_collection_slot(sunday)
    store = Store([doc(d, now=sunday) for d in deals(3)])
    x, fb, ig = TextPoster("x"), TextPoster("fb"), Poster("ig")
    seen = []
    res = run_once(store, {"x": x, "facebook": fb, "instagram": ig}, sunday - timedelta(hours=1),
                   slots=[sunday], collections=True, live=lambda url: seen.append(url) or "winter" in url)
    assert len(x.texts) == 1 and len(fb.texts) == 1 and ig.sent == []
    assert "Collection of the week" in x.texts[0][0] and "#ad" in x.texts[0][0]
    assert "As an Amazon Associate" in fb.texts[0][0]
    assert all(p["asin"].startswith("collection:") for p in res.posts)
    assert "winter" in seen[-1]


def test_collection_slot_falls_back_to_a_deal_when_nothing_is_live():
    sunday = datetime(2026, 11, 22, 13, 30, tzinfo=timezone.utc)
    store = Store([doc(d, now=sunday) for d in deals(2)])
    x = TextPoster("x")
    run_once(store, {"x": x}, sunday - timedelta(hours=1), slots=[sunday], collections=True, live=lambda url: False)
    assert x.texts == [] and len(x.sent) == 1


def test_collection_slugs_match_the_website():
    from pathlib import Path

    from deal_finder.collections import COLLECTIONS, web_slugs

    ts = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "collections.ts"
    if not ts.exists():
        return
    assert sorted(s for s, _, _ in COLLECTIONS) == sorted(web_slugs(ts.read_text()))


def test_prefers_deals_every_channel_still_needs():
    old = make_deal("B0OLD00001", title="Prestige Pressure Cooker 3 Litre", price=900, original=2000)  # 55% off
    new = make_deal("B0NEW00001", title="Boat Rockerz Wireless Headphones", price=1200, original=2000)  # 40% off
    d_old = doc(old)
    d_old["posted"] = {p: {"at": MORNING - timedelta(days=3), "price": 900, "id": "1"} for p in ("x", "facebook")}
    d_old["source"] = "trending"
    store = Store([d_old, doc(new)])
    x, fb, ig = Poster("x"), Poster("fb"), Poster("ig")
    run_once(store, {"x": x, "facebook": fb, "instagram": ig}, MORNING, slots=[MORNING + timedelta(hours=1)])
    assert [a for a, _ in x.sent] == ["B0NEW00001"]
    assert [a for a, _ in ig.sent] == ["B0NEW00001"]
