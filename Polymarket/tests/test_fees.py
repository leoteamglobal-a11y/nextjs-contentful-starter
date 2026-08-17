"""The fee schedule, checked against the venue's own published table.

Fees decide whether a market-making strategy exists at all, so these are
pinned to the numbers in docs.polymarket.us/fees rather than to the
formula — if the formula were transcribed wrong, testing it against itself
would prove nothing.
"""

import pytest

from pmbot import fees

# (price, taker pays per 100 contracts, maker receives per 100 contracts),
# transcribed from the published "Fee Schedule by Price" table.
TABLE = [
    (0.01, 0.06, 0.01),
    (0.03, 0.17, 0.04),
    (0.05, 0.28, 0.06),
    (0.10, 0.54, 0.11),
    (0.17, 0.85, 0.18),
    (0.18, 0.89, 0.18),
    (0.22, 1.03, 0.21),
    (0.25, 1.12, 0.23),
    (0.30, 1.26, 0.26),
    (0.35, 1.36, 0.28),
    (0.40, 1.44, 0.30),
    (0.50, 1.50, 0.31),
    (0.60, 1.44, 0.30),
    (0.65, 1.36, 0.28),
    (0.75, 1.12, 0.23),
    (0.90, 0.54, 0.11),
    (0.95, 0.28, 0.06),
    (0.99, 0.06, 0.01),
]


@pytest.mark.parametrize("price,taker,maker", TABLE)
def test_matches_the_published_table(price, taker, maker):
    assert fees.taker_fee(100, price) == pytest.approx(taker)
    assert fees.maker_rebate(100, price) == pytest.approx(maker)


@pytest.mark.parametrize(
    "contracts,price,taker,maker",
    [
        (1000, 0.10, -5.40, 1.12),
        (1000, 0.65, -13.65, 2.84),
        (1000, 0.30, -12.60, 2.62),
        (1000, 0.90, -5.40, 1.12),
        (1000, 0.50, -15.00, 3.12),
    ],
)
def test_matches_the_worked_examples(contracts, price, taker, maker):
    """The five examples in the docs, including their signs."""
    assert -fees.taker_fee(contracts, price) == pytest.approx(taker, abs=0.01)
    assert fees.maker_rebate(contracts, price) == pytest.approx(maker, abs=0.01)


def test_the_maker_rebate_is_income_not_a_cost():
    """The sign convention the whole P&L depends on."""
    assert fees.maker_fee(100, 0.50) < 0
    assert fees.maker_rebate(100, 0.50) > 0
    assert fees.taker_fee(100, 0.50) > 0


def test_fees_are_symmetric_around_the_midpoint():
    for price in (0.10, 0.25, 0.40):
        assert fees.taker_fee(100, price) == pytest.approx(
            fees.taker_fee(100, 1 - price)
        )


def test_fees_peak_at_the_coin_flip_and_collapse_at_the_extremes():
    """The shape that makes long shots cheap to trade and 50/50s expensive."""
    assert fees.taker_fee(100, 0.50) > fees.taker_fee(100, 0.25)
    assert fees.taker_fee(100, 0.25) > fees.taker_fee(100, 0.05)
    assert fees.taker_fee(100, 0.50) / fees.taker_fee(100, 0.05) > 5


def test_a_flat_bps_rate_cannot_represent_this_schedule():
    """Why `fee_bps` was not enough, stated as a test.

    The implied rate is theta x (1 - p). Anchor it at the midpoint and it
    is off by a factor of five at $0.90.
    """
    at_mid = fees.implied_bps(0.50)
    at_high = fees.implied_bps(0.90)
    assert at_mid == pytest.approx(-62.5)
    assert at_high == pytest.approx(-12.5)
    assert abs(at_mid / at_high) == pytest.approx(5.0)


def test_bankers_rounding_is_used():
    """Half-to-even, so many small fills do not drift the modelled cost."""
    assert fees.round_cents(0.025) == 0.02
    assert fees.round_cents(0.035) == 0.04
    assert fees.round_cents(0.015) == 0.02


def test_tiny_trades_can_round_to_nothing():
    """The docs' own answer to 'can fees ever be zero'."""
    assert fees.maker_fee(1, 0.50) == 0.0
    assert fees.taker_fee(1, 0.01) == 0.0


def test_no_contracts_means_no_fee():
    assert fees.taker_fee(0, 0.50) == 0.0
    assert fees.maker_fee(-5, 0.50) == 0.0


# -- the model callable -------------------------------------------------


def test_fee_model_roles():
    maker = fees.fee_model("maker")
    taker = fees.fee_model("taker")
    none = fees.fee_model("none")
    assert maker("BUY", 0.50, 100) < 0
    assert taker("BUY", 0.50, 100) > 0
    assert none("BUY", 0.50, 100) == 0.0


def test_fee_model_rejects_an_unknown_role():
    with pytest.raises(ValueError, match="maker, taker or none"):
        fees.fee_model("rebate")


def test_fee_model_plugs_into_the_paper_broker():
    """The integration that matters: a rebate must increase cash."""
    from pmbot.intents import PlaceQuote
    from pmbot.sim import PaperBroker

    broker = PaperBroker(fee_model=fees.fee_model("maker"), queue_factor=1.0)
    broker.place(PlaceQuote("mkt", "BUY", 0.50, 100))
    broker.match_trade("mkt", 0.50, 100)

    assert broker.portfolio.fills == 1
    # Cash = -(0.50 x 100) for the contracts, plus the $0.31 rebate.
    assert broker.portfolio.cash == pytest.approx(-50.0 + 0.31)
    assert broker.portfolio.fees_paid == pytest.approx(-0.31)


def test_default_paper_broker_behaviour_is_unchanged():
    """The fee hook is additive: `fee_bps` still works exactly as before."""
    from pmbot.intents import PlaceQuote
    from pmbot.sim import PaperBroker

    broker = PaperBroker(fee_bps=100.0, queue_factor=1.0)
    broker.place(PlaceQuote("mkt", "BUY", 0.50, 100))
    broker.match_trade("mkt", 0.50, 100)
    # 1% of 50 notional.
    assert broker.portfolio.fees_paid == pytest.approx(0.50)


# -- taker rebate tiers -------------------------------------------------


@pytest.mark.parametrize(
    "volume,rate",
    [
        (0, 0.0),
        (249_999, 0.0),
        (250_000, 0.10),
        (999_999, 0.10),
        (1_000_000, 0.25),
        (9_999_999, 0.25),
        (10_000_000, 0.50),
        (50_000_000, 0.50),
    ],
)
def test_taker_rebate_tiers(volume, rate):
    assert fees.taker_rebate_rate(volume) == rate
