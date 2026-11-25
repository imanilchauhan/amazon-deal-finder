"""Background music for deal videos: which track suits which product, and where the files live.

Tracks are royalty-free Pixabay Music (Pixabay Content License: free for commercial use, no
credit needed). They are hosted on the cartcrush-cards Worker (/m/<track>.mp3), not in this
public repo, because the licence does not allow redistributing the files on their own.
The same rules live in web/src/lib/music.ts for the admin's in-browser videos.

  gadget  Upbeat Future Bass "So Easy" (BombinSound)          electronics, watches, big discounts
  desi    Fateh Asmaan (Spotlight_States)                       ethnic and women's fashion
  light   Sunlit Ukulele, 30-sec edit (Kaazoom)                 baby, home, kitchen, beauty
  winter  Relaxing Acoustic Guitar 30s (Universfield)           winter items (Nov–Feb)
"""
from __future__ import annotations

import logging
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

# start = seconds to skip (the ukulele opens with ~0.4 s of silence); gain = loudness 0..1.5
TRACKS: dict[str, dict] = {
    "gadget": {"file": "gadget", "start": 0.0, "gain": 0.85},
    "desi": {"file": "desi", "start": 0.0, "gain": 0.85},
    "light": {"file": "light", "start": 0.45, "gain": 0.9},
    "winter": {"file": "winter", "start": 0.0, "gain": 1.3},
    "default": {"file": "gadget", "start": 0.0, "gain": 0.7},
}

ETHNIC_RX = re.compile(
    r"\b(kurta|kurti|kurtis|saree|sari|lehenga|salwar|dupatta|anarkali|sherwani|ethnic|churidar|palazzo set)\b", re.I)
GADGET_DEPTS = {"electronics", "mobiles-tablets", "computers-accessories", "large-appliances"}
GADGET_CATS = {"watches", "smartwatches-bands", "headphones-earbuds"}
LIGHT_DEPTS = {"baby", "home-kitchen", "beauty-personal-care", "home-improvement-garden", "toys-games"}


def pick_track(doc: dict, theme: str = "") -> str:
    """Track name for a deal (Firestore doc fields: title, department, category, gender, discount_pct)."""
    title = str(doc.get("title") or "")
    dept = str(doc.get("department") or "")
    cat = str(doc.get("category") or "")
    if theme == "winter":
        return "winter"
    if ETHNIC_RX.search(title) or (doc.get("gender") == "women" and dept == "fashion"):
        return "desi"
    if dept in GADGET_DEPTS or cat in GADGET_CATS:
        return "gadget"
    if dept in LIGHT_DEPTS:
        return "light"
    if int(doc.get("discount_pct") or 0) >= 70:
        return "gadget"
    return "default"


class MusicLibrary:
    """Downloads tracks from the card host once per process (cached in a temp folder)."""

    def __init__(self, base_url: str, session=None, cache_dir: str | None = None):
        import requests

        self._base = base_url.rstrip("/")
        self._http = session or requests.Session()
        self._dir = Path(cache_dir or os.path.join(tempfile.gettempdir(), "cartcrush-music"))

    def path(self, track: str) -> Path | None:
        spec = TRACKS.get(track) or TRACKS["default"]
        dest = self._dir / f"{spec['file']}.mp3"
        if dest.exists() and dest.stat().st_size > 10_000:
            return dest
        try:
            resp = self._http.get(f"{self._base}/m/{spec['file']}.mp3", timeout=30)
            resp.raise_for_status()
            self._dir.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(f".{datetime.now().timestamp():.0f}.part")
            tmp.write_bytes(resp.content)
            tmp.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001 - no music is better than no video
            log.warning("music %s unavailable: %s", track, exc)
            return None
