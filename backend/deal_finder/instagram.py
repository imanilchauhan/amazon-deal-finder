"""Instagram posts through Buffer: render the branded deal card, host it, schedule the post.

Instagram needs an image and Buffer only takes images by public URL, so each post
1. draws the card (cardart.render_card) from the Amazon product photo,
2. uploads the JPEG to the cartcrush-cards Worker (cards/), which serves it publicly,
3. schedules a Buffer post on the Instagram channel with that image and the IG caption.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from . import cardart
from .buffer import INSTAGRAM_METADATA, BufferError, BufferPoster
from .captions import build_instagram_post
from .models import Deal

log = logging.getLogger(__name__)


class CardUploadError(RuntimeError):
    pass


class CardUploader:
    def __init__(self, base_url: str, secret: str, session=None, timeout: int = 30):
        import requests

        self._base = base_url.rstrip("/")
        self._secret = secret
        self._http = session or requests.Session()
        self._timeout = timeout

    def upload(self, name: str, jpeg: bytes) -> str:
        url = f"{self._base}/c/{name}.jpg"
        try:
            resp = self._http.put(url, data=jpeg, timeout=self._timeout, headers={
                "Authorization": f"Bearer {self._secret}", "Content-Type": "image/jpeg"})
        except Exception as exc:  # noqa: BLE001
            raise CardUploadError(f"card upload failed: {exc}") from exc
        if resp.status_code != 201:
            raise CardUploadError(f"card upload failed: HTTP {resp.status_code} {resp.text[:120]}")
        return resp.json().get("url") or url


class InstagramPoster:
    """Same interface as BufferPoster.post, plus the Firestore doc for brand and category."""

    wants_doc = True

    def __init__(self, buffer: BufferPoster, uploader: CardUploader, *, fetch_image=cardart.fetch_product_image,
                 clock=lambda: datetime.now(timezone.utc)):
        self._buffer = buffer
        self._uploader = uploader
        self._fetch = fetch_image
        self._clock = clock

    def post(self, deal: Deal, due_at: datetime | None = None, doc: dict | None = None) -> str:
        doc = doc or {}
        try:
            product = self._fetch(deal.image_url)
        except Exception as exc:  # noqa: BLE001
            raise BufferError(f"could not download the product image: {exc}") from exc
        jpeg = cardart.card_jpeg(deal, product, brand=str(doc.get("brand") or ""))
        stamp = (due_at or self._clock()).astimezone(timezone.utc).strftime("%Y%m%d%H%M")
        image_url = self._uploader.upload(f"{deal.asin}-{stamp}", jpeg)
        log.info("instagram card for %s at %s", deal.asin, image_url)
        return self._buffer.post(deal, due_at=due_at, image_url=image_url)


def instagram_caption_builder(deal: Deal) -> str:
    return build_instagram_post(deal)


def build_instagram_poster(api_key: str, channel_id: str, cards_url: str, cards_secret: str) -> InstagramPoster:
    buffer = BufferPoster(api_key, channel_id, text_builder=instagram_caption_builder, metadata=INSTAGRAM_METADATA)
    return InstagramPoster(buffer, CardUploader(cards_url, cards_secret))
