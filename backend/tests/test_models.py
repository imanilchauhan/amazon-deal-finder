import pytest

from deal_finder.models import (
    InvalidDeal,
    affiliate_url,
    compute_discount_pct,
    extract_asin,
    parse_price,
    schema_errors,
    validate_deal,
)
from tests.conftest import make_deal


@pytest.mark.parametrize(
    "text,expected",
    [
        ("₹1,299", 1299.0),
        ("₹1,299.00", 1299.0),
        ("₹ 1,29,999", 129999.0),
        ("$1,299.99", 1299.99),
        ("$19.5", 19.5),
        ("1.299,00 €", 1299.0),
        ("M.R.P.: ₹2,399", 2399.0),
        ("", None),
        (None, None),
        ("Currently unavailable", None),
        ("₹0", None),
    ],
)
def test_parse_price(text, expected):
    assert parse_price(text) == expected


def test_compute_discount_pct_rounds_half_up():
    assert compute_discount_pct(1299, 2399) == 46
    assert compute_discount_pct(50, 100) == 50
    assert compute_discount_pct(100, 100) == 0
    assert compute_discount_pct(120, 100) == 0


@pytest.mark.parametrize(
    "url,asin",
    [
        ("/boAt-Rockerz/dp/B07PR1CL3S/ref=x", "B07PR1CL3S"),
        ("https://www.amazon.in/dp/B07PR1CL3S?th=1", "B07PR1CL3S"),
        ("/gp/product/B0CHX1W1XY/", "B0CHX1W1XY"),
        ("/dp/B07PR1CL3S", "B07PR1CL3S"),
        ("/deal/abc", None),
        ("/dp/b07pr1cl3s/", None),
    ],
)
def test_extract_asin(url, asin):
    assert extract_asin(url) == asin


def test_affiliate_url_format():
    assert affiliate_url("B07PR1CL3S", "mytag-21", "www.amazon.in") == "https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21"
    with pytest.raises(ValueError):
        affiliate_url("bad", "mytag-21", "www.amazon.in")
    with pytest.raises(ValueError):
        affiliate_url("B07PR1CL3S", "bad tag&x=1", "www.amazon.in")


def test_valid_deal_passes_schema():
    d = make_deal()
    assert schema_errors(d.to_dict()) == []
    assert validate_deal(d.to_dict()) == d


@pytest.mark.parametrize(
    "mutate,fragment",
    [
        (lambda p: p.pop("asin"), "'asin' is a required property"),
        (lambda p: p.update(asin="b07"), "asin"),
        (lambda p: p.update(price=-1), "price"),
        (lambda p: p.update(price="1299"), "price"),
        (lambda p: p.update(currency="EUR"), "currency"),
        (lambda p: p.update(image_url="http://insecure.jpg"), "image_url"),
        (lambda p: p.update(url="https://evil.example/dp/B0TESTASIN/?tag=x"), "url"),
        (lambda p: p.update(url="https://www.amazon.in/dp/B0TESTASIN/"), "url"),  # missing tag
        (lambda p: p.update(extra_field=1), "Additional properties"),
        (lambda p: p.update(discount_pct=99), "discount_pct"),
        (lambda p: p.update(title="  "), None),
    ],
)
def test_invalid_payloads_rejected(mutate, fragment):
    payload = make_deal().to_dict()
    mutate(payload)
    errors = schema_errors(payload)
    if fragment is None:
        # whitespace title is 2 chars -> minLength 3 fails
        assert errors
    else:
        assert any(fragment in e for e in errors), errors


def test_cross_field_rules():
    p = make_deal().to_dict()
    p["price"] = p["original_price"]
    assert "price must be lower than original_price" in schema_errors(p)

    p = make_deal().to_dict()
    p["discount_pct"] = 10
    assert any("does not match prices" in e for e in schema_errors(p))

    p = make_deal().to_dict()
    p["url"] = affiliate_url("B0OTHERXXX", "mytag-21", "www.amazon.in")
    assert "url does not point at this ASIN" in schema_errors(p)


def test_validate_deal_raises():
    p = make_deal().to_dict()
    p["price"] = 0
    with pytest.raises(InvalidDeal):
        validate_deal(p)
