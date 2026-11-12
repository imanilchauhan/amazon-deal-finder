from dataclasses import replace
from pathlib import Path

import pytest

from deal_finder.config import Config, MetaConfig, XConfig
from deal_finder.main import Deps, run
from deal_finder.store import DealStore
from tests.conftest import NOW, make_deal


def cfg(**kw):
    base = Config(
        marketplace="in", associate_tag="mytag-21", max_products=10, min_discount_pct=20,
        max_posts_per_run=3, dm_keyword="DEAL", stale_after_hours=24, dry_run=False,
        firebase_credentials={"type": "service_account"},
        x=XConfig(enabled=True, max_posts_per_run=2),
        meta=MetaConfig(enabled=True, page_id="P", page_access_token="T", ig_user_id="I", max_posts_per_run=2),
    )
    return replace(base, **kw)


class FakeX:
    def __init__(self, fail=False):
        self.posted, self.fail = [], fail

    def post(self, deal):
        if self.fail:
            raise RuntimeError("X down")
        self.posted.append(deal.asin)
        return f"tw-{deal.asin}"


class FakeMeta:
    def __init__(self, fail_ig=False):
        self.calls, self.fail_ig = [], fail_ig

    def post_facebook_photo(self, path, caption):
        self.calls.append(("fb_photo", Path(path).name, caption))
        return "P_1"

    def post_facebook_video(self, path, caption):
        self.calls.append(("fb_video", Path(path).name, caption))
        return "P_2"

    def post_instagram_reel(self, path, caption):
        if self.fail_ig:
            raise RuntimeError("IG container ERROR")
        self.calls.append(("ig_reel", Path(path).name, caption))
        return "IG_9"

    def post_instagram_image(self, url, caption):
        self.calls.append(("ig_image", url, caption))
        return "IG_10"


def render(deal, want_video):
    return {"feed_jpg": Path(f"{deal.asin}_feed.jpg"), "reel_mp4": Path(f"{deal.asin}_reel.mp4") if want_video else None}


def deps(fake_db, deals, **kw):
    return Deps(scrape=lambda: deals, store=DealStore(fake_db, clock=lambda: NOW),
                render=render, now=lambda: NOW, **kw)


def test_dry_run_writes_and_posts_nothing(fake_db):
    x = FakeX()
    s = run(cfg(dry_run=True), Deps(scrape=lambda: [make_deal()], store=None, x=x))
    assert s.valid == 1 and s.posts[0]["platform"] == "dry-run"
    assert x.posted == [] and fake_db.data == {}


def test_full_pipeline_posts_to_all_platforms_and_maps_ids(fake_db):
    x, meta = FakeX(), FakeMeta()
    s = run(cfg(), deps(fake_db, [make_deal()], x=x, meta=meta))
    assert s.new == 1
    assert {p["platform"] for p in s.posts} == {"x", "facebook", "instagram"}
    posted = fake_db.data["deals"]["B0TESTASIN"]["posted"]
    assert set(posted) == {"x", "facebook", "instagram"}
    assert fake_db.data["ig_media"]["IG_9"]["asin"] == "B0TESTASIN"
    assert fake_db.data["fb_posts"]["P_1"]["url"].endswith("tag=mytag-21")
    assert [c[0] for c in meta.calls] == ["fb_photo", "ig_reel"]
    assert 'Comment "DEAL"' in meta.calls[1][2]


def test_second_run_does_not_repost(fake_db):
    x, meta = FakeX(), FakeMeta()
    run(cfg(), deps(fake_db, [make_deal()], x=x, meta=meta))
    s2 = run(cfg(), deps(fake_db, [make_deal()], x=x, meta=meta))
    assert s2.posts == [] and x.posted == ["B0TESTASIN"]


def test_one_platform_failing_does_not_block_others(fake_db):
    x, meta = FakeX(fail=True), FakeMeta(fail_ig=True)
    s = run(cfg(), deps(fake_db, [make_deal()], x=x, meta=meta))
    assert [p["platform"] for p in s.posts] == ["facebook"]
    assert {e["stage"] for e in s.errors} == {"x", "instagram"}
    # failed platforms remain un-posted so the next run retries them
    assert set(fake_db.data["deals"]["B0TESTASIN"]["posted"]) == {"facebook"}


def test_per_platform_budget_and_best_discount_first(fake_db):
    deals = [
        make_deal(asin="B0AAAAAAAA", price=900, original=1000),    # 10%
        make_deal(asin="B0BBBBBBBB", price=500, original=1000),    # 50%
        make_deal(asin="B0CCCCCCCC", price=700, original=1000),    # 30%
    ]
    x = FakeX()
    s = run(cfg(meta=MetaConfig(enabled=False)), deps(fake_db, deals, x=x))
    assert x.posted == ["B0BBBBBBBB", "B0CCCCCCCC"]  # X cap = 2
    assert len(s.posts) == 2


def test_invalid_deal_is_filtered_before_firestore(fake_db):
    bad = replace(make_deal(asin="B0BADBADBA"), url="https://evil.example/")
    s = run(cfg(), deps(fake_db, [bad, make_deal()], x=FakeX(), meta=FakeMeta()))
    assert s.valid == 1
    assert "B0BADBADBA" not in fake_db.data["deals"]
    assert s.errors[0]["stage"] == "schema"


def test_render_failure_skips_meta_but_x_still_posts(fake_db):
    def broken(deal, want_video):
        raise OSError("image download 403")

    x, meta = FakeX(), FakeMeta()
    d = Deps(scrape=lambda: [make_deal()], store=DealStore(fake_db, clock=lambda: NOW), x=x, meta=meta,
             render=broken, now=lambda: NOW)
    s = run(cfg(), d)
    assert [p["platform"] for p in s.posts] == ["x"]
    assert {e["stage"] for e in s.errors} == {"render", "facebook", "instagram"}


@pytest.mark.parametrize("mode,expected", [("image", "ig_image"), ("reel", "ig_reel")])
def test_ig_modes(fake_db, mode, expected):
    meta = FakeMeta()
    c = cfg(x=XConfig(enabled=False), meta=MetaConfig(enabled=True, page_id="P", page_access_token="T",
                                                       ig_user_id="I", ig_post_mode=mode, fb_post_mode="off"))
    run(c, deps(fake_db, [make_deal()], meta=meta))
    assert [c_[0] for c_ in meta.calls] == [expected]
    if mode == "image":
        assert meta.calls[0][1].startswith("https://m.media-amazon.com/")
