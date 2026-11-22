from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from deal_finder.buffer import API_URL, BufferError, BufferPoster, build_create_post_mutation
from tests.conftest import make_deal

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


class Resp:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def post(self, url, **kw):
        self.calls.append(SimpleNamespace(url=url, **kw))
        out = self.responses.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


def ok(post_id="buf_123"):
    return Resp(200, {"data": {"createPost": {"post": {"id": post_id, "dueAt": "2026-11-05T12:02:00.000Z"}}}})


def poster(responses, **kw):
    s = FakeSession(responses)
    return BufferPoster("KEY", "CHAN1", session=s, sleep=lambda x: None, clock=lambda: NOW, **kw), s


def test_posts_tweet_text_with_link_image_and_schedule():
    p, s = poster([ok()])
    d = make_deal()
    assert p.post(d) == "buf_123"
    call = s.calls[0]
    assert call.url == API_URL == "https://api.buffer.com"
    assert call.headers["Authorization"] == "Bearer KEY"
    q = call.json["query"]
    assert 'channelId: "CHAN1"' in q
    assert "mode: customScheduled" in q and "schedulingType: automatic" in q
    assert 'dueAt: "2026-11-05T12:02:00.000Z"' in q
    assert d.url in q and "#Ad" in q
    assert f'image: {{ url: "{d.image_url}" }}' in q


def test_text_is_safely_escaped():
    q = build_create_post_mutation('He said "hi"\n} mutation evil {', "C", "2026-01-01T00:00:00.000Z", None)
    assert '\\"hi\\"\\n} mutation evil {' in q   # stays inside one string literal
    assert "assets" not in q


def test_mutation_error_is_raised():
    p, _ = poster([Resp(200, {"data": {"createPost": {"message": "Queue limit reached"}}})])
    with pytest.raises(BufferError, match="Queue limit"):
        p.post(make_deal())


def test_graphql_errors_raised():
    p, _ = poster([Resp(200, {"errors": [{"message": "Unknown argument dueAt"}]})])
    with pytest.raises(BufferError, match="Unknown argument"):
        p.post(make_deal())


def test_bad_key_not_retried():
    p, s = poster([Resp(401, {})])
    with pytest.raises(BufferError, match="invalid or revoked"):
        p.post(make_deal())
    assert len(s.calls) == 1


def test_rate_limit_and_5xx_retried():
    p, s = poster([Resp(429, {}), Resp(502, None), ok("b9")])
    assert p.post(make_deal()) == "b9"
    assert len(s.calls) == 3


def test_gives_up_after_retries():
    p, s = poster([Resp(503, None)] * 3)
    with pytest.raises(BufferError) as e:
        p.post(make_deal())
    assert e.value.retryable and len(s.calls) == 3


def test_unexpected_shape():
    p, _ = poster([Resp(200, {"data": {"createPost": {}}})])
    with pytest.raises(BufferError, match="unexpected"):
        p.post(make_deal())


def test_custom_text_builder_for_facebook_channel():
    from deal_finder.buffer import FACEBOOK_METADATA
    from deal_finder.captions import build_facebook_post

    s = FakeSession([ok("fb_1")])
    p = BufferPoster("KEY", "FBCHAN", session=s, sleep=lambda x: None, clock=lambda: NOW,
                     text_builder=build_facebook_post, metadata=FACEBOOK_METADATA)
    assert p.post(make_deal()) == "fb_1"
    q = s.calls[0].json["query"]
    assert 'channelId: "FBCHAN"' in q and "Get it here" in q
    assert "metadata: { facebook: { type: post } }" in q


def test_x_posts_carry_no_metadata():
    s = FakeSession([ok("x_1")])
    BufferPoster("KEY", "XCHAN", session=s, sleep=lambda x: None, clock=lambda: NOW).post(make_deal())
    assert "metadata" not in s.calls[0].json["query"]


def test_post_at_a_given_slot_time():
    from datetime import datetime, timezone
    s = FakeSession([ok("x_9")])
    slot = datetime(2026, 11, 13, 7, 30, tzinfo=timezone.utc)
    BufferPoster("KEY", "XCHAN", session=s, sleep=lambda x: None, clock=lambda: NOW).post(make_deal(), due_at=slot)
    assert 'dueAt: "2026-11-13T07:30:00.000Z"' in s.calls[0].json["query"]
