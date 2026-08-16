import pytest

from pmbot.book import BookSet, OrderBook
from pmbot.intents import CancelAll, PlaceQuote
from pmbot.portfolio import Portfolio
from pmbot.sim import RestingOrder
from pmbot.strategy import Context, MakerStrategy


def ctx(bids, asks, *, position=0.0, resting=(), token="t") -> Context:
    books = BookSet([token])
    books.get(token).apply_snapshot(
        {
            "bids": [{"price": str(p), "size": str(s)} for p, s in bids],
            "asks": [{"price": str(p), "size": str(s)} for p, s in asks],
        }
    )
    pf = Portfolio()
    if position:
        side = "BUY" if position > 0 else "SELL"
        pf.apply_fill(token, side, 0.5, abs(position))
    return Context(books=books, portfolio=pf, resting=list(resting), updated_token=token)


def quotes(intents):
    return {i.side: i for i in intents if isinstance(i, PlaceQuote)}


def test_quotes_both_sides_around_mid():
    strat = MakerStrategy(half_spread=0.05, size=50, min_edge=0.01)
    q = quotes(strat.on_update(ctx([(0.45, 100)], [(0.55, 100)])))

    assert q["BUY"].price == pytest.approx(0.45)
    assert q["SELL"].price == pytest.approx(0.55)
    assert q["BUY"].size == 50


def test_refuses_to_quote_when_spread_is_tighter_than_min_edge():
    strat = MakerStrategy(half_spread=0.05, min_edge=0.05)
    intents = strat.on_update(ctx([(0.50, 100)], [(0.51, 100)]))

    assert all(isinstance(i, CancelAll) for i in intents)
    assert "min_edge" in intents[0].reason


def test_no_mid_means_no_quotes():
    strat = MakerStrategy()
    intents = strat.on_update(ctx([(0.50, 100)], []))
    assert all(isinstance(i, CancelAll) for i in intents)


def test_crossed_book_means_no_quotes():
    strat = MakerStrategy()
    intents = strat.on_update(ctx([(0.70, 10)], [(0.30, 10)]))
    assert all(isinstance(i, CancelAll) for i in intents)


def test_long_inventory_skews_quotes_down():
    """Holding too much should make selling more attractive than buying."""
    strat = MakerStrategy(half_spread=0.05, max_inventory=100, inventory_skew=1.0)
    flat = quotes(strat.on_update(ctx([(0.40, 100)], [(0.60, 100)])))
    long = quotes(strat.on_update(ctx([(0.40, 100)], [(0.60, 100)], position=50)))

    assert long["SELL"].price < flat["SELL"].price
    assert long["BUY"].price < flat["BUY"].price


def test_at_max_inventory_only_the_reducing_side_is_quoted():
    strat = MakerStrategy(half_spread=0.05, max_inventory=100)
    q = quotes(strat.on_update(ctx([(0.40, 100)], [(0.60, 100)], position=100)))

    assert "BUY" not in q
    assert "SELL" in q


def test_quotes_never_cross_the_market():
    """A maker that quotes through the book is a taker paying the spread."""
    strat = MakerStrategy(half_spread=0.20, min_edge=0.01, tick=0.01)
    q = quotes(strat.on_update(ctx([(0.49, 100)], [(0.51, 100)])))

    assert q["BUY"].price <= 0.50
    assert q["SELL"].price >= 0.50
    assert q["BUY"].price < q["SELL"].price


def test_does_not_requote_when_target_barely_moved():
    strat = MakerStrategy(half_spread=0.05, requote_threshold=0.01)
    resting = [
        RestingOrder("p1", "t", "BUY", 0.45, 50, 50),
        RestingOrder("p2", "t", "SELL", 0.55, 50, 50),
    ]
    assert strat.on_update(ctx([(0.45, 10)], [(0.55, 10)], resting=resting)) == []


def test_requotes_when_the_market_moves_away():
    strat = MakerStrategy(half_spread=0.05, requote_threshold=0.01)
    resting = [
        RestingOrder("p1", "t", "BUY", 0.45, 50, 50),
        RestingOrder("p2", "t", "SELL", 0.55, 50, 50),
    ]
    intents = strat.on_update(ctx([(0.65, 10)], [(0.75, 10)], resting=resting))
    assert quotes(intents)


def test_prices_snap_to_the_tick():
    strat = MakerStrategy(half_spread=0.033, tick=0.01, min_edge=0.001)
    q = quotes(strat.on_update(ctx([(0.40, 10)], [(0.60, 10)])))
    for intent in q.values():
        assert intent.price == pytest.approx(round(intent.price, 2))
