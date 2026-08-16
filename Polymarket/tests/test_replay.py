import json

import pytest

from pmbot.intents import PlaceQuote
from pmbot.replay import run_replay
from pmbot.risk import RiskLimits, RiskManager
from pmbot.sim import PaperBroker
from pmbot.strategy import MakerStrategy


def snapshot(token, bid, ask, size=500):
    return {
        "event_type": "book",
        "asset_id": token,
        "bids": [{"price": str(bid), "size": str(size)}],
        "asks": [{"price": str(ask), "size": str(size)}],
        "timestamp": "1739000000000",
    }


def write_journal(tmp_path, records, name="feed.jsonl"):
    path = tmp_path / name
    with path.open("w") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")
    return path


def market_record():
    return {
        "kind": "market",
        "slug": "rain",
        "condition_id": "0xrain",
        "tokens": [{"token_id": "t", "outcome": "Yes"}],
    }


def raw(msg):
    return {"kind": "raw", "msg": msg}


class AlwaysBuy:
    name = "always-buy"

    def __init__(self, price=0.40, size=10.0):
        self.price, self.size = price, size

    def on_update(self, ctx):
        if ctx.resting_for(ctx.updated_token):
            return []
        return [PlaceQuote(ctx.updated_token, "BUY", self.price, self.size)]


def test_replay_labels_tokens_from_market_records(tmp_path):
    path = write_journal(tmp_path, [market_record(), raw(snapshot("t", 0.45, 0.55))])
    result = run_replay([path], MakerStrategy())
    assert result.label("t") == "rain/Yes"


def test_no_fill_without_the_market_trading_through(tmp_path):
    path = write_journal(
        tmp_path,
        [market_record()] + [raw(snapshot("t", 0.45, 0.55)) for _ in range(3)],
    )
    result = run_replay([path], AlwaysBuy(price=0.40), broker=PaperBroker(queue_factor=1.0))
    assert result.portfolio.fills == 0


def test_fill_occurs_when_price_drops_through_the_quote(tmp_path):
    path = write_journal(
        tmp_path,
        [
            market_record(),
            raw(snapshot("t", 0.45, 0.55)),
            raw(snapshot("t", 0.30, 0.39)),
        ],
    )
    result = run_replay([path], AlwaysBuy(price=0.40), broker=PaperBroker(queue_factor=1.0))

    assert result.portfolio.fills == 1
    assert result.portfolio.position("t").shares == 10
    # Bought at 0.40, market now marks 0.345 — an immediate paper loss, which
    # is exactly the adverse selection a maker suffers.
    assert result.unrealized < 0


def test_no_lookahead_a_quote_cannot_fill_on_the_update_that_created_it(tmp_path):
    """The strategy quotes 0.40 only after seeing the 0.39 ask; it must not
    then be filled by that same book state."""
    path = write_journal(tmp_path, [market_record(), raw(snapshot("t", 0.30, 0.39))])
    result = run_replay([path], AlwaysBuy(price=0.40), broker=PaperBroker(queue_factor=1.0))
    assert result.portfolio.fills == 0


def test_reconnect_drops_books_and_resting_orders(tmp_path):
    path = write_journal(
        tmp_path,
        [
            market_record(),
            raw(snapshot("t", 0.45, 0.55)),
            {"kind": "reconnected", "n": 1},
            raw(snapshot("t", 0.30, 0.39)),
        ],
    )
    result = run_replay([path], AlwaysBuy(price=0.40), broker=PaperBroker(queue_factor=1.0))

    assert result.reconnects == 1
    # The order placed before the drop is gone, so the move through 0.40
    # cannot fill it.
    assert result.portfolio.fills == 0


def test_risk_halt_stops_further_quoting(tmp_path):
    records = [market_record(), raw(snapshot("t", 0.45, 0.55))]
    records += [raw(snapshot("t", 0.30, 0.39)) for _ in range(4)]
    path = write_journal(tmp_path, records)

    risk = RiskManager(RiskLimits(max_loss=0.01, max_order_size=1000))
    result = run_replay([path], AlwaysBuy(price=0.40, size=100), risk=risk,
                        broker=PaperBroker(queue_factor=1.0))

    assert result.risk.halted
    assert "loss limit" in result.risk.halt_reason


def test_multiple_journals_replay_in_order(tmp_path):
    a = write_journal(tmp_path, [market_record(), raw(snapshot("t", 0.45, 0.55))], "a.jsonl")
    b = write_journal(tmp_path, [raw(snapshot("t", 0.30, 0.39))], "b.jsonl")

    result = run_replay([a, b], AlwaysBuy(price=0.40), broker=PaperBroker(queue_factor=1.0))
    assert result.updates == 2
    assert result.portfolio.fills == 1


def test_non_book_records_are_ignored(tmp_path):
    path = write_journal(
        tmp_path,
        [
            market_record(),
            {"kind": "book", "label": "rain/Yes", "mid": 0.5},
            {"kind": "anomaly", "reason": "crossed"},
            raw({"event_type": "tick_size_change", "asset_id": "t"}),
        ],
    )
    result = run_replay([path], MakerStrategy())
    assert result.updates == 0
