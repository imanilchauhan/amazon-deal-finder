from types import SimpleNamespace

import pytest

from deal_finder.captions import build_meta_caption, build_tweet, money, x_weighted_length
from deal_finder.twitter import XPostError, XPoster
from tests.conftest import make_deal


class FakeHTTPError(Exception):
    def __init__(self, status, msg="error", headers=None):
        super().__init__(msg)
        self.response = SimpleNamespace(status_code=status, headers=headers or {})


class FakeClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def create_tweet(self, **kwargs):
        self.calls.append(kwargs)
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(data={"id": out})


def test_money_formats():
    assert money(1299, "INR") == "₹1,299"
    assert money(129999, "INR") == "₹1,29,999"
    assert money(1234567.5, "INR") == "₹12,34,567.50"
    assert money(1299.99, "USD") == "$1,299.99"


def test_tweet_has_disclosure_price_savings_and_link():
    d = make_deal()
    text = build_tweet(d)
    assert text.startswith("🔥 46% OFF: ")
    assert "#Ad" in text
    assert "₹1,299 (was ₹2,399)" in text
    assert "save ₹1,100" in text
    assert d.url in text
    assert x_weighted_length(text, [d.url]) <= 280


def test_long_titles_are_truncated_to_fit():
    d = make_deal(title="Ultra Premium " * 40)
    text = build_tweet(d)
    assert x_weighted_length(text, [d.url]) <= 280
    assert d.url in text and "#Ad" in text


def test_url_counts_as_23():
    assert x_weighted_length("abc https://x.com/very/long/path", ["https://x.com/very/long/path"]) == 4 + 23


def test_meta_caption_asks_for_keyword_and_has_no_link():
    d = make_deal()
    cap = build_meta_caption(d, "DEAL", platform="instagram")
    assert 'Comment "DEAL"' in cap
    assert "#ad" in cap and "Amazon Associate" in cap
    assert d.url not in cap
    assert len(cap) <= 2200


def test_post_success():
    client = FakeClient(["1850000000000000001"])
    assert XPoster(client).post(make_deal()) == "1850000000000000001"
    assert "#Ad" in client.calls[0]["text"]


def test_retries_429_then_succeeds():
    sleeps = []
    client = FakeClient([FakeHTTPError(429), FakeHTTPError(503), "42"])
    assert XPoster(client, sleep=sleeps.append).post(make_deal()) == "42"
    assert len(client.calls) == 3 and len(sleeps) == 2


def test_gives_up_after_max_retries():
    client = FakeClient([FakeHTTPError(429)] * 3)
    with pytest.raises(XPostError) as e:
        XPoster(client, max_retries=2, sleep=lambda s: None).post(make_deal())
    assert e.value.retryable and e.value.status == 429


@pytest.mark.parametrize(
    "status,msg,expected",
    [
        (402, "Payment Required", "credits exhausted"),
        (401, "Unauthorized", "credentials"),
        (403, "You are not allowed to create a Tweet with duplicate content.", "duplicate"),
        (400, "Bad Request", "X API error"),
    ],
)
def test_non_retryable_errors(status, msg, expected):
    client = FakeClient([FakeHTTPError(status, msg)])
    with pytest.raises(XPostError, match=expected):
        XPoster(client, sleep=lambda s: None).post(make_deal())
    assert len(client.calls) == 1


def test_unexpected_response_shape():
    class Weird:
        def create_tweet(self, **kw):
            return SimpleNamespace(data=None)

    with pytest.raises(XPostError, match="unexpected"):
        XPoster(Weird()).post(make_deal())
