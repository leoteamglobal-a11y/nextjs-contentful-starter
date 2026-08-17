"""Collateral arithmetic, checked against the venue's published example.

The asymmetry here is the thing the agnostic risk layer cannot see: a short
at $0.40 ties up 1.5x what `|shares| x mark` says it does.
"""

import pytest

from pmbot.live import collateral


def test_matches_the_published_example():
    """Venue's table for a trade at $0.40, per contract."""
    assert collateral.long_cost(0.40, 1) == pytest.approx(0.40)
    assert collateral.short_cost(0.40, 1) == pytest.approx(0.60)


def test_a_short_costs_more_than_the_naive_exposure_figure():
    """The reason this module exists.

    `risk.py` would price a 100-contract short at $0.40 as $40 of exposure.
    The venue locks $100 of margin against $40 of proceeds: $60.
    """
    naive = 0.40 * 100
    real = collateral.short_cost(0.40, 100)
    assert real == pytest.approx(60.0)
    assert real / naive == pytest.approx(1.5)


def test_cheap_shorts_are_the_expensive_ones():
    """Shorting a long shot at $0.05 locks almost the full payout."""
    assert collateral.short_cost(0.05, 100) == pytest.approx(95.0)
    assert collateral.long_cost(0.05, 100) == pytest.approx(5.0)


def test_opening_cost_dispatches_on_side():
    assert collateral.opening_cost("BUY", 0.40, 10) == pytest.approx(4.0)
    assert collateral.opening_cost("sell", 0.40, 10) == pytest.approx(6.0)


# -- capacity ----------------------------------------------------------


def test_selling_what_you_hold_is_not_a_short():
    assert collateral.would_open_short(position=100, size=60) == 0.0
    assert collateral.would_open_short(position=100, size=100) == 0.0


def test_selling_past_zero_opens_a_short():
    assert collateral.would_open_short(position=40, size=100) == pytest.approx(60.0)
    assert collateral.would_open_short(position=0, size=100) == pytest.approx(100.0)
    assert collateral.would_open_short(position=-20, size=50) == pytest.approx(50.0)


def test_sell_capacity_counts_orders_already_resting():
    """A stack of small sells is still one big sell."""
    assert collateral.sell_capacity(position=100, resting_sell_size=0) == 100
    assert collateral.sell_capacity(position=100, resting_sell_size=70) == 30
    assert collateral.sell_capacity(position=100, resting_sell_size=100) == 0
    assert collateral.sell_capacity(position=100, resting_sell_size=150) == 0


def test_sell_capacity_of_a_short_position_is_zero():
    assert collateral.sell_capacity(position=-50, resting_sell_size=0) == 0


def test_buy_capacity_subtracts_what_is_already_reserved():
    """The venue reserves buying power when the order rests, not when it fills."""
    assert collateral.buy_capacity(100.0, 0.0, 0.50) == pytest.approx(200.0)
    assert collateral.buy_capacity(100.0, 60.0, 0.50) == pytest.approx(80.0)
    assert collateral.buy_capacity(100.0, 100.0, 0.50) == 0.0
    assert collateral.buy_capacity(100.0, 150.0, 0.50) == 0.0


def test_buy_capacity_of_a_free_price_is_refused_not_infinite():
    assert collateral.buy_capacity(100.0, 0.0, 0.0) == 0.0
