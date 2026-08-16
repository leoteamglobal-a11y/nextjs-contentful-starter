import pytest

from pmbot.portfolio import Portfolio, Position


def test_buy_then_sell_books_realized_pnl():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.40, 100)
    pf.apply_fill("t", "SELL", 0.45, 100)

    assert pf.realized == pytest.approx(5.0)
    assert pf.position("t").shares == 0
    assert pf.cash == pytest.approx(5.0)


def test_average_cost_across_multiple_buys():
    pos = Position("t")
    pos.apply("BUY", 0.40, 100)
    pos.apply("BUY", 0.60, 100)
    assert pos.avg_cost == pytest.approx(0.50)
    assert pos.shares == 200


def test_partial_close_leaves_rest_unrealized():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.40, 100)
    pf.apply_fill("t", "SELL", 0.50, 40)

    assert pf.realized == pytest.approx(4.0)
    assert pf.position("t").shares == 60
    assert pf.unrealized({"t": 0.50}) == pytest.approx(6.0)


def test_short_position_profits_when_price_falls():
    """Negative shares == holding the complementary token."""
    pf = Portfolio()
    pf.apply_fill("t", "SELL", 0.60, 100)
    assert pf.position("t").shares == -100
    assert pf.unrealized({"t": 0.50}) == pytest.approx(10.0)

    pf.apply_fill("t", "BUY", 0.50, 100)
    assert pf.realized == pytest.approx(10.0)


def test_flip_through_zero_reprices_the_remainder():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.40, 100)
    pf.apply_fill("t", "SELL", 0.50, 150)

    assert pf.realized == pytest.approx(10.0)
    pos = pf.position("t")
    assert pos.shares == -50
    assert pos.avg_cost == pytest.approx(0.50)


def test_fees_reduce_cash_and_are_tracked():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.50, 100, fee=0.25)
    assert pf.fees_paid == pytest.approx(0.25)
    assert pf.cash == pytest.approx(-50.25)


def test_equity_counts_cash_plus_marked_holdings():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.40, 100)
    assert pf.cash == pytest.approx(-40.0)
    assert pf.equity({"t": 0.40}) == pytest.approx(0.0)
    assert pf.equity({"t": 0.50}) == pytest.approx(10.0)


def test_exposure_uses_absolute_size():
    pf = Portfolio()
    pf.apply_fill("a", "BUY", 0.50, 100)
    pf.apply_fill("b", "SELL", 0.50, 100)
    assert pf.exposure({"a": 0.5, "b": 0.5}) == pytest.approx(100.0)


def test_unknown_mark_contributes_nothing():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.40, 100)
    assert pf.unrealized({"t": None}) == 0.0
    assert pf.unrealized({}) == 0.0
