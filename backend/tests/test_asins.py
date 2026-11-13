import pytest

from deal_finder.config import ConfigError, parse_asins


def test_parse_asins_accepts_commas_spaces_and_dedupes():
    assert parse_asins("b01ccgw4oe, B07VKM2HR5\nB01CCGW4OE") == ("B01CCGW4OE", "B07VKM2HR5")
    assert parse_asins("") == ()


def test_parse_asins_rejects_junk():
    with pytest.raises(ConfigError):
        parse_asins("B01CCGW4OE, https://amazon.in/dp/x")
