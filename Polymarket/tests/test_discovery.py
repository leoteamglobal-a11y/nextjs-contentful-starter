import pytest

from pmbot.discovery import DiscoveryError, market_from_payload, slug_from_url

# Trimmed from a real `GET /v1/market/slug/{slug}` response.
PAYLOAD = {
    "id": "1",
    "slug": "tec-mlb-nlchamp-2026-09-27-nym",
    "question": "National League Champion",
    "category": "sports",
    "endDate": "2026-11-06T16:20:09Z",
    "active": True,
    "closed": False,
    "archived": False,
    "orderPriceMinTickSize": 0.001,
    "minimumTradeQty": 1,
    "marketSides": [
        {"description": "Yes", "long": True, "tradable": True},
        {"description": "No", "long": False, "tradable": True},
    ],
}

TEAMS = PAYLOAD | {
    "slug": "aec-nfl-lac-ten-2025-11-02",
    "marketSides": [
        {"description": "Chargers", "long": True, "tradable": True},
        {"description": "Titans", "long": False, "tradable": True},
    ],
}


def test_slug_from_url_variants():
    assert slug_from_url("https://polymarket.us/market/btc-100k") == "btc-100k"
    assert slug_from_url("https://polymarket.us/market/btc-100k/") == "btc-100k"
    assert slug_from_url("https://polymarket.us/event/x/btc-100k?ref=9") == "btc-100k"
    assert slug_from_url("btc-100k") == "btc-100k"


def test_slug_is_the_instrument_key():
    """The whole simplification: one market, one instrument, addressed by slug."""
    market = market_from_payload(PAYLOAD)
    assert market.slug == "tec-mlb-nlchamp-2026-09-27-nym"
    assert market.instrument == market.slug


def test_wrapped_and_bare_payloads_both_parse():
    """`/market/slug/{slug}` wraps in `market`; the list endpoint does not."""
    assert market_from_payload({"market": PAYLOAD}).slug == PAYLOAD["slug"]
    assert market_from_payload(PAYLOAD).slug == PAYLOAD["slug"]


def test_sides_resolve_by_direction_words():
    market = market_from_payload(TEAMS)
    assert market.side("long").description == "Chargers"
    assert market.side("short").description == "Titans"
    # A caller that thinks in YES/NO gets the same answer.
    assert market.side("yes").long is True
    assert market.side("no").long is False


def test_sides_resolve_by_venue_label_case_insensitively():
    market = market_from_payload(TEAMS)
    assert market.side("chargers").long is True
    assert market.side("  TITANS ").long is False


def test_side_order_in_the_array_does_not_matter():
    reordered = TEAMS | {"marketSides": list(reversed(TEAMS["marketSides"]))}
    assert market_from_payload(reordered).side("long").description == "Chargers"


def test_unknown_side_raises_with_available_names():
    market = market_from_payload(TEAMS)
    with pytest.raises(DiscoveryError, match="Chargers, Titans"):
        market.side("Packers")


def test_missing_slug_raises():
    with pytest.raises(DiscoveryError, match="no slug"):
        market_from_payload(PAYLOAD | {"slug": ""})


def test_tradable_requires_active_and_not_closed():
    """The live API really does return active *and* closed at once."""
    assert market_from_payload(PAYLOAD).tradable is True
    assert market_from_payload(PAYLOAD | {"closed": True}).tradable is False
    assert market_from_payload(PAYLOAD | {"active": False}).tradable is False
    assert market_from_payload(PAYLOAD | {"archived": True}).tradable is False


def test_tick_and_qty_are_read_from_the_venue():
    market = market_from_payload(PAYLOAD)
    assert market.tick_size == 0.001
    assert market.min_qty == 1.0


def test_missing_or_zero_tick_falls_back_rather_than_quoting_too_finely():
    """A zero tick would let every order be rejected for price precision."""
    assert market_from_payload(PAYLOAD | {"orderPriceMinTickSize": 0}).tick_size == 0.01
    stripped = {k: v for k, v in PAYLOAD.items() if k != "orderPriceMinTickSize"}
    assert market_from_payload(stripped).tick_size == 0.01


def test_market_with_no_sides_still_parses():
    """Sides are metadata; the slug alone is enough to subscribe."""
    market = market_from_payload({k: v for k, v in PAYLOAD.items() if k != "marketSides"})
    assert market.sides == ()
    assert market.long_side is None
    with pytest.raises(DiscoveryError, match="<none>"):
        market.side("long")
