from datetime import datetime, timezone

import pytest

from deal_finder.captions import build_facebook_post
from deal_finder.zernio import FallbackPoster, ZernioError, ZernioPoster
from tests.conftest import make_deal

DUE = datetime(2026, 11, 23, 4, 30, tzinfo=timezone.utc)


class Resp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        return self._data


class Session:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def request(self, method, url, json=None, timeout=None, headers=None):
        self.calls.append((method, url, json, headers))
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def poster(platform, session):
    return ZernioPoster("zk", platform, "acc1", text_builder=build_facebook_post, session=session,
                        sleep=lambda s: None)


def test_schedules_a_facebook_post_with_the_product_image():
    s = Session(Resp(200, {"post": {"_id": "p1", "status": "scheduled"}}))
    deal = make_deal("B0ZERN0001")
    assert poster("facebook", s).post(deal, due_at=DUE) == "p1"
    method, url, body, headers = s.calls[0]
    assert (method, url) == ("POST", "https://zernio.com/api/v1/posts")
    assert headers["Authorization"] == "Bearer zk"
    assert body["platforms"] == [{"platform": "facebook", "accountId": "acc1"}]
    assert body["scheduledFor"] == "2026-11-23T04:30:00.000Z" and body["timezone"] == "UTC"
    assert body["mediaItems"] == [{"type": "image", "url": deal.image_url}]
    assert body["content"] == build_facebook_post(deal)


def test_instagram_uses_the_rendered_card():
    s = Session(Resp(201, {"post": {"_id": "p2"}}))
    poster("instagram", s).post(make_deal("B0ZERN0002"), due_at=DUE, image_url="https://cards/c/x.jpg")
    assert s.calls[0][2]["mediaItems"] == [{"type": "image", "url": "https://cards/c/x.jpg"}]


def test_text_post_has_no_media_and_instagram_refuses_text():
    s = Session(Resp(200, {"post": {"_id": "p3"}}))
    assert poster("facebook", s).post_text("Collection of the week", due_at=DUE) == "p3"
    assert "mediaItems" not in s.calls[0][2]
    with pytest.raises(ZernioError):
        poster("instagram", Session()).post_text("hi", due_at=DUE)


def test_retries_server_errors_then_gives_up_on_bad_key():
    s = Session(Resp(503, {}), Resp(200, {"post": {"_id": "p4"}}))
    assert poster("facebook", s).post(make_deal("B0ZERN0003"), due_at=DUE) == "p4"
    with pytest.raises(ZernioError, match="key rejected"):
        poster("facebook", Session(Resp(401, {}))).post(make_deal("B0ZERN0004"), due_at=DUE)


def test_rejection_message_is_reported():
    s = Session(Resp(400, {"error": "Account disconnected"}))
    with pytest.raises(ZernioError, match="Account disconnected"):
        poster("facebook", s).post(make_deal("B0ZERN0005"), due_at=DUE)


class Fake:
    def __init__(self, fail=False, wants_doc=False):
        self.fail, self.wants_doc, self.calls = fail, wants_doc, []

    def post(self, deal, due_at=None, **kw):
        self.calls.append(kw)
        if self.fail:
            raise RuntimeError("down")
        return "id9"

    def post_text(self, text, due_at=None):
        if self.fail:
            raise RuntimeError("down")
        return "t9"


def test_fallback_uses_backup_when_primary_fails_and_tags_ids():
    deal = make_deal("B0ZERN0006")
    primary, backup = Fake(fail=True), Fake()
    fb = FallbackPoster([("zernio", primary), ("buffer", backup)], "facebook")
    assert fb.post(deal, due_at=DUE) == "id9"  # buffer ids stay bare
    assert FallbackPoster([("zernio", Fake()), ("buffer", Fake())], "facebook").post(deal) == "zernio:id9"
    assert FallbackPoster([("zernio", Fake(fail=True)), ("buffer", Fake())], "x").post_text("t") == "t9"


def test_fallback_forwards_image_and_doc_only_where_wanted():
    plain, docy = Fake(fail=True), Fake(wants_doc=True)
    FallbackPoster([("zernio", plain), ("buffer", docy)], "instagram").post(
        make_deal("B0ZERN0007"), due_at=DUE, image_url="u", doc={"brand": "b"})
    assert plain.calls == [{"image_url": "u"}]
    assert docy.calls == [{"image_url": "u", "doc": {"brand": "b"}}]


def test_fallback_raises_when_everything_fails():
    with pytest.raises(RuntimeError, match="every provider failed"):
        FallbackPoster([("zernio", Fake(fail=True)), ("buffer", Fake(fail=True))], "facebook").post(
            make_deal("B0ZERN0008"))


def test_build_posters_routes_facebook_and_instagram_through_zernio(monkeypatch):
    from deal_finder.instagram import InstagramPoster
    from deal_finder.post_queue import build_posters

    env = {"BUFFER_API_KEY": "bk", "BUFFER_CHANNEL_ID": "x1", "BUFFER_FB_CHANNEL_ID": "f1",
           "BUFFER_IG_CHANNEL_ID": "i1", "CARDS_BASE_URL": "https://c", "CARDS_UPLOAD_SECRET": "s",
           "ZERNIO_API_KEY": "zk", "ZERNIO_FB_ACCOUNT_ID": "zf", "ZERNIO_IG_ACCOUNT_ID": "zi"}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    posters = build_posters(lambda name: True)
    assert isinstance(posters["facebook"], InstagramPoster)  # card poster, link in the caption
    assert [n for n, _ in posters["facebook"]._buffer._providers] == ["zernio", "buffer"]
    assert isinstance(posters["instagram"], InstagramPoster)
    assert [n for n, _ in posters["instagram"]._buffer._providers] == ["zernio", "buffer"]
    assert type(posters["x"]).__name__ == "BufferPoster"


def test_card_poster_themes_the_card_and_caption():
    from PIL import Image

    from deal_finder.captions import build_facebook_post
    from deal_finder.instagram import CardPoster

    class Up:
        def upload(self, name, jpeg):
            self.name = name
            return f"https://cards/c/{name}.jpg"

    class Sender:
        def post_text(self, text, due_at=None, image_url=None):
            self.sent = (text, image_url)
            return "z1"

    sender = Sender()
    poster = CardPoster(sender, Up(), fetch_image=lambda u: Image.new("RGB", (400, 400), "white"),
                        caption=build_facebook_post, platform="facebook")
    deal = make_deal("B0WINTER01", title="Women Puffer Winter Jacket Hooded")
    assert poster.post(deal, due_at=DUE, doc={"department": "fashion", "gender": "women"}) == "z1"
    text, image = sender.sent
    assert text.startswith("❄️ Winter steal") and deal.url in text and "#winterwear" in text
    assert image == "https://cards/c/B0WINTER01-202611230430-facebook.jpg"
