"""All runtime configuration comes from environment variables (GitHub Secrets in CI)."""
from __future__ import annotations

import base64
import re
import json
import os
from dataclasses import dataclass, field


class ConfigError(ValueError):
    pass


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc


def _str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


MARKETPLACES = {
    "in": {"domain": "www.amazon.in", "currency": "INR"},
    "com": {"domain": "www.amazon.com", "currency": "USD"},
}


@dataclass(frozen=True)
class XConfig:
    enabled: bool
    publisher: str = "buffer"  # buffer (free) | api (X API pay-per-use)
    buffer_api_key: str = ""
    buffer_channel_id: str = ""
    api_key: str = ""
    api_secret: str = ""
    access_token: str = ""
    access_token_secret: str = ""
    max_posts_per_run: int = 2


@dataclass(frozen=True)
class MetaConfig:
    enabled: bool
    page_id: str = ""
    page_access_token: str = ""
    ig_user_id: str = ""
    graph_version: str = "v26.0"
    ig_post_mode: str = "reel"  # reel | image | off
    fb_post_mode: str = "photo"  # photo | video | off
    max_posts_per_run: int = 2


@dataclass(frozen=True)
class Config:
    marketplace: str
    associate_tag: str
    max_products: int
    min_discount_pct: int
    max_posts_per_run: int
    dm_keyword: str
    stale_after_hours: int
    dry_run: bool
    firebase_credentials: dict | None
    x: XConfig
    meta: MetaConfig
    out_dir: str = "out"
    firebase_project_id: str = ""
    # Explicit products to scrape (e.g. the trending list); when set, discovery is skipped.
    asins: tuple = ()
    trending_refresh_per_run: int = 15
    extra: dict = field(default_factory=dict)

    @property
    def domain(self) -> str:
        return MARKETPLACES[self.marketplace]["domain"]

    @property
    def currency(self) -> str:
        return MARKETPLACES[self.marketplace]["currency"]


def _load_firebase_credentials() -> dict | None:
    raw = _str("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        return None
    if not raw.lstrip().startswith("{"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except Exception as exc:  # noqa: BLE001
            raise ConfigError("FIREBASE_SERVICE_ACCOUNT_JSON is neither JSON nor base64 JSON") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON") from exc
    if data.get("type") != "service_account":
        raise ConfigError("FIREBASE_SERVICE_ACCOUNT_JSON must be a service-account key")
    return data


ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def parse_asins(raw: str) -> tuple:
    """'B01CCGW4OE, B07VKM2HR5 ...' -> unique ASINs in order; anything else is an error."""
    out: list[str] = []
    for tok in re.split(r"[\s,]+", (raw or "").strip().upper()):
        if not tok:
            continue
        if not ASIN_RE.match(tok):
            raise ConfigError(f"ASINS: {tok!r} is not a 10-character ASIN")
        if tok not in out:
            out.append(tok)
    return tuple(out)


def load_config() -> Config:
    marketplace = _str("AMAZON_MARKETPLACE", "in").lower()
    if marketplace not in MARKETPLACES:
        raise ConfigError(f"AMAZON_MARKETPLACE must be one of {sorted(MARKETPLACES)}")
    tag = _str("AMAZON_ASSOCIATE_TAG")
    if not tag:
        raise ConfigError("AMAZON_ASSOCIATE_TAG is required (e.g. yourtag-21)")

    dry_run = _bool("DRY_RUN")
    creds = _load_firebase_credentials()
    project_id = _str("FIREBASE_PROJECT_ID") or (creds or {}).get("project_id", "")
    # Keyless (recommended): GitHub OIDC -> Workload Identity Federation sets
    # GOOGLE_APPLICATION_CREDENTIALS; we then only need the project id.
    keyless = bool(project_id and _str("GOOGLE_APPLICATION_CREDENTIALS"))
    if creds is None and not keyless and not dry_run:
        raise ConfigError(
            "Firestore credentials missing: set FIREBASE_PROJECT_ID with keyless GitHub->GCP auth, "
            "or FIREBASE_SERVICE_ACCOUNT_JSON (unless DRY_RUN=true)"
        )

    x = XConfig(
        enabled=_bool("X_ENABLED"),
        publisher=_str("X_PUBLISHER", "buffer").lower(),
        buffer_api_key=_str("BUFFER_API_KEY"),
        buffer_channel_id=_str("BUFFER_CHANNEL_ID"),
        api_key=_str("X_API_KEY"),
        api_secret=_str("X_API_SECRET"),
        access_token=_str("X_ACCESS_TOKEN"),
        access_token_secret=_str("X_ACCESS_TOKEN_SECRET"),
        max_posts_per_run=_int("X_MAX_POSTS_PER_RUN", 2),
    )
    if x.publisher not in {"buffer", "api"}:
        raise ConfigError("X_PUBLISHER must be buffer or api")
    if x.enabled and x.publisher == "buffer" and not (x.buffer_api_key and x.buffer_channel_id):
        raise ConfigError("X_ENABLED=true with X_PUBLISHER=buffer needs BUFFER_API_KEY and BUFFER_CHANNEL_ID")
    if x.enabled and x.publisher == "api" and not all([x.api_key, x.api_secret, x.access_token, x.access_token_secret]):
        raise ConfigError("X_ENABLED=true but one of X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET is missing")

    meta = MetaConfig(
        enabled=_bool("META_ENABLED"),
        page_id=_str("META_PAGE_ID"),
        page_access_token=_str("META_PAGE_ACCESS_TOKEN"),
        ig_user_id=_str("META_IG_USER_ID"),
        graph_version=_str("META_GRAPH_VERSION", "v26.0"),
        ig_post_mode=_str("IG_POST_MODE", "reel").lower(),
        fb_post_mode=_str("FB_POST_MODE", "photo").lower(),
        max_posts_per_run=_int("META_MAX_POSTS_PER_RUN", 2),
    )
    if meta.ig_post_mode not in {"reel", "image", "off"}:
        raise ConfigError("IG_POST_MODE must be reel, image or off")
    if meta.fb_post_mode not in {"photo", "video", "off"}:
        raise ConfigError("FB_POST_MODE must be photo, video or off")
    if meta.enabled:
        if not meta.page_access_token:
            raise ConfigError("META_ENABLED=true but META_PAGE_ACCESS_TOKEN is missing")
        if meta.fb_post_mode != "off" and not meta.page_id:
            raise ConfigError("META_PAGE_ID is required when FB_POST_MODE is not off")
        if meta.ig_post_mode != "off" and not meta.ig_user_id:
            raise ConfigError("META_IG_USER_ID is required when IG_POST_MODE is not off")

    return Config(
        marketplace=marketplace,
        associate_tag=tag,
        max_products=_int("MAX_PRODUCTS", 15),
        min_discount_pct=_int("MIN_DISCOUNT_PCT", 20),
        max_posts_per_run=_int("MAX_POSTS_PER_RUN", 3),
        dm_keyword=_str("DM_KEYWORD", "DEAL").upper(),
        stale_after_hours=_int("STALE_AFTER_HOURS", 24),
        asins=parse_asins(_str("ASINS")),
        trending_refresh_per_run=_int("TRENDING_REFRESH_PER_RUN", 15),
        dry_run=dry_run,
        firebase_credentials=creds,
        x=x,
        meta=meta,
        out_dir=_str("OUT_DIR", "out"),
        firebase_project_id=project_id,
    )
