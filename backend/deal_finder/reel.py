"""Automatic Reels: an 8-second 9:16 deal video, posted to Instagram and Facebook as a Reel.

The animation matches the admin's in-browser video (web/src/lib/dealvideo.ts):
the product card scales in and cycles through the product photos, the discount badge
pops, MRP is struck through while the price counts down to the deal price, then a
"link in bio" call to action. Frames are drawn with Pillow and encoded with ffmpeg
(H.264 + a silent AAC track, which Instagram expects). ffmpeg comes from the
imageio-ffmpeg wheel, so neither the Mac nor the GitHub runner needs a system install.

ReelPoster renders the video, hosts it on the cartcrush-cards Worker and schedules it
through Zernio. If anything in that path fails, it posts the usual photo card instead,
so a slot is never lost.
"""
from __future__ import annotations

import logging
import math
import shutil
import subprocess
from datetime import datetime, timezone

from PIL import Image, ImageDraw

from .captions import money, short_title
from .cardart import font, wrap_lines
from .models import Deal

log = logging.getLogger(__name__)

W, H = 1080, 1920
FPS = 30
MAX_PHOTOS = 5
PAPER = (246, 243, 239)
INK = "#16181d"
MUTED = "#5b6170"
BRAND = "#e5484d"
GOOD = "#137a3e"
GOOD_SOFT = "#e7f4ec"
SITE = "cartcrush.pages.dev"

# Same names as captions.THEMES; soft = the background glow.
STYLES = {
    "winter": {"label": "WINTER STEAL", "accent": "#2563EB", "soft": (220, 231, 247)},
    "her": {"label": "FOR HER", "accent": "#DB2777", "soft": (251, 228, 234)},
    "trending": {"label": "TRENDING NOW", "accent": "#D97706", "soft": (253, 240, 217)},
    "": {"label": "DEAL ALERT", "accent": BRAND, "soft": (253, 232, 232)},
}


class ReelError(RuntimeError):
    pass


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 - fall back to a system ffmpeg
        exe = shutil.which("ffmpeg")
        if not exe:
            raise ReelError("ffmpeg not available (pip install imageio-ffmpeg)") from None
        return exe


