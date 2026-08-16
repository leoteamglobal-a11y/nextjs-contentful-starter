import pytest

from pmbot.book import OrderBook
from pmbot.intents import CancelAll, CancelQuote, PlaceQuote
from pmbot.sim import PaperBroker


def book(bids, asks, token="t") -> OrderBook:
    b = OrderBook(token_id=token)
    b.apply_snapshot(
        {
            "bids": [{"price": str(p), "size": str(s)} for p, s in bids],
            "asks": [{"price": str(p), "size": str(s)} for p, s in asks],
        }
    )
    return b


def test_resting_bid_does_not_fill_while_market_stays_above():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.40, 100))

    assert broker.match(book([(0.41, 500)], [(0.45, 500)])) == []
    assert broker.portfolio.fills == 0


def test_bid_fills_when_market_trades_down_through_it():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.40, 100))

    fills = broker.match(book([(0.35, 500)], [(0.39, 500)]))

    assert len(fills) == 1
    assert fills[0].side == "BUY"
    assert fills[0].price == 0.40
    assert fills[0].size == 100
    assert not broker.resting


def test_ask_fills_when_market_trades_up_through_it():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "SELL", 0.60, 100))

    fills = broker.match(book([(0.61, 500)], [(0.65, 500)]))

    assert len(fills) == 1
    assert fills[0].side == "SELL"
    assert broker.portfolio.position("t").shares == -100


def test_fill_size_is_capped_by_available_size():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.40, 100))

    fills = broker.match(book([(0.30, 500)], [(0.39, 5)]))

    assert fills[0].size == pytest.approx(5)
    assert broker.resting  # the rest stays resting
    assert next(iter(broker.resting.values())).remaining == pytest.approx(95)


def test_queue_factor_haircuts_the_fill():
    broker = PaperBroker(queue_factor=0.5)
    broker.place(PlaceQuote("t", "BUY", 0.40, 100))

    fills = broker.match(book([(0.30, 500)], [(0.39, 40)]))

    assert fills[0].size == pytest.approx(20)


def test_crossed_book_never_fills():
    """A corrupt book is not free money."""
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("t", "BUY", 0.40, 100))

    assert broker.match(book([(0.70, 500)], [(0.30, 500)])) == []


def test_fees_are_charged_on_notional():
    broker = PaperBroker(queue_factor=1.0, fee_bps=100)  # 1%
    broker.place(PlaceQuote("t", "BUY", 0.50, 100))

    fills = broker.match(book([(0.30, 500)], [(0.49, 500)]))

    assert fills[0].fee == pytest.approx(0.5)
    assert broker.portfolio.fees_paid == pytest.approx(0.5)


def test_orders_on_other_tokens_are_untouched():
    broker = PaperBroker(queue_factor=1.0)
    broker.place(PlaceQuote("other", "BUY", 0.40, 100))

    assert broker.match(book([(0.30, 500)], [(0.39, 500)], token="t")) == []
    assert len(broker.resting) == 1


def test_apply_handles_every_intent_type():
    broker = PaperBroker()
    order = broker.place(PlaceQuote("t", "BUY", 0.4, 10))
    broker.apply([CancelQuote(order.order_id)])
    assert not broker.resting

    broker.apply([PlaceQuote("t", "BUY", 0.4, 10), PlaceQuote("u", "BUY", 0.4, 10)])
    broker.apply([CancelAll(token_id="t")])
    assert [o.token_id for o in broker.resting.values()] == ["u"]

    broker.apply([CancelAll()])
    assert not broker.resting


def test_resting_notional_by_token():
    broker = PaperBroker()
    broker.apply([PlaceQuote("t", "BUY", 0.50, 100), PlaceQuote("t", "SELL", 0.60, 100)])
    assert broker.resting_notional_by_token()["t"] == pytest.approx(110.0)
