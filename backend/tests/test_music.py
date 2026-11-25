import shutil
import subprocess

import pytest

from deal_finder.music import TRACKS, MusicLibrary, pick_track


@pytest.mark.parametrize("doc,theme,track", [
    ({"title": "Woolen cardigan for women", "department": "fashion", "gender": "women"}, "winter", "winter"),
    ({"title": "ANNI Designer Embroidered Kurta Set", "department": "fashion", "asin": "B0G4RV39CP"}, "", "DESI"),
    ({"title": "Women's floral top", "department": "fashion", "gender": "women", "asin": "B0X"}, "her", "DESI"),
    ({"title": "Kratos TW04 earbuds", "department": "electronics"}, "", "gadget"),
    ({"title": "Analog watch for men", "department": "fashion", "category": "watches"}, "", "gadget"),
    ({"title": "Stainless steel sipper", "department": "baby"}, "", "light"),
    ({"title": "Non-stick kadai", "department": "home-kitchen"}, "", "light"),
    ({"title": "Car phone mount", "department": "automotive", "discount_pct": 75}, "", "gadget"),
    ({"title": "Car phone mount", "department": "automotive", "discount_pct": 40}, "", "default"),
])
def test_pick_track(doc, theme, track):
    from deal_finder.music import DESI

    got = pick_track(doc, theme)
    assert got in DESI if track == "DESI" else got == track


def test_desi_tracks_rotate_by_product_and_stay_put():
    from deal_finder.music import DESI, desi_for

    picks = {desi_for(f"B0TEST{i:04d}") for i in range(40)}
    assert picks == set(DESI)
    assert desi_for("B0G4RV39CP") == desi_for("B0G4RV39CP")


def test_every_track_has_settings():
    for name in ("gadget", "desi-sitar", "desi-flute", "desi-santoor", "desi-tabla", "light", "winter", "default"):
        assert set(TRACKS[name]) == {"file", "start", "gain"}


def test_library_downloads_once_and_survives_failures(tmp_path):
    calls = []

    class Resp:
        content = b"ID3" + b"x" * 20_000

        def raise_for_status(self):
            pass

    class Http:
        def get(self, url, timeout=None):
            calls.append(url)
            return Resp()

    lib = MusicLibrary("https://cards.example", session=Http(), cache_dir=str(tmp_path))
    p = lib.path("light")
    assert p.read_bytes().startswith(b"ID3") and calls == ["https://cards.example/m/light.mp3"]
    lib.path("light")
    assert len(calls) == 1                       # cached
    assert lib.path("default").name == "gadget.mp3"

    class Down:
        def get(self, url, timeout=None):
            raise OSError("offline")

    assert MusicLibrary("https://x", session=Down(), cache_dir=str(tmp_path / "n")).path("desi-flute") is None


def test_render_reel_mixes_the_music(tmp_path):
    from PIL import Image

    from deal_finder import reel
    from tests.test_zernio import _deal

    try:
        ff = reel.ffmpeg_exe()
    except reel.ReelError:
        pytest.skip("no ffmpeg")
    mp3 = tmp_path / "tone.mp3"
    subprocess.run([ff, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", str(mp3)], check=True)
    mp4 = reel.render_reel(_deal(), [Image.new("RGB", (300, 300), "white")], seconds=1.0, fps=10,
                           music=str(mp3), music_start=0.2, music_gain=0.9)
    out = tmp_path / "v.mp4"
    out.write_bytes(mp4)
    probe = shutil.which("ffprobe")
    if probe:
        info = subprocess.run([probe, "-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "csv=p=0",
                               str(out)], capture_output=True, text=True).stdout
        assert "audio" in info and "video" in info
    vol = subprocess.run([ff, "-hide_banner", "-i", str(out), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = float(vol.split("mean_volume:")[1].split("dB")[0])
    assert mean > -40          # real sound, not the silent track
