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
