"""Branded 1080x1350 deal card for Instagram, drawn with Pillow.

Same design as the admin's in-browser card (web/src/lib/socialshare.ts renderDealCard),
so automatic and hand-made posts look alike. Fonts: Inter (SIL OFL), bundled in ./fonts.
"""
from __future__ import annotations

import io
import re
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .captions import money, short_title
from .models import Deal

W, H = 1080, 1350
FONTS = Path(__file__).with_name("fonts")

BG = "#faf8f6"
INK = "#16181d"
MUTED = "#5b6170"
LINE = "#e7e2de"
BRAND = "#e5484d"
GOOD = "#137a3e"
GOOD_SOFT = "#e7f4ec"
FOOT_MUTED = "#a3a9b6"

WEIGHTS = {500: "Inter-Medium.ttf", 600: "Inter-SemiBold.ttf", 700: "Inter-Bold.ttf",
           800: "Inter-ExtraBold.ttf", 900: "Inter-Black.ttf"}


@lru_cache(maxsize=None)
def font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / WEIGHTS[weight]), size)


def wrap_lines(measure, text: str, width: float, max_lines: int) -> list[str]:
    """At most `max_lines` lines that fit `width`; the last ends with an ellipsis if cut."""
    words = text.split()
    lines: list[str] = []
    line = ""
    for w in words:
        nxt = f"{line} {w}" if line else w
        if measure(nxt) <= width:
            line = nxt
            continue
        if line:
            lines.append(line)
        line = w
        if len(lines) == max_lines:
            break
    if line and len(lines) < max_lines:
        lines.append(line)
    used = len(" ".join(lines).split())
    if used < len(words) and lines:
        last = lines[-1]
        while last and measure(f"{last}…") > width:
            last = re.sub(r"\s*\S+$", "", last)
        lines[-1] = f"{last}…"
    return lines


def render_card(deal: Deal, product: Image.Image, brand: str = "", label: str = "TODAY'S DEAL",
                accent: str | None = None) -> Image.Image:
    """`label`/`accent` come from the post theme (captions.THEMES): e.g. a blue WINTER DEAL
    pill and badge, a pink FOR HER one, or the default red TODAY'S DEAL."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    hot = accent or BRAND

    # brand row: red dot + wordmark, and the theme pill on the right
    d.ellipse((75 - 11, 84 - 11, 75 + 11, 84 + 11), fill=BRAND)
    d.text((100, 86), "CartCrush", font=font(800, 40), fill=INK, anchor="lm")
    pill = label.upper()
    pf = font(800, 24)
    pw = d.textlength(pill, font=pf) + 48
    if accent:
        d.rounded_rectangle((W - 64 - pw, 60, W - 64, 112), radius=26, fill=accent)
        d.text((W - 64 - pw + 24, 87), pill, font=pf, fill="#ffffff", anchor="lm")
    else:
        d.rounded_rectangle((W - 64 - pw, 60, W - 64, 112), radius=26, fill="#ffffff", outline=LINE, width=2)
        d.text((W - 64 - pw + 24, 87), pill, font=pf, fill=MUTED, anchor="lm")

    # product panel
    d.rounded_rectangle((64, 150, 64 + 952, 150 + 640), radius=40, fill="#ffffff", outline=LINE, width=2)
    prod = product.convert("RGBA")
    scale = min(780 / prod.width, 560 / prod.height)
    pw_, ph_ = max(1, round(prod.width * scale)), max(1, round(prod.height * scale))
    prod = prod.resize((pw_, ph_), Image.LANCZOS)
    img.paste(prod, (64 + (952 - pw_) // 2, 150 + (640 - ph_) // 2), prod)

    # discount badge: red circle tilted -8 degrees
    k = 3  # draw large, rotate, then scale down for smooth edges
    badge = Image.new("RGBA", (260 * k, 260 * k), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.ellipse((12 * k, 12 * k, 248 * k, 248 * k), fill=hot)
    bd.text((130 * k, 116 * k), f"{deal.discount_pct}%", font=font(900, 92 * k), fill="#ffffff", anchor="mm")
    bd.text((130 * k, 182 * k), "OFF", font=font(800, 34 * k), fill="#ffffff", anchor="mm")
    badge = badge.rotate(8, resample=Image.BICUBIC).resize((260, 260), Image.LANCZOS)  # PIL turns counter-clockwise
    img.paste(badge, (W - 158 - 130, 294 - 130), badge)

    # brand + title
    y = 850
    if brand:
        d.text((64, y), brand, font=font(600, 30), fill=MUTED, anchor="lm")
        y += 50
    tf = font(700, 50)
    for line in wrap_lines(lambda s: d.textlength(s, font=tf), short_title(deal.title, 90), 952, 2):
        d.text((64, y), line, font=tf, fill=INK, anchor="lm")
        y += 60

    # price row (alphabetic baseline at 1150)
    cur = deal.currency
    price = money(deal.price, cur)
    prf = font(900, 120)
    d.text((64, 1150), price, font=prf, fill=INK, anchor="ls")
    px = 64 + d.textlength(price, font=prf) + 28
    mrp = f"MRP {money(deal.original_price, cur)}"
    mf = font(500, 38)
    d.text((px, 1150), mrp, font=mf, fill=MUTED, anchor="ls")
    d.rectangle((px, 1137, px + d.textlength(mrp, font=mf), 1139), fill=MUTED)

    save = f"Save {money(deal.savings, cur)}"
    sf = font(800, 30)
    sw = d.textlength(save, font=sf) + 44
    d.rounded_rectangle((W - 64 - sw, 1094, W - 64, 1156), radius=16, fill=GOOD_SOFT)
    d.text((W - 64 - sw + 22, 1136), save, font=sf, fill=GOOD, anchor="ls")

    # footer
    d.rectangle((0, H - 150, W, H), fill=INK)
    d.text((64, H - 82), "Link in bio → cartcrush.pages.dev", font=font(800, 38), fill="#ffffff", anchor="ls")
    d.text((64, H - 40), "#ad · Price when posted; Amazon prices change fast.", font=font(500, 22),
           fill=FOOT_MUTED, anchor="ls")
    return img


def card_jpeg(deal: Deal, product: Image.Image, brand: str = "", quality: int = 88, *,
              label: str = "TODAY'S DEAL", accent: str | None = None) -> bytes:
    buf = io.BytesIO()
    render_card(deal, product, brand, label, accent).save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def fetch_product_image(url: str, session=None, timeout: int = 20) -> Image.Image:
    import requests

    resp = (session or requests).get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGBA")
