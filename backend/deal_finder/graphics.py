"""Render deal graphics (Pillow) and short vertical videos (ffmpeg) for FB/IG."""
from __future__ import annotations

import io
import logging
import shutil
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .captions import money
from .models import Deal

log = logging.getLogger(__name__)

FEED_SIZE = (1080, 1350)   # 4:5, the tallest ratio IG feed accepts
REEL_SIZE = (1080, 1920)   # 9:16

BG = (17, 24, 39)
CARD = (255, 255, 255)
ACCENT = (255, 153, 0)      # orange
TEXT = (17, 24, 39)
MUTED = (107, 114, 128)
BADGE = (220, 38, 38)

FONT_CANDIDATES = {
    True: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    False: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[bold]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def download_image(url: str, session=None, timeout: int = 20) -> Image.Image:
    import requests

    s = session or requests
    resp = s.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def render_card(deal: Deal, product: Image.Image, size: tuple[int, int], keyword: str) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)
    pad = 60

    # header
    d.text((pad, pad), "DEAL ALERT", font=_font(54, True), fill=ACCENT)
    d.text((pad, pad + 70), "Amazon " + ("India" if deal.marketplace == "in" else "US"), font=_font(32), fill=(209, 213, 219))

    # white product panel
    panel_top = pad + 140
    panel_h = int(h * (0.46 if h > 1500 else 0.38))
    d.rounded_rectangle([pad, panel_top, w - pad, panel_top + panel_h], radius=36, fill=CARD)
    inner = product.copy()
    inner.thumbnail((w - 2 * pad - 80, panel_h - 80))
    img.paste(inner, ((w - inner.width) // 2, panel_top + (panel_h - inner.height) // 2))

    # discount badge
    badge = f"-{deal.discount_pct}%"
    bf = _font(64, True)
    bw = d.textlength(badge, font=bf) + 60
    d.rounded_rectangle([w - pad - bw, panel_top - 30, w - pad, panel_top + 70], radius=28, fill=BADGE)
    d.text((w - pad - bw + 30, panel_top - 22), badge, font=bf, fill=(255, 255, 255))

    # title
    y = panel_top + panel_h + 40
    tf = _font(40, True)
    lines = textwrap.wrap(deal.title, width=40)
    if len(lines) > 2:
        lines = [lines[0], lines[1][:38].rstrip() + "…"]
    for line in lines:
        d.text((pad, y), line, font=tf, fill=(255, 255, 255))
        y += 52

    # prices
    y += 20
    pf = _font(96, True)
    price = money(deal.price, deal.currency)
    d.text((pad, y), price, font=pf, fill=ACCENT)
    px = pad + d.textlength(price, font=pf) + 30
    of = _font(44)
    old = money(deal.original_price, deal.currency)
    oy = y + 40
    d.text((px, oy), old, font=of, fill=(156, 163, 175))
    ow = d.textlength(old, font=of)
    d.line([px, oy + 26, px + ow, oy + 26], fill=(156, 163, 175), width=4)
    y += 120
    d.text((pad, y), f"You save {money(deal.savings, deal.currency)}", font=_font(40), fill=(134, 239, 172))
    d.text((pad, y + 60), "#ad · Prices may change", font=_font(28), fill=MUTED)

    # call to action
    cta = f'Comment "{keyword}" for the link'
    cf = _font(46, True)
    cta_h = 110
    # Reels: keep the CTA out of the bottom ~20% that IG covers with caption/UI.
    cta_top = y + 140 if h > 1500 else h - pad - cta_h
    d.rounded_rectangle([pad, cta_top, w - pad, cta_top + cta_h], radius=30, fill=ACCENT)
    cw = d.textlength(cta, font=cf)
    d.text(((w - cw) / 2, cta_top + 28), cta, font=cf, fill=TEXT)
    return img


def save_feed_jpeg(card: Image.Image, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    card.save(path, "JPEG", quality=90, optimize=True)  # IG image posts must be JPEG
    return path


def make_reel(card_png: Path, out_mp4: Path, seconds: int = 7) -> Path:
    """Slow zoom over the card + silent AAC track (IG Reels expects an audio stream)."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found on PATH")
    fps = 30
    frames = seconds * fps
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-loop", "1", "-i", str(card_png),
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf", (
            f"scale=2160:-2,zoompan=z='min(zoom+0.0006,1.06)':d={frames}"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={REEL_SIZE[0]}x{REEL_SIZE[1]}:fps={fps}"
        ),
        "-t", str(seconds),
        "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
        str(out_mp4),
    ]
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, check=True, timeout=180)
    return out_mp4


def render_media(deal: Deal, product: Image.Image, out_dir: Path, keyword: str, *, want_video: bool) -> dict:
    """Returns {'feed_jpg': Path, 'reel_mp4': Path | None}."""
    out_dir.mkdir(parents=True, exist_ok=True)
    feed = save_feed_jpeg(render_card(deal, product, FEED_SIZE, keyword), out_dir / f"{deal.asin}_feed.jpg")
    reel = None
    if want_video:
        png = out_dir / f"{deal.asin}_reel.png"
        render_card(deal, product, REEL_SIZE, keyword).save(png, "PNG")
        reel = make_reel(png, out_dir / f"{deal.asin}_reel.mp4")
    return {"feed_jpg": feed, "reel_mp4": reel}
