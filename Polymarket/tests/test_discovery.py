import json

import pytest

from pmbot.discovery import (
    DiscoveryError,
    market_from_clob,
    market_from_gamma,
    slug_from_url,
)

GAMMA_PAYLOAD = {
    "conditionId": "0xabc123",
    "slug": "will-it-rain-tomorrow",
    "question": "Will it rain tomorrow?",
    "closed": False,
    # Gamma serialises these as JSON strings, not arrays.
    "outcomes": json.dumps(["Yes", "No"]),
    "clobTokenIds": json.dumps(["111", "222"]),
}


def test_slug_from_url_variants():
    assert slug_from_url("https://polymarket.com/event/will-it-rain") == "will-it-rain"
    assert slug_from_url("https://polymarket.com/event/will-it-rain/") == "will-it-rain"
    assert slug_from_url("https://polymarket.com/event/x/will-it-rain?tid=9") == "will-it-rain"
    assert slug_from_url("will-it-rain") == "will-it-rain"


def test_gamma_pairs_outcomes_with_tokens():
    market = market_from_gamma(GAMMA_PAYLOAD)
    assert market.condition_id == "0xabc123"
    assert market.outcome_token("Yes").token_id == "111"
    assert market.outcome_token("No").token_id == "222"


def test_outcome_lookup_is_case_insensitive():
    market = market_from_gamma(GAMMA_PAYLOAD)
    assert market.outcome_token("yes").token_id == "111"
    assert market.outcome_token("  YES ").token_id == "111"


def test_outcome_lookup_survives_reordering():
    """The whole point: order in the array must not matter."""
    reordered = GAMMA_PAYLOAD | {
        "outcomes": json.dumps(["No", "Yes"]),
        "clobTokenIds": json.dumps(["222", "111"]),
    }
    market = market_from_gamma(reordered)
    assert market.outcome_token("Yes").token_id == "111"


def test_unknown_outcome_raises_with_available_names():
    market = market_from_gamma(GAMMA_PAYLOAD)
    with pytest.raises(DiscoveryError, match="Yes, No"):
        market.outcome_token("Maybe")


def test_mismatched_lengths_refuse_to_guess():
    broken = GAMMA_PAYLOAD | {"clobTokenIds": json.dumps(["111"])}
    with pytest.raises(DiscoveryError, match="refusing to guess"):
        market_from_gamma(broken)


def test_missing_token_ids_raises():
    broken = GAMMA_PAYLOAD | {"clobTokenIds": json.dumps([])}
    with pytest.raises(DiscoveryError, match="no clobTokenIds"):
        market_from_gamma(broken)


def test_gamma_accepts_real_lists_too():
    """Field types have changed before; accept both shapes."""
    as_lists = GAMMA_PAYLOAD | {"outcomes": ["Yes", "No"], "clobTokenIds": ["111", "222"]}
    assert market_from_gamma(as_lists).outcome_token("No").token_id == "222"


def test_clob_fallback_pairs_by_outcome_label():
    market = market_from_clob(
        {
            "condition_id": "0xabc123",
            "market_slug": "will-it-rain-tomorrow",
            "question": "Will it rain tomorrow?",
            "closed": False,
            "tokens": [
                {"token_id": "222", "outcome": "No"},
                {"token_id": "111", "outcome": "Yes"},
            ],
        }
    )
    assert market.outcome_token("Yes").token_id == "111"
    assert market.token_ids == ("222", "111")
