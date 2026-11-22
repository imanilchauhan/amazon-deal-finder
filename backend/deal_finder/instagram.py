"""Instagram posts: render the branded deal card, host it, schedule the post.

Instagram needs an image and Buffer only takes images by public URL, so each post
1. draws the card (cardart.render_card) from the Amazon product photo,
2. uploads the JPEG to the cartcrush-cards Worker (cards/), which serves it publicly,
3. schedules the post with that image and the IG caption: through Zernio when it is
   configured, with Buffer as the automatic backup (zernio.FallbackPoster), else Buffer alone.
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
    """Deal card poster (Instagram, and Facebook too): draws the themed card, hosts it and
    schedules it with the caption. Same interface as BufferPoster.post, plus the Firestore doc
    (brand, department, gender, source) which decides the theme: winter / for her / trending."""

    wants_doc = True

    def __init__(self, buffer, uploader: CardUploader, *, fetch_image=cardart.fetch_product_image,
                 clock=lambda: datetime.now(timezone.utc), caption=None, platform: str = "instagram"):
        self._buffer = buffer          # whatever schedules the post: Buffer, Zernio or a FallbackPoster
        self._uploader = uploader
        self._fetch = fetch_image
        self._clock = clock
        self._caption = caption        # caption(deal, theme=, department=) -> text; None = sender's own
        self._platform = platform

    def post(self, deal: Deal, due_at: datetime | None = None, doc: dict | None = None) -> str:
        from .captions import THEMES
        from .picker import theme as pick_theme

        doc = {"title": deal.title, **(doc or {})}
        when = due_at or self._clock()
        th = pick_theme(doc, when)
        try:
            product = self._fetch(deal.image_url)
        except Exception as exc:  # noqa: BLE001
            raise BufferError(f"could not download the product image: {exc}") from exc
        style = THEMES.get(th, THEMES[""])
        jpeg = cardart.card_jpeg(deal, product, brand=str(doc.get("brand") or ""),
                                 label=style["pill"], accent=style["accent"], platform=self._platform)
        stamp = when.astimezone(timezone.utc).strftime("%Y%m%d%H%M")
        name = f"{deal.asin}-{stamp}" if self._platform == "instagram" else f"{deal.asin}-{stamp}-{self._platform}"
        image_url = self._uploader.upload(name, jpeg)
        log.info("%s card (%s) for %s at %s", self._platform, th or "default", deal.asin, image_url)
        if self._caption is None:
            return self._buffer.post(deal, due_at=due_at, image_url=image_url)
        text = self._caption(deal, theme=th, department=str(doc.get("department") or ""))
        return self._buffer.post_text(text, due_at=due_at, image_url=image_url)

    def post_text(self, text: str, due_at: datetime | None = None, image_url: str | None = None) -> str:
        """Plain posts (e.g. the weekly collection link on Facebook) go straight to the sender."""
        return self._buffer.post_text(text, due_at=due_at, **({"image_url": image_url} if image_url else {}))


CardPoster = InstagramPoster


def instagram_caption_builder(deal: Deal) -> str:
    return build_instagram_post(deal)


def build_instagram_poster(api_key: str, channel_id: str, cards_url: str, cards_secret: str, *,
                           zernio_key: str = "", zernio_account: str = "") -> InstagramPoster:
    """`buffer` below is whatever schedules the finished card: Buffer alone, or Zernio first
    with Buffer as backup when a Zernio key and Instagram account id are configured."""
    sender = None
    if api_key and channel_id:
        sender = BufferPoster(api_key, channel_id, text_builder=instagram_caption_builder,
                              metadata=INSTAGRAM_METADATA)
    if zernio_key and zernio_account:
        from .zernio import FallbackPoster, ZernioPoster

        providers = [("zernio", ZernioPoster(zernio_key, "instagram", zernio_account,
                                             text_builder=instagram_caption_builder))]
        if sender is not None:
            providers.append(("buffer", sender))
        sender = FallbackPoster(providers, "instagram")
    if sender is None:
        raise ValueError("Instagram needs Buffer (key + channel) or Zernio (key + account)")
    return InstagramPoster(sender, CardUploader(cards_url, cards_secret), caption=build_instagram_post)
