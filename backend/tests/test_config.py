import base64
import json

import pytest

from deal_finder.config import ConfigError, load_config

SA = {"type": "service_account", "project_id": "demo", "private_key": "x", "client_email": "a@b"}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for k in list(__import__("os").environ):
        if k.startswith(("AMAZON_", "FIREBASE_", "X_", "META_", "IG_", "FB_", "DRY_RUN", "MAX_", "MIN_",
                         "BUFFER_", "GOOGLE_APPLICATION_CREDENTIALS")):
            monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("AMAZON_ASSOCIATE_TAG", "mytag-21")


def test_minimal_dry_run(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "true")
    cfg = load_config()
    assert cfg.marketplace == "in" and cfg.domain == "www.amazon.in" and cfg.currency == "INR"
    assert not cfg.x.enabled and not cfg.meta.enabled


def test_requires_tag(monkeypatch):
    monkeypatch.delenv("AMAZON_ASSOCIATE_TAG")
    monkeypatch.setenv("DRY_RUN", "true")
    with pytest.raises(ConfigError, match="AMAZON_ASSOCIATE_TAG"):
        load_config()


def test_requires_firebase_when_live():
    with pytest.raises(ConfigError, match="FIREBASE_SERVICE_ACCOUNT_JSON"):
        load_config()


@pytest.mark.parametrize("encode", [json.dumps, lambda d: base64.b64encode(json.dumps(d).encode()).decode()])
def test_firebase_json_or_base64(monkeypatch, encode):
    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_JSON", encode(SA))
    assert load_config().firebase_credentials["project_id"] == "demo"


def test_x_enabled_requires_all_keys(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.setenv("X_ENABLED", "true")
    monkeypatch.setenv("X_API_KEY", "k")
    with pytest.raises(ConfigError, match="X_ENABLED"):
        load_config()


def test_meta_requires_ids(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.setenv("META_ENABLED", "true")
    monkeypatch.setenv("META_PAGE_ACCESS_TOKEN", "t")
    monkeypatch.setenv("META_PAGE_ID", "p")
    with pytest.raises(ConfigError, match="META_IG_USER_ID"):
        load_config()
    monkeypatch.setenv("IG_POST_MODE", "off")
    assert load_config().meta.ig_post_mode == "off"


def test_bad_marketplace(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.setenv("AMAZON_MARKETPLACE", "de")
    with pytest.raises(ConfigError):
        load_config()


def test_keyless_firebase_with_project_id(monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "deals-prod")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/gha-creds.json")
    cfg = load_config()
    assert cfg.firebase_credentials is None and cfg.firebase_project_id == "deals-prod"


def test_buffer_is_default_publisher_and_needs_key(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.setenv("X_ENABLED", "true")
    with pytest.raises(ConfigError, match="BUFFER_API_KEY"):
        load_config()
    monkeypatch.setenv("BUFFER_API_KEY", "k")
    monkeypatch.setenv("BUFFER_CHANNEL_ID", "c")
    cfg = load_config()
    assert cfg.x.publisher == "buffer"


def test_api_publisher_needs_x_keys(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.setenv("X_ENABLED", "true")
    monkeypatch.setenv("X_PUBLISHER", "api")
    with pytest.raises(ConfigError, match="X_API_KEY"):
        load_config()
