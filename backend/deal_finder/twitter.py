"""X (Twitter) API v2 posting via tweepy.

COST NOTE: since 6 Feb 2026 X has no free API tier for new developers; posting is
pay-per-use and billed per post (link posts cost more). That is why X is OFF by
default (X_ENABLED=false) and capped by X_MAX_POSTS_PER_RUN.
"""
from __future__ import annotations

import logging
import time

from .captions import build_tweet
from .models import Deal

log = logging.getLogger(__name__)


class XPostError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def _status_of(exc: Exception) -> int | None:
    resp = getattr(exc, "response", None)
    return getattr(resp, "status_code", None) or getattr(resp, "status", None)


class XPoster:
    def __init__(self, client, *, max_retries: int = 2, sleep=time.sleep):
        self._client = client
        self._max_retries = max_retries
        self._sleep = sleep

    @classmethod
    def from_config(cls, cfg) -> "XPoster":
        import tweepy

        client = tweepy.Client(
            consumer_key=cfg.api_key,
            consumer_secret=cfg.api_secret,
            access_token=cfg.access_token,
            access_token_secret=cfg.access_token_secret,
        )
        return cls(client)

    def post(self, deal: Deal) -> str:
        text = build_tweet(deal)
        attempt = 0
        while True:
            try:
                resp = self._client.create_tweet(text=text, user_auth=True)
            except Exception as exc:  # tweepy.errors.* all carry .response
                status = _status_of(exc)
                if status == 429 or (status is not None and status >= 500):
                    if attempt < self._max_retries:
                        wait = self._retry_after(exc, attempt)
                        log.warning("X %s, retrying in %ss", status, wait)
                        self._sleep(wait)
                        attempt += 1
                        continue
                    raise XPostError(f"X API gave up after retries: {exc}", status=status, retryable=True) from exc
                if status == 403 and "duplicate" in str(exc).lower():
                    raise XPostError("duplicate tweet rejected by X", status=403) from exc
                if status == 402:
                    raise XPostError("X API credits exhausted (pay-per-use balance is empty)", status=402) from exc
                if status == 401:
                    raise XPostError("X API credentials invalid/expired", status=401) from exc
                raise XPostError(f"X API error: {exc}", status=status) from exc
            data = getattr(resp, "data", None) or {}
            tweet_id = data.get("id")
            if not tweet_id:
                raise XPostError(f"unexpected X response: {resp!r}")
            return str(tweet_id)

    @staticmethod
    def _retry_after(exc: Exception, attempt: int) -> float:
        headers = getattr(getattr(exc, "response", None), "headers", None) or {}
        reset = headers.get("x-rate-limit-reset")
        if reset:
            try:
                return max(1.0, min(60.0, float(reset) - time.time()))
            except ValueError:
                pass
        return float(2 ** (attempt + 1))
