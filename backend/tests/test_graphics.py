import shutil
import subprocess

import pytest
from PIL import Image

from deal_finder.graphics import FEED_SIZE, REEL_SIZE, render_card, render_media
from tests.conftest import make_deal


@pytest.fixture
def product():
    return Image.new("RGB", (800, 600), (30, 144, 255))


def test_feed_card_size_and_jpeg(product, tmp_path):
    media = render_media(make_deal(), product, tmp_path, "DEAL", want_video=False)
    with Image.open(media["feed_jpg"]) as im:
        assert im.format == "JPEG"
        assert im.size == FEED_SIZE
    assert media["reel_mp4"] is None


def test_reel_card_size(product):
    assert render_card(make_deal(), product, REEL_SIZE, "DEAL").size == REEL_SIZE


def test_long_title_does_not_crash(product):
    render_card(make_deal(title="Very long product title " * 20), product, FEED_SIZE, "DEAL")


@pytest.mark.ffmpeg
@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_reel_video_is_valid_vertical_h264_with_audio(product, tmp_path):
    media = render_media(make_deal(), product, tmp_path, "DEAL", want_video=True)
    probe = shutil.which("ffprobe")
    assert media["reel_mp4"].stat().st_size > 10_000
    if probe:
        out = subprocess.run(
            [probe, "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height",
             "-of", "csv=p=0", str(media["reel_mp4"])],
            capture_output=True, text=True, check=True,
        ).stdout
        assert "h264,video,1080,1920" in out.replace(" ", "") or "h264,1080,1920,video" in out.replace(" ", "")
        assert "aac" in out
