from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from PIL import Image

from deal_finder import cardart
from deal_finder.buffer import BufferError, BufferPoster, INSTAGRAM_METADATA
from deal_finder.captions import build_instagram_post
from deal_finder.instagram import CardUploader, CardUploadError, InstagramPoster, instagram_caption_builder
from tests.conftest import make_deal

SLOT = datetime(2026, 11, 17, 13, 30, tzinfo=timezone.utc)


class Resp:
    def __init__(self, status=200, body=None, text=""):
        self.status_code = status
        self._body = body
        self.text = text

    def json(self):
        return self._body


class Session:
    def __init__(self, put=None, post=None):
        self.put_resp, self.post_resp = put, post
        self.puts, self.posts = [], []

    def put(self, url, **kw):
        self.puts.append(SimpleNamespace(url=url, **kw))
        return self.put_resp

    def post(self, url, **kw):
        self.posts.append(SimpleNamespace(url=url, **kw))
        return self.post_resp


def product():
    return Image.new("RGBA", (500, 700), (200, 30, 30, 255))


def test_card_is_a_4x5_jpeg():
    jpeg = cardart.card_jpeg(make_deal(), product(), brand="Havells")
    assert jpeg[:3] == b"\xff\xd8\xff"
    import io
    assert Image.open(io.BytesIO(jpeg)).size == (1080, 1350)


def test_wrap_lines_ellipsis():
    lines = cardart.wrap_lines(len, "one two three four five six seven", 9, 2)
    assert len(lines) == 2 and lines[-1].endswith("…")


def test_instagram_caption_is_compliant():
    deal = make_deal()
    text = build_instagram_post(deal, category_tag="Room Heaters")
    assert "#ad As an Amazon Associate I earn from qualifying purchases." in text
    assert "link in our bio" in text
    assert "amazon" not in " ".join(w for w in text.split() if w.startswith("#")).lower()
    assert "#roomheaters" in text
    assert deal.url not in text  # links in captions aren't clickable
    assert len(text) <= 2200


def test_instagram_post_uploads_card_then_schedules_it():
    s = Session(put=Resp(201, {"url": "https://cards.test/c/B0TESTASIN-202611171330.jpg"}),
                post=Resp(200, {"data": {"createPost": {"post": {"id": "ig_1", "dueAt": "x"}}}}))
    buffer = BufferPoster("key", "igchan", session=s, text_builder=instagram_caption_builder,
                          metadata=INSTAGRAM_METADATA)
    ig = InstagramPoster(buffer, CardUploader("https://cards.test/", "sec", session=s), fetch_image=lambda u: product())
    assert ig.post(make_deal(), due_at=SLOT, doc={"brand": "Havells"}) == "ig_1"

    put = s.puts[0]
    assert put.url == "https://cards.test/c/B0TESTASIN-202611171330.jpg"
    assert put.headers["Authorization"] == "Bearer sec"
    assert put.data[:3] == b"\xff\xd8\xff"
    q = s.posts[0].json["query"]
    assert '"https://cards.test/c/B0TESTASIN-202611171330.jpg"' in q
    assert "instagram: { type: post, shouldShareToFeed: true }" in q
    assert '"igchan"' in q


def test_failed_upload_does_not_post():
    s = Session(put=Resp(401, text="Unauthorized"))
    buffer = BufferPoster("key", "igchan", session=s)
    ig = InstagramPoster(buffer, CardUploader("https://cards.test", "bad", session=s), fetch_image=lambda u: product())
    with pytest.raises(CardUploadError):
        ig.post(make_deal(), due_at=SLOT)
    assert s.posts == []


def test_missing_product_image_is_a_buffer_error():
    def boom(url):
        raise OSError("404")
    ig = InstagramPoster(BufferPoster("k", "c", session=Session()), CardUploader("https://c", "s", session=Session()),
                         fetch_image=boom)
    with pytest.raises(BufferError):
        ig.post(make_deal(), due_at=SLOT)
