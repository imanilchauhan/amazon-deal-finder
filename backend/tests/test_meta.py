from types import SimpleNamespace

import pytest

from deal_finder.config import MetaConfig
from deal_finder.meta import MetaAPIError, MetaClient

CFG = MetaConfig(enabled=True, page_id="PAGE1", page_access_token="TOKEN", ig_user_id="IG1", graph_version="v26.0")


class Resp:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class FakeSession:
    """Routes (method, url-substring) -> list of responses (consumed in order)."""

    def __init__(self, routes):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls = []

    def request(self, method, url, **kw):
        self.calls.append(SimpleNamespace(method=method, url=url, **kw))
        for (m, frag), queue in self.routes.items():
            if m == method and frag in url and queue:
                out = queue.pop(0)
                if isinstance(out, Exception):
                    raise out
                return out
        raise AssertionError(f"unexpected call {method} {url}")


def client(routes, **kw):
    s = FakeSession(routes)
    return MetaClient(CFG, session=s, sleep=lambda x: None, poll_interval=0, **kw), s


@pytest.fixture
def jpg(tmp_path):
    p = tmp_path / "card.jpg"
    p.write_bytes(b"\xff\xd8fakejpeg")
    return p


@pytest.fixture
def mp4(tmp_path):
    p = tmp_path / "reel.mp4"
    p.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 100)
    return p


def test_facebook_photo_returns_post_id(jpg):
    c, s = client({("POST", "/PAGE1/photos"): [Resp(200, {"id": "PH1", "post_id": "PAGE1_99"})]})
    assert c.post_facebook_photo(jpg, "caption") == "PAGE1_99"
    call = s.calls[0]
    assert call.url == "https://graph.facebook.com/v26.0/PAGE1/photos"
    assert call.params["access_token"] == "TOKEN"
    assert call.data["message"] == "caption"
    assert "source" in call.files


def test_facebook_video_uses_graph_video_host(mp4):
    c, s = client({("POST", "/PAGE1/videos"): [Resp(200, {"id": "VID7"})]})
    assert c.post_facebook_video(mp4, "cap") == "PAGE1_VID7"
    assert s.calls[0].url.startswith("https://graph-video.facebook.com/v26.0/")


def test_instagram_reel_resumable_flow(mp4):
    c, s = client({
        ("POST", "/IG1/media_publish"): [Resp(200, {"id": "IGMEDIA1"})],
        ("POST", "/IG1/media"): [Resp(200, {"id": "C1", "uri": "https://rupload.facebook.com/ig-api-upload/v26.0/C1"})],
        ("POST", "rupload.facebook.com"): [Resp(200, {"success": True})],
        ("GET", "/C1"): [Resp(200, {"status_code": "IN_PROGRESS"}), Resp(200, {"status_code": "FINISHED"})],
    })
    assert c.post_instagram_reel(mp4, "cap") == "IGMEDIA1"
    create, upload, poll1, poll2, publish = s.calls
    assert create.data["media_type"] == "REELS" and create.data["upload_type"] == "resumable"
    assert upload.headers["Authorization"] == "OAuth TOKEN"
    assert upload.headers["offset"] == "0"
    assert upload.headers["file_size"] == str(mp4.stat().st_size)
    assert "access_token" not in upload.params  # token only in header for rupload
    assert publish.data == {"creation_id": "C1"}


def test_instagram_container_error_raises(mp4):
    c, _ = client({
        ("POST", "/IG1/media"): [Resp(200, {"id": "C2"})],
        ("POST", "rupload.facebook.com"): [Resp(200, {"success": True})],
        ("GET", "/C2"): [Resp(200, {"status_code": "ERROR", "status": "Error: unsupported codec"})],
    })
    with pytest.raises(MetaAPIError, match="ERROR"):
        c.post_instagram_reel(mp4, "cap")


def test_instagram_image(jpg):
    c, s = client({
        ("POST", "/IG1/media_publish"): [Resp(200, {"id": "IGM2"})],
        ("POST", "/IG1/media"): [Resp(200, {"id": "C3"})],
        ("GET", "/C3"): [Resp(200, {"status_code": "FINISHED"})],
    })
    assert c.post_instagram_image("https://m.media-amazon.com/x.jpg", "cap") == "IGM2"
    assert s.calls[0].data["image_url"] == "https://m.media-amazon.com/x.jpg"
    with pytest.raises(MetaAPIError):
        c.post_instagram_image("http://insecure/x.jpg", "cap")


def test_rate_limit_is_retried_then_succeeds(jpg):
    rate_limited = Resp(400, {"error": {"message": "Application request limit reached", "code": 4}})
    c, s = client({("POST", "/PAGE1/photos"): [rate_limited, Resp(200, {"id": "1", "post_id": "PAGE1_1"})]})
    assert c.post_facebook_photo(jpg, "cap") == "PAGE1_1"
    assert len(s.calls) == 2


def test_server_error_on_non_idempotent_call_is_not_retried(jpg):
    c, s = client({("POST", "/PAGE1/photos"): [Resp(500, {"error": {"message": "boom", "code": 2}})] * 3})
    with pytest.raises(MetaAPIError) as e:
        c.post_facebook_photo(jpg, "cap")
    assert e.value.http_status == 500
    assert len(s.calls) == 1  # never risk a double post


def test_server_error_on_idempotent_poll_is_retried(mp4):
    c, s = client({
        ("POST", "/IG1/media_publish"): [Resp(200, {"id": "M"})],
        ("POST", "/IG1/media"): [Resp(200, {"id": "C4"})],
        ("POST", "rupload.facebook.com"): [Resp(200, {"success": True})],
        ("GET", "/C4"): [Resp(502, None), Resp(200, {"status_code": "FINISHED"})],
    })
    assert c.post_instagram_reel(mp4, "cap") == "M"


def test_auth_error_surfaces_message(jpg):
    c, _ = client({("POST", "/PAGE1/photos"): [Resp(400, {"error": {"message": "Error validating access token", "code": 190}})]})
    with pytest.raises(MetaAPIError, match="access token") as e:
        c.post_facebook_photo(jpg, "cap")
    assert e.value.code == 190 and not e.value.transient


def test_container_poll_timeout(mp4):
    c, _ = client({
        ("POST", "/IG1/media"): [Resp(200, {"id": "C5"})],
        ("POST", "rupload.facebook.com"): [Resp(200, {})],
        ("GET", "/C5"): [Resp(200, {"status_code": "IN_PROGRESS"})] * 50,
    }, poll_timeout=0)
    with pytest.raises(MetaAPIError, match="not ready"):
        c.post_instagram_reel(mp4, "cap")
