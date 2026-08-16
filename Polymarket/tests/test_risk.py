import pytest

from pmbot.intents import CancelAll, CancelQuote, PlaceQuote
from pmbot.portfolio import Portfolio
from pmbot.risk import RiskLimits, RiskManager


def mgr(**kw) -> RiskManager:
    return RiskManager(RiskLimits(**kw))


def test_normal_order_passes():
    risk = mgr()
    out = risk.filter([PlaceQuote("t", "BUY", 0.5, 10)], Portfolio(), {"t": 0.5})
    assert len(out) == 1


def test_oversized_order_is_vetoed():
    risk = mgr(max_order_size=50)
    assert risk.filter([PlaceQuote("t", "BUY", 0.5, 100)], Portfolio(), {"t": 0.5}) == []
    assert risk.vetoes["order_too_large"] == 1


def test_price_outside_band_is_vetoed():
    risk = mgr(min_price=0.02, max_price=0.98)
    intents = [PlaceQuote("t", "BUY", 0.01, 10), PlaceQuote("t", "SELL", 0.99, 10)]
    assert risk.filter(intents, Portfolio(), {"t": 0.5}) == []
    assert risk.vetoes["price_out_of_band"] == 2


def test_position_limit_blocks_growing_but_allows_reducing():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.5, 100)
    risk = mgr(max_shares_per_token=100)

    grow = risk.filter([PlaceQuote("t", "BUY", 0.5, 10)], pf, {"t": 0.5})
    reduce = risk.filter([PlaceQuote("t", "SELL", 0.5, 10)], pf, {"t": 0.5})

    assert grow == []
    assert len(reduce) == 1


def test_exposure_limit_counts_resting_orders():
    risk = mgr(max_exposure=100)
    pf = Portfolio()
    out = risk.filter(
        [PlaceQuote("t", "BUY", 0.5, 100)],  # 50 notional
        pf,
        {"t": 0.5},
        resting_by_token={"t": 90.0},
    )
    assert out == []
    assert risk.vetoes["exposure_limit"] == 1


def test_cancellations_always_pass():
    risk = mgr(max_order_size=0)
    out = risk.filter([CancelQuote("p1"), CancelAll()], Portfolio(), {})
    assert len(out) == 2


def test_loss_limit_halts_and_flattens():
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.50, 100)
    risk = mgr(max_loss=10)

    out = risk.filter([PlaceQuote("t", "BUY", 0.4, 10)], pf, {"t": 0.30})

    assert risk.halted
    assert len(out) == 1 and isinstance(out[0], CancelAll)


def test_halt_is_sticky_even_after_recovery():
    """A limit you recover from automatically is not a limit."""
    pf = Portfolio()
    pf.apply_fill("t", "BUY", 0.50, 100)
    risk = mgr(max_loss=10)
    risk.filter([], pf, {"t": 0.30})
    assert risk.halted

    out = risk.filter([PlaceQuote("t", "BUY", 0.4, 10)], pf, {"t": 0.60})
    assert risk.halted
    assert isinstance(out[0], CancelAll)


def test_kill_switch_file_halts(tmp_path):
    switch = tmp_path / "STOP"
    risk = mgr(kill_switch_file=switch)
    pf = Portfolio()

    assert len(risk.filter([PlaceQuote("t", "BUY", 0.5, 10)], pf, {"t": 0.5})) == 1

    switch.write_text("stop")
    out = risk.filter([PlaceQuote("t", "BUY", 0.5, 10)], pf, {"t": 0.5})
    assert risk.halted
    assert isinstance(out[0], CancelAll)


def test_non_positive_size_is_vetoed():
    risk = mgr()
    assert risk.filter([PlaceQuote("t", "BUY", 0.5, 0)], Portfolio(), {"t": 0.5}) == []
    assert risk.vetoes["non_positive_size"] == 1


def test_summary_reports_counts():
    risk = mgr(max_order_size=1)
    risk.filter([PlaceQuote("t", "BUY", 0.5, 10)], Portfolio(), {"t": 0.5})
    summary = risk.summary()
    assert summary["total_vetoed"] == 1
    assert summary["halted"] is False
