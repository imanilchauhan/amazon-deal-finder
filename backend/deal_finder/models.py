"""Deal payload, JSON schema, price parsing and affiliate-link helpers.

Everything here is pure Python so it can be unit tested without network access.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import quote

from jsonschema import Draft202012Validator

ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")
ASIN_IN_URL_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})(?:[/?#]|$)")
TAG_RE = re.compile(r"^[A-Za-z0-9_-]{3,64}$")

DEAL_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Deal",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "asin", "title", "price", "original_price", "discount_pct", "currency",
        "image_url", "url", "marketplace", "scraped_at",
    ],
    "properties": {
        "asin": {"type": "string", "pattern": "^[A-Z0-9]{10}$"},
        "title": {"type": "string", "minLength": 3, "maxLength": 300},
        "price": {"type": "number", "exclusiveMinimum": 0},
        "original_price": {"type": "number", "exclusiveMinimum": 0},
        "discount_pct": {"type": "integer", "minimum": 0, "maximum": 95},
        "currency": {"type": "string", "enum": ["INR", "USD"]},
        "image_url": {"type": "string", "pattern": "^https://"},
        "images": {
            "type": "array",
            "maxItems": 8,
            "items": {"type": "string", "pattern": "^https://"},
        },
        "url": {
            "type": "string",
            "pattern": r"^https://www\.amazon\.(in|com)/dp/[A-Z0-9]{10}/\?tag=[A-Za-z0-9_-]{3,64}$",
        },
        "marketplace": {"type": "string", "enum": ["in", "com"]},
        "scraped_at": {"type": "string", "format": "date-time"},
    },
}

_VALIDATOR = Draft202012Validator(DEAL_SCHEMA)


class InvalidDeal(ValueError):
    pass


@dataclass(frozen=True)
class Deal:
    asin: str
    title: str
    price: float
    original_price: float
    discount_pct: int
    currency: str
    image_url: str
    url: str
    marketplace: str
    scraped_at: str
    images: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        d = asdict(self)
        # Only write a gallery when we found one, so a run that missed it keeps the old photos.
        if self.images:
            d["images"] = list(self.images)
        else:
            d.pop("images")
        return d

    @property
    def savings(self) -> float:
        return round(self.original_price - self.price, 2)


def schema_errors(payload: dict) -> list[str]:
    """Return human-readable schema errors, plus cross-field business rules."""
    errors = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in sorted(_VALIDATOR.iter_errors(payload), key=lambda e: list(e.absolute_path))
    ]
    if errors:
        return errors
    if payload["price"] > payload["original_price"]:
        errors.append("price must not be above original_price")
    elif payload["price"] == payload["original_price"]:
        # Full-price products are allowed (collections), but then there is no discount to claim.
        if payload["discount_pct"] != 0:
            errors.append("discount_pct must be 0 when price equals original_price")
    else:
        expected = compute_discount_pct(payload["price"], payload["original_price"])
        if abs(expected - payload["discount_pct"]) > 1:
            errors.append(f"discount_pct {payload['discount_pct']} does not match prices (expected {expected})")
    if f"/dp/{payload['asin']}/" not in payload["url"]:
        errors.append("url does not point at this ASIN")
    return errors


def validate_deal(payload: dict) -> Deal:
    errors = schema_errors(payload)
    if errors:
        raise InvalidDeal("; ".join(errors))
    return Deal(**{**payload, "images": tuple(payload.get("images") or ())})


def parse_price(text: str | None) -> float | None:
    """Parse '₹1,299.00', '$1,299.99', '1.299,00 €' style strings. Returns None if unparseable."""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.,]", "", text.strip())
    if not cleaned or not re.search(r"\d", cleaned):
        return None
    # Decide decimal separator: the last of ',' or '.' followed by exactly 1-2 digits.
    m = re.search(r"[.,](\d{1,2})$", cleaned)
    if m:
        integer_part = re.sub(r"[.,]", "", cleaned[: m.start()])
        number = f"{integer_part}.{m.group(1)}"
    else:
        number = re.sub(r"[.,]", "", cleaned)
    try:
        value = Decimal(number)
    except InvalidOperation:
        return None
    if value <= 0:
        return None
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_discount_pct(price: float, original_price: float) -> int:
    if original_price <= 0 or price <= 0 or price >= original_price:
        return 0
    pct = (Decimal(str(original_price)) - Decimal(str(price))) / Decimal(str(original_price)) * 100
    return int(pct.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def extract_asin(url_or_path: str) -> str | None:
    m = ASIN_IN_URL_RE.search(url_or_path or "")
    return m.group(1) if m else None


def affiliate_url(asin: str, tag: str, domain: str) -> str:
    """Canonical, minimal affiliate link: https://www.amazon.in/dp/ASIN/?tag=yourtag-21"""
    if not ASIN_RE.match(asin):
        raise ValueError(f"invalid ASIN {asin!r}")
    if not TAG_RE.match(tag):
        raise ValueError(f"invalid associate tag {tag!r}")
    return f"https://{domain}/dp/{asin}/?tag={quote(tag)}"


def clean_title(title: str, max_len: int = 300) -> str:
    title = re.sub(r"\s+", " ", title or "").strip()
    return title[:max_len].rstrip()