def _clamp(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _span(t: float, start: float, length: float) -> float:
    return _clamp((t - start) / length)


def _ease_out(x: float) -> float:
    return 1 - (1 - x) ** 3


def _ease_back(x: float) -> float:
    c = 1.9
    return 0.0 if x <= 0 else 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _background(soft: tuple[int, int, int]) -> Image.Image:
    """Paper with a soft accent glow in the top right (drawn once, reused every frame)."""
    small = Image.new("RGB", (W // 8, H // 8), PAPER)
    px = small.load()
    cx, cy, r = small.width * 0.75, 380 / 8, 900 / 8
    for y in range(small.height):
        for x in range(small.width):
            k = _clamp(1 - math.hypot(x - cx, y - cy) / r)
            px[x, y] = tuple(round(PAPER[i] + (soft[i] - PAPER[i]) * k) for i in range(3))
    return small.resize((W, H), Image.BILINEAR)


def _rounded(size: tuple[int, int], radius: int, fill) -> Image.Image:
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=fill)
    return im


def _fit(photo: Image.Image, box_w: int, box_h: int) -> Image.Image:
    """Photo scaled to fit the box, on white, at 1.08x so the slow zoom can crop into it."""
    p = photo.convert("RGBA")
    s = min(box_w / p.width, box_h / p.height) * 1.08
    return p.resize((max(1, round(p.width * s)), max(1, round(p.height * s))), Image.LANCZOS)


class _Scene:
    CARD_W, CARD_H, CARD_CY = 900, 820, 640

    def __init__(self, deal: Deal, photos: list[Image.Image], brand: str, style: dict, seconds: float):
        if not photos:
            raise ReelError("no product photo")
        self.d = deal
        # Hide the brand line when the title already starts with it (same rule as the card).
        self.brand = "" if brand and deal.title.lower().startswith(brand.lower()) else brand
        self.style = style
        self.accent = _hex(style["accent"])
        self.seconds = seconds
        self.bg = _background(style["soft"])
        self.photos = [_fit(p, 760, 680) for p in photos[:MAX_PHOTOS]]
        self.slides = self.photos + [self.photos[0]] if len(self.photos) > 1 else self.photos
        self.slide_len = (seconds - 0.2) / len(self.slides)
        self.card_mask = _rounded((self.CARD_W, self.CARD_H), 56, (255, 255, 255, 255))
        shadow = Image.new("RGBA", (self.CARD_W + 120, self.CARD_H + 120), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((60, 80, 60 + self.CARD_W, 80 + self.CARD_H), 56,
                                                 fill=(22, 24, 29, 28))
        from PIL import ImageFilter

        self.shadow = shadow.filter(ImageFilter.GaussianBlur(24))
        probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
        f = font(800, 60)
        self.title = wrap_lines(lambda s: probe.textlength(s, font=f), short_title(deal.title, 90), 900, 2)

    def _card(self, t: float) -> Image.Image:
        """The white card with the current photo (cross-fading from the previous one)."""
        card = Image.new("RGBA", (self.CARD_W, self.CARD_H), (255, 255, 255, 255))
        local_t = max(0.0, t - 0.2)
        k = min(len(self.slides) - 1, int(local_t // self.slide_len))
        local = local_t - k * self.slide_len
        fade = _ease_out(_clamp(local / 0.35)) if k > 0 else 1.0

        def place(img: Image.Image, alpha: float, lt: float, dx: float):
            # Slow zoom: crop a shrinking window out of the 1.08x photo.
            z = 1 + 0.07 * _clamp(lt / max(self.slide_len, 1))
            cw, ch = round(img.width / 1.08 * z), round(img.height / 1.08 * z)
            cw, ch = min(cw, img.width), min(ch, img.height)
            left, top = (img.width - cw) // 2, (img.height - ch) // 2
            view = img.crop((left, top, left + cw, top + ch))
            if alpha < 1:
                a = view.getchannel("A").point(lambda v: round(v * alpha))
                view.putalpha(a)
            x = (self.CARD_W - view.width) // 2 + round(dx)
            y = (self.CARD_H - view.height) // 2
            card.paste(view, (x, y), view)

        if k > 0 and fade < 1:
            place(self.slides[k - 1], 1 - fade, self.slide_len + local, -60 * fade)
        place(self.slides[k], fade, local, 60 * (1 - fade))
        card.putalpha(self.card_mask.getchannel("A"))
        self._current = k % len(self.photos)
        return card

    def frame(self, t: float) -> Image.Image:
        d = self.d
        cur = d.currency
        img = self.bg.copy().convert("RGBA")
        draw = ImageDraw.Draw(img)

        # brand row + theme pill
        top = _ease_out(_span(t, 0, 0.6))
        if top > 0:
            layer = Image.new("RGBA", (W, 260), (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            ld.ellipse((94, 136, 126, 168), fill=BRAND)
            ld.text((142, 152), "CartCrush", font=font(800, 54), fill=INK, anchor="lm")
            label = self.style["label"]
            pw = ld.textlength(label, font=font(800, 30)) + 60
            ld.rounded_rectangle((W - 90 - pw, 118, W - 90, 186), 34, fill=self.style["accent"])
            ld.text((W - 90 - pw + 30, 153), label, font=font(800, 30), fill="#ffffff", anchor="lm")
            if top < 1:
                layer.putalpha(layer.getchannel("A").point(lambda v: round(v * top)))
            img.alpha_composite(layer, (0, round((1 - top) * -40)))

        # product card: scales in (with a little overshoot), then the photo slideshow
        p_in = _ease_back(_span(t, 0.2, 0.8))
        if p_in > 0:
            card = self._card(t)
            s = 0.8 + 0.2 * p_in
            cw, ch = round(self.CARD_W * s), round(self.CARD_H * s)
            scaled = card.resize((cw, ch), Image.BILINEAR) if s != 1 else card
            sh = self.shadow.resize((round(self.shadow.width * s), round(self.shadow.height * s)), Image.BILINEAR)
            alpha = _clamp(p_in * 1.4)
            if alpha < 1:
                scaled.putalpha(scaled.getchannel("A").point(lambda v: round(v * alpha)))
                sh.putalpha(sh.getchannel("A").point(lambda v: round(v * alpha)))
            img.alpha_composite(sh, (W // 2 - sh.width // 2, self.CARD_CY - sh.height // 2 + round(10 * s)))
            img.alpha_composite(scaled, (W // 2 - cw // 2, self.CARD_CY - ch // 2))
            if len(self.photos) > 1 and p_in > 0.5:
                gap = 30
                x0 = W / 2 - (len(self.photos) - 1) * gap / 2
                y = self.CARD_CY + self.CARD_H / 2 - 34
                for n in range(len(self.photos)):
                    r = 9 if n == self._current else 7
                    col = self.style["accent"] if n == self._current else "#d5d5d6"
                    draw.ellipse((x0 + n * gap - r, y - r, x0 + n * gap + r, y + r), fill=col)

        # discount badge pops, with a gentle wobble
        b = _ease_back(_span(t, 1.0, 0.7))
        if b > 0:
            size = 340
            badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            bd = ImageDraw.Draw(badge)
            bd.ellipse((20, 20, 320, 320), fill=self.style["accent"])
            bd.text((170, 188), f"{d.discount_pct}%", font=font(900, 112), fill="#ffffff", anchor="ms")
            bd.text((170, 250), "OFF", font=font(800, 40), fill="#ffffff", anchor="ms")
            badge = badge.rotate(10 - 4 * math.sin(t * 3), resample=Image.BICUBIC)
            bs = max(1, round(size * b))
            badge = badge.resize((bs, bs), Image.BILINEAR)
            img.alpha_composite(badge, (W - 190 - bs // 2, 520 - bs // 2))

        # brand + title slide up
        ti = _ease_out(_span(t, 1.6, 0.7))
        if ti > 0:
            layer = Image.new("RGBA", (W, 260), (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            if self.brand:
                ld.text((90, 52), self.brand, font=font(600, 34), fill=MUTED, anchor="ls")
            for i, line in enumerate(self.title):
                ld.text((90, 110 + i * 74), line, font=font(800, 60), fill=INK, anchor="ls")
            if ti < 1:
                layer.putalpha(layer.getchannel("A").point(lambda v: round(v * ti)))
            img.alpha_composite(layer, (0, 1040 + round((1 - ti) * 40)))

        # MRP appears and is struck through; then the price counts down to the deal price
        if t >= 2.3:
            m = _ease_out(_span(t, 2.3, 0.4))
            mrp = f"MRP {money(d.original_price, cur)}"
            col = tuple(round(PAPER[i] + (_hex(MUTED)[i] - PAPER[i]) * m) for i in range(3))
            draw.text((90, 1330), mrp, font=font(600, 46), fill=col, anchor="ls")
            strike = _ease_out(_span(t, 2.6, 0.5))
            if strike > 0:
                w = draw.textlength(mrp, font=font(600, 46)) * strike
                draw.rectangle((90, 1312, 90 + w, 1317), fill=col)
        if t >= 2.7:
            pr = _span(t, 2.7, 1.2)
            shown = round(d.original_price - (d.original_price - d.price) * _ease_out(pr))
            draw.text((82, 1480), money(shown, cur), font=font(900, 160),
                      fill=self.style["accent"] if pr >= 1 else INK, anchor="ls")

        # "you save" pill
        sv = _ease_back(_span(t, 3.8, 0.5))
        if sv > 0:
            save = f"You save {money(d.savings, cur)}"
            f = font(800, 40)
            sw = round(draw.textlength(save, font=f)) + 60
            pill = Image.new("RGBA", (sw, 80), (0, 0, 0, 0))
            pd = ImageDraw.Draw(pill)
            pd.rounded_rectangle((0, 0, sw - 1, 79), 22, fill=GOOD_SOFT)
            pd.text((30, 41), save, font=f, fill=GOOD, anchor="lm")
            ps = (max(1, round(sw * sv)), max(1, round(80 * sv)))
            pill = pill.resize(ps, Image.BILINEAR)
            img.alpha_composite(pill, (90 + sw // 2 - ps[0] // 2, 1560 - ps[1] // 2))

        # call to action: slides in, then breathes
        ca = _ease_out(_span(t, 4.6, 0.6))
        if ca > 0:
            pulse = 1 + (0.025 * math.sin((t - 4.6) * 5) if t > 5.2 else 0)
            cta = Image.new("RGBA", (900, 120), (0, 0, 0, 0))
            cd = ImageDraw.Draw(cta)
            cd.rounded_rectangle((0, 0, 899, 119), 60, fill=INK)
            cd.text((450, 62), "Link in bio  →  grab it on Amazon", font=font(800, 46), fill="#ffffff", anchor="mm")
            cs = (round(900 * pulse), round(120 * pulse))
            cta = cta.resize(cs, Image.BILINEAR) if pulse != 1 else cta
            if ca < 1:
                cta.putalpha(cta.getchannel("A").point(lambda v: round(v * ca)))
            img.alpha_composite(cta, (W // 2 - cs[0] // 2, 1700 + round((1 - ca) * 60) - cs[1] // 2))
            note = f"{SITE}  ·  #ad  ·  price when posted, Amazon prices change fast"
            col = tuple(round(PAPER[i] + (_hex(MUTED)[i] - PAPER[i]) * ca) for i in range(3))
            draw.text((W // 2, 1815), note, font=font(500, 28), fill=col, anchor="ms")

        return img.convert("RGB")


def render_reel(deal: Deal, photos: list[Image.Image], *, brand: str = "", theme: str = "",
                seconds: float = 8.0, fps: int = FPS) -> bytes:
    """Return the MP4 bytes of the deal video."""
    style = STYLES.get(theme, STYLES[""])
    scene = _Scene(deal, photos, brand, style, seconds)
    import os
    import tempfile

    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    cmd = [
        ffmpeg_exe(), "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-map", "0:v", "-map", "1:a", "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-level", "4.1",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart", path,
    ]
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for i in range(round(seconds * fps)):
                proc.stdin.write(scene.frame(i / fps).tobytes())
        except BrokenPipeError:
            pass
        _, err = proc.communicate(timeout=180)
        if proc.returncode != 0:
            raise ReelError(f"ffmpeg failed: {err.decode(errors='replace')[:300]}")
        with open(path, "rb") as f:
            data = f.read()
        if not data:
            raise ReelError("ffmpeg wrote an empty file")
        return data
    finally:
        os.unlink(path)


def product_photos(deal: Deal, doc: dict | None, fetch) -> list[Image.Image]:
    """Main photo plus the gallery (up to MAX_PHOTOS); photos that fail to download are skipped."""
    urls = [deal.image_url, *((doc or {}).get("images") or []), *deal.images]
    seen: set[str] = set()
    photos: list[Image.Image] = []
    for u in urls:
        if not isinstance(u, str) or u in seen:
            continue
        seen.add(u)
        try:
            photos.append(fetch(u))
        except Exception as exc:  # noqa: BLE001
            log.info("skip photo %s: %s", u, exc)
        if len(photos) >= MAX_PHOTOS:
            break
    return photos


# (asin, theme, slot) -> hosted video URL, so Facebook and Instagram share one render per slot.
_HOSTED: dict[tuple[str, str, str], str] = {}


class ReelPoster:
    """Posts a deal as a Reel through Zernio; falls back to the photo card poster."""

    wants_doc = True

    def __init__(self, zernio, uploader, fallback, *, platform: str, caption, fetch_image=None,
                 render=render_reel, clock=lambda: datetime.now(timezone.utc), seconds: float = 8.0):
        from . import cardart

        self._zernio = zernio            # ZernioPoster for this platform (has post_video)
        self._uploader = uploader        # CardUploader (upload_video)
        self._fallback = fallback        # the usual card poster
        self._platform = platform
        self._caption = caption          # caption(deal, theme=, department=) -> text
        self._fetch = fetch_image or cardart.fetch_product_image
        self._render = render
        self._clock = clock
        self._seconds = seconds

    def post(self, deal: Deal, due_at: datetime | None = None, doc: dict | None = None) -> str:
        from .picker import theme as pick_theme

        doc = {"title": deal.title, **(doc or {})}
        when = due_at or self._clock()
        th = pick_theme(doc, when)
        try:
            stamp = when.astimezone(timezone.utc).strftime("%Y%m%d%H%M")
            key = (deal.asin, th, stamp)
            url = _HOSTED.get(key)
            if url is None:
                photos = product_photos(deal, doc, self._fetch)
                mp4 = self._render(deal, photos, brand=str(doc.get("brand") or ""), theme=th, seconds=self._seconds)
                url = self._uploader.upload_video(f"{deal.asin}-{stamp}-reel", mp4)
                _HOSTED[key] = url
                log.info("reel for %s (%s, %d photos, %.1f MB): %s", deal.asin, th or "default",
                         len(photos), len(mp4) / 1e6, url)
            text = self._caption(deal, theme=th, department=str(doc.get("department") or ""))
            post_id = self._zernio.post_video(text, due_at, url, title=short_title(deal.title, 90))
            log.info("%s reel scheduled for %s", self._platform, deal.asin)
            return f"zernio:{post_id}"
        except Exception as exc:  # noqa: BLE001 - never lose the slot; post the photo card instead
            log.warning("%s reel for %s failed (%s); posting the photo card", self._platform, deal.asin, exc)
            return self._fallback.post(deal, due_at=due_at, doc=doc)

    def post_text(self, text: str, due_at: datetime | None = None, image_url: str | None = None) -> str:
        return self._fallback.post_text(text, due_at=due_at, **({"image_url": image_url} if image_url else {}))
