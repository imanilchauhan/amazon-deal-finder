"""Post to Facebook and Instagram through Zernio's free plan (REST API, Bearer API key).

Why: Zernio's free plan covers 2 connected accounts with unlimited posts and full API
access, so it carries Facebook + Instagram while Buffer keeps X (X through Zernio is
billed per post). Buffer stays as the automatic backup for both (see FallbackPoster).

Docs: https://docs.zernio.com  (POST https://zernio.com/api/v1/posts)
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone

from .models import Deal

log = logging.getLogger(__name__)

API_URL = "https://zernio.com/api/v1"


class ZernioError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


class ZernioPoster:
    """Same interface as buffer.BufferPoster: post(deal, due_at, image_url=) and post_text()."""

    def __init__(self, api_key: str, platform: str, account_id: str, *, text_builder, session=None,
                 attach_image: bool = True, max_retries: int = 2, sleep=time.sleep,
                 clock=lambda: datetime.now(timezone.utc), delay_minutes: int = 2):
        import requests

        if platform not in {"facebook", "instagram"}:
            raise ValueError(platform)
        self._key = api_key
        self._platform = platform
        self._account = account_id
        self._text = text_builder
        self._http = session or requests.Session()
        self._attach_image = attach_image
        self._max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._delay = delay_minutes

    def post(self, deal: Deal, due_at: datetime | None = None, *, image_url: str | None = None) -> str:
        image = image_url or (deal.image_url if self._attach_image else None)
        if self._platform == "instagram" and not image:
            raise ZernioError("Instagram posts need an image")
        return self._create(self._text(deal), due_at, image)

    def post_text(self, text: str, due_at: datetime | None = None, image_url: str | None = None) -> str:
        if self._platform == "instagram" and not image_url:
            raise ZernioError("Instagram can't take a text-only post")
        return self._create(text, due_at, image_url)

    def post_video(self, text: str, due_at: datetime | None, video_url: str, *, title: str = "") -> str:
        """Schedule a Reel: a single video on Instagram publishes as a Reel; Facebook needs
        platformSpecificData.contentType = "reel" (9:16, 3–60 s)."""
        extra: dict = {}
        if self._platform == "facebook":
            extra = {"contentType": "reel", **({"title": title[:100]} if title else {})}
        return self._create(text, due_at, None, video_url=video_url, platform_data=extra)

    def _create(self, text: str, due_at: datetime | None, image_url: str | None, *,
                video_url: str | None = None, platform_data: dict | None = None) -> str:
        when = due_at if due_at is not None else self._clock() + timedelta(minutes=self._delay)
        target: dict = {"platform": self._platform, "accountId": self._account}
        if platform_data:
            target["platformSpecificData"] = platform_data
        body: dict = {
            "content": text,
            "platforms": [target],
            "scheduledFor": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "timezone": "UTC",
        }
        if video_url:
            body["mediaItems"] = [{"type": "video", "url": video_url}]
        elif image_url:
            body["mediaItems"] = [{"type": "image", "url": image_url}]
        data = self._call("POST", "/posts", body)
        post = data.get("post") or {}
        if not post.get("_id"):
            raise ZernioError(f"unexpected Zernio response: {json.dumps(data)[:300]}")
        return str(post["_id"])

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        attempt = 0
        while True:
            try:
                resp = self._http.request(method, API_URL + path, json=body, timeout=30, headers={
                    "Authorization": f"Bearer {self._key}", "Content-Type": "application/json"})
            except Exception as exc:  # noqa: BLE001
                err = ZernioError(f"network error calling Zernio: {exc}", retryable=True)
            else:
                if resp.status_code in (401, 403):
                    raise ZernioError(f"Zernio API key rejected (HTTP {resp.status_code})", status=resp.status_code)
                if resp.status_code == 429 or resp.status_code >= 500:
                    err = ZernioError(f"Zernio HTTP {resp.status_code}", status=resp.status_code, retryable=True)
                else:
                    try:
                        data = resp.json()
                    except ValueError as exc:
                        raise ZernioError(f"Zernio returned non-JSON (HTTP {resp.status_code})") from exc
                    if resp.status_code >= 400:
                        msg = data.get("error") or data.get("message") or json.dumps(data)[:200]
                        raise ZernioError(f"Zernio rejected the post: {msg}", status=resp.status_code)
                    return data
            if attempt >= self._max_retries:
                raise err
            attempt += 1
            wait = 2 ** attempt * 2
            log.warning("%s — retry %d in %ss", err, attempt, wait)
            self._sleep(wait)


class FallbackPoster:
    """Try each provider in order; the first that accepts the post wins.

    The returned id is prefixed with the provider name (e.g. "zernio:65f1…") except for
    Buffer, whose ids stay bare so older Firestore records keep the same shape."""

    def __init__(self, providers: list[tuple[str, object]], channel: str):
        if not providers:
            raise ValueError("need at least one provider")
        self._providers = providers
        self._channel = channel

    @property
    def wants_doc(self) -> bool:
        return any(getattr(p, "wants_doc", False) for _, p in self._providers)

    def post(self, deal: Deal, due_at: datetime | None = None, *, image_url: str | None = None,
             doc: dict | None = None) -> str:
        def send(p):
            kw = {"image_url": image_url} if image_url else {}
            if getattr(p, "wants_doc", False):
                kw["doc"] = doc
            return p.post(deal, due_at=due_at, **kw)
        return self._try(send)

    def post_text(self, text: str, due_at: datetime | None = None, image_url: str | None = None) -> str:
        kw = {"image_url": image_url} if image_url else {}
        return self._try(lambda p: p.post_text(text, due_at=due_at, **kw))

    def _try(self, send) -> str:
        errors = []
        for name, poster in self._providers:
            try:
                post_id = send(poster)
            except Exception as exc:  # noqa: BLE001 - fall through to the next provider
                log.warning("%s via %s failed: %s", self._channel, name, exc)
                errors.append(f"{name}: {exc}")
                continue
            if len(errors):
                log.info("%s posted via backup %s", self._channel, name)
            return post_id if name == "buffer" else f"{name}:{post_id}"
        raise RuntimeError(f"{self._channel}: every provider failed ({'; '.join(errors)})")


def list_accounts(api_key: str, session=None) -> list[dict]:
    """Connected social accounts: [{id, platform, name}] — used to fill ZERNIO_*_ACCOUNT_ID."""
    import requests

    resp = (session or requests).get(f"{API_URL}/accounts", timeout=30,
                                     headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise ZernioError(f"Zernio HTTP {resp.status_code}", status=resp.status_code)
    data = resp.json()
    items = data.get("accounts", data) if isinstance(data, dict) else data
    return [{"id": a.get("_id") or a.get("id"), "platform": a.get("platform"),
             "name": a.get("username") or a.get("displayName") or a.get("name"),
             "active": a.get("isActive", a.get("status"))} for a in items or []]


if __name__ == "__main__":  # python -m deal_finder.zernio  -> prints the env lines to add
    import os
    import sys

    key = os.environ.get("ZERNIO_API_KEY", "")
    if not key:
        sys.exit("set ZERNIO_API_KEY first (backend/.env)")
    for acc in list_accounts(key):
        print(f"{acc['platform']:<10} {acc['name']!s:<24} id={acc['id']} active={acc['active']}")
        if acc["platform"] in ("facebook", "instagram"):
            print(f"  -> ZERNIO_{'FB' if acc['platform'] == 'facebook' else 'IG'}_ACCOUNT_ID={acc['id']}")
