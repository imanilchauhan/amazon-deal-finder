"""Post to X through Buffer's free plan (GraphQL API, personal API key).

Why: X's own API bills $0.20 per post that contains a link. Buffer's free plan
(3 channels, 10 queued posts per channel) includes a personal API key, and Buffer
publishes to X on our behalf at no cost.

Docs: https://developers.buffer.com  (endpoint https://api.buffer.com, Bearer API key)
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone

from .captions import build_tweet
from .models import Deal

log = logging.getLogger(__name__)

API_URL = "https://api.buffer.com"


class BufferError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def _gql_str(value: str) -> str:
    """GraphQL string literals use the same escaping as JSON strings."""
    return json.dumps(value, ensure_ascii=False)


def build_create_post_mutation(text: str, channel_id: str, due_at: str, image_url: str | None) -> str:
    assets = f", assets: [{{ image: {{ url: {_gql_str(image_url)} }} }}]" if image_url else ""
    return (
        "mutation CreateDealPost { createPost(input: { "
        f"text: {_gql_str(text)}, channelId: {_gql_str(channel_id)}, "
        f"schedulingType: automatic, mode: customScheduled, dueAt: {_gql_str(due_at)}{assets} "
        "}) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }"
    )


class BufferPoster:
    """Same interface as twitter.XPoster: post(deal) -> post id.

    One class serves every Buffer channel; only the channel id and the text builder
    differ (build_tweet for X, build_facebook_post for a Facebook Page)."""

    def __init__(self, api_key: str, channel_id: str, session=None, *, max_retries: int = 2,
                 sleep=time.sleep, clock=lambda: datetime.now(timezone.utc), delay_minutes: int = 2,
                 attach_image: bool = True, text_builder=build_tweet):
        import requests

        self._key = api_key
        self._channel = channel_id
        self._http = session or requests.Session()
        self._max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._delay = delay_minutes
        self._attach_image = attach_image
        self._text = text_builder

    @classmethod
    def from_config(cls, cfg) -> "BufferPoster":
        return cls(cfg.buffer_api_key, cfg.buffer_channel_id)

    def post(self, deal: Deal) -> str:
        due = (self._clock() + timedelta(minutes=self._delay)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        query = build_create_post_mutation(
            self._text(deal), self._channel, due, deal.image_url if self._attach_image else None
        )
        body = self._call(query)
        result = (body.get("data") or {}).get("createPost") or {}
        if result.get("message"):
            # MutationError, e.g. queue full on the free plan (10 scheduled posts per channel)
            raise BufferError(f"Buffer rejected the post: {result['message']}")
        post = result.get("post") or {}
        if not post.get("id"):
            raise BufferError(f"unexpected Buffer response: {json.dumps(body)[:300]}")
        return str(post["id"])

    def _call(self, query: str) -> dict:
        attempt = 0
        while True:
            try:
                resp = self._http.post(
                    API_URL,
                    json={"query": query},
                    headers={"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"},
                    timeout=30,
                )
            except Exception as exc:  # noqa: BLE001
                err = BufferError(f"network error calling Buffer: {exc}", retryable=True)
            else:
                if resp.status_code == 401:
                    raise BufferError("Buffer API key invalid or revoked", status=401)
                if resp.status_code == 429 or resp.status_code >= 500:
                    err = BufferError(f"Buffer HTTP {resp.status_code}", status=resp.status_code, retryable=True)
                else:
                    try:
                        body = resp.json()
                    except ValueError as exc:
                        raise BufferError(f"Buffer returned non-JSON (HTTP {resp.status_code})") from exc
                    if body.get("errors"):
                        msgs = "; ".join(e.get("message", "?") for e in body["errors"])
                        raise BufferError(f"Buffer GraphQL error: {msgs}", status=resp.status_code)
                    if resp.status_code >= 400:
                        raise BufferError(f"Buffer HTTP {resp.status_code}", status=resp.status_code)
                    return body
            if attempt >= self._max_retries:
                raise err
            attempt += 1
            wait = 2 ** attempt * 2
            log.warning("%s — retry %d in %ss", err, attempt, wait)
            self._sleep(wait)
