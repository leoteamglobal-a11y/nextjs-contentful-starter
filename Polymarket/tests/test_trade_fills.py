"""Fills inferred from the trade tape — the path that matters for a maker."""

import json

import pytest

from pmbot.intents import PlaceQuote
from pmbot.replay import _as_trade, run_replay
from pmbot.sim import PaperBroker


def test_resting_bid_fills_when_a_trade_prints_at_or_below_it():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.45, 100))

    fills = broker.match_trade("t", price=0.45, size=100)

    assert len(fills) == 1
    assert fills[0].price == 0.45  # filled at OUR price, not the print
    assert broker.portfolio.position("t").shares == 100


def test_resting_bid_does_not_fill_on_a_trade_above_it():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.45, 100))

    assert broker.match_trade("t", price=0.50, size=100) == []


def test_resting_ask_fills_when_a_trade_prints_at_or_above_it():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "SELL", 0.55, 100))

    fills = broker.match_trade("t", price=0.60, size=50)

    assert len(fills) == 1
    assert fills[0].size == 50
    assert broker.portfolio.position("t").shares == -50


def test_trade_size_is_shared_across_orders_by_price_priority():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.40, 60))
    broker.place(PlaceQuote("t", "BUY", 0.45, 60))

    fills = broker.match_trade("t", price=0.40, size=100)

    # The better-priced bid is taken first and in full; the rest spills over.
    assert fills[0].price == 0.45 and fills[0].size == 60
    assert fills[1].price == 0.40 and fills[1].size == 40


def test_queue_factor_limits_trade_fills():
    broker = PaperBroker(queue_factor=0.25)
    broker.place(PlaceQuote("t", "BUY", 0.45, 100))

    fills = broker.match_trade("t", price=0.45, size=80)
    assert fills[0].size == pytest.approx(20)


def test_zero_size_trade_fills_nothing():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.45, 100))
    assert broker.match_trade("t", price=0.45, size=0) == []


def test_as_trade_parses_a_print():
    assert _as_trade(
        {"event_type": "last_trade_price", "asset_id": "t", "price": "0.45", "size": "10"}
    ) == ("t", 0.45, 10.0)


def test_as_trade_rejects_non_trades_and_sizeless_prints():
    assert _as_trade({"event_type": "book", "asset_id": "t"}) is None
    # No size means no defensible fill quantity: skip rather than guess.
    assert _as_trade({"event_type": "last_trade_price", "asset_id": "t", "price": "0.4"}) is None
    assert _as_trade({"event_type": "last_trade_price", "price": "0.4", "size": "5"}) is None


def test_replay_fills_a_maker_from_the_tape(tmp_path):
    """The end-to-end case book-only data structurally cannot produce."""
    records = [
        {
            "kind": "market",
            "slug": "rain",
            "condition_id": "0xrain",
            "tokens": [{"token_id": "t", "outcome": "Yes"}],
        },
        {
            "kind": "raw",
            "msg": {
                "event_type": "book",
                "asset_id": "t",
                "bids": [{"price": "0.45", "size": "500"}],
                "asks": [{"price": "0.55", "size": "500"}],
            },
        },
        # A taker sells down into the resting bid. The book never crosses.
        {
            "kind": "raw",
            "msg": {
                "event_type": "last_trade_price",
                "asset_id": "t",
                "price": "0.47",
                "size": "100",
            },
        },
    ]
    path = tmp_path / "feed.jsonl"
    with path.open("w") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")

    class QuoteOnce:
        name = "quote-once"

        def on_update(self, ctx):
            if ctx.resting_for(ctx.updated_token):
                return []
            return [PlaceQuote(ctx.updated_token, "BUY", 0.48, 50)]

    result = run_replay([path], QuoteOnce(), broker=PaperBroker(queue_factor=1.0))

    assert result.trades == 1
    assert result.portfolio.fills == 1
    assert result.portfolio.position("t").shares == 50
