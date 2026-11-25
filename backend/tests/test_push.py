from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from deal_finder import push

NOW = datetime(2026, 11, 26, 13, 0, tzinfo=timezone.utc)


def _iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def _snap():
    return {"deals": {
        "A1": {"active": True, "first_seen_at": _iso(NOW - timedelta(hours=2)), "category": "kurtas-kurtis",
               "department": "fashion-women", "price": 499},
        "A2": {"active": True, "first_seen_at": _iso(NOW - timedelta(hours=5)), "category": "kurtas-kurtis"},
        "A3": {"active": True, "first_seen_at": _iso(NOW - timedelta(hours=1)), "category": "smartphones"},
        "OLD": {"active": True, "first_seen_at": _iso(NOW - timedelta(days=3)), "category": "smartphones"},
        "ENDED": {"active": False, "first_seen_at": _iso(NOW - timedelta(hours=1))},
        "NOSEEN": {"active": True},
    }}


def test_new_deals_only_active_last_24h_newest_first():
    assert [d["asin"] for d in push.new_deals(_snap(), NOW)] == ["A3", "A1", "A2"]
    assert push.new_deals(None, NOW) == []


def test_message_names_top_categories_without_prices():
    msg = push.build_message(push.new_deals(_snap(), NOW))
    assert msg["title"] == "3 new deals on CartCrush today"
    assert msg["body"].startswith("Smartphones")
    for word in ("₹", "price", "drop", "499"):
        assert word not in (msg["title"] + msg["body"]).lower()
    assert msg["data"] == {"tab": "home", "count": "3"}


def test_single_deal_and_unknown_category():
    msg = push.build_message([{"category": "nope"}])
    assert msg["title"] == "1 new deal on CartCrush today"
    assert msg["body"] == "Tap to see what's new."
    assert push.build_message([]) is None


class _Msg:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def _fake_messaging(sent):
    return SimpleNamespace(
        Message=_Msg, Notification=_Msg, AndroidConfig=_Msg, AndroidNotification=_Msg, APNSConfig=_Msg,
        send=lambda m: sent.append(m) or "projects/x/messages/1")


def test_run_sends_to_topic():
    sent = []
    cache = SimpleNamespace(load=lambda: _snap())
    assert push.run(cache, now=NOW, messaging=_fake_messaging(sent)) == 3
    assert sent[0].topic == "daily-deals"
    assert sent[0].notification.title.startswith("3 new deals")


def test_run_skips_when_nothing_new_and_dry_run_sends_nothing():
    sent = []
    empty = SimpleNamespace(load=lambda: {"deals": {}})
    assert push.run(empty, now=NOW, messaging=_fake_messaging(sent)) == 0
    assert push.run(SimpleNamespace(load=_snap), now=NOW, dry_run=True, messaging=_fake_messaging(sent)) == 3
    assert sent == []
