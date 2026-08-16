"""Tests for the plumbing check.

The live client is faked throughout: these prove the *safety rails* hold,
which is the only part that can be verified without a venue.
"""

import pytest

from pmbot.discovery import Market, Token
from pmbot.journal import Journal
from pmbot.live.checks import (
    PLUMBING_MAX_NOTIONAL,
    PLUMBING_MIN_NOTIONAL,
    resting_price,
    run_checks,
    size_for,
)
from pmbot.live.client import LiveClientError, WalletConfig

MARKET = Market(
    condition_id="0xrain",
    question="Will it rain?",
    slug="rain",
    tokens=(Token("t-yes", "Yes"), Token("t-no", "No")),
    closed=False,
)


class FakeClient:
    def __init__(self, book=None, fail_on=None, keeps_order=False):
        self.book = book or {
            "bids": [{"price": "0.45", "size": "100"}],
            "asks": [{"price": "0.55", "size": "100"}],
        }
        self.fail_on = fail_on
        self.keeps_order = keeps_order
        self.orders: dict[str, dict] = {}
        self.cancel_all_called = False
        self._n = 0

    def _maybe_fail(self, name):
        if self.fail_on == name:
            raise LiveClientError(f"simulated {name} failure")

    def connect(self):
        self._maybe_fail("connect")
        return "0xabc"

    def ok(self):
        return self.fail_on != "ok"

    def tick_size(self, token_id):
        return 0.01

    def order_book(self, token_id):
        return self.book

    def place_limit(self, token_id, side, price, size, tick_size):
        self._maybe_fail("place")
        self._n += 1
        oid = f"o{self._n}"
        self.orders[oid] = {"id": oid, "price": price, "size": size}
        return {"orderID": oid}

    def open_orders(self):
        return list(self.orders.values())

    def cancel(self, order_id):
        if not self.keeps_order:
            self.orders.pop(order_id, None)

    def cancel_all(self):
        self.cancel_all_called = True
        self.orders.clear()


def steps(run):
    return {s.name: s for s in run.steps}


# -- pure helpers ------------------------------------------------------


def test_resting_price_sits_well_below_the_touch():
    assert resting_price(0.45, 0.01) == pytest.approx(0.35)


def test_resting_price_never_goes_below_the_floor():
    assert resting_price(0.03, 0.01) >= 0.02


def test_resting_price_handles_an_empty_bid_side():
    assert resting_price(None, 0.01) == pytest.approx(0.40)


def test_size_clears_the_venue_minimum():
    price = 0.35
    assert size_for(price) * price >= PLUMBING_MIN_NOTIONAL


def test_size_refuses_to_exceed_the_hard_cap():
    """A market priced near $1 cannot be tested within the ceiling."""
    with pytest.raises(LiveClientError, match="cap"):
        size_for(PLUMBING_MAX_NOTIONAL + 0.5)


def test_size_rejects_a_nonsense_price():
    with pytest.raises(ValueError):
        size_for(0)


# -- the run ----------------------------------------------------------


def test_dry_run_never_constructs_a_client(tmp_path):
    def explode():
        raise AssertionError("dry run must not build a client")

    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "Yes", journal, client_factory=explode, dry_run=True)

    assert run.ok
    assert "DRY RUN" in steps(run)


def test_happy_path_posts_lists_and_cancels(tmp_path):
    fake = FakeClient()
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "Yes", journal, lambda: fake, dry_run=False)

    s = steps(run)
    assert run.ok
    assert s["post resting order"].ok
    assert s["order appears in open orders"].ok
    assert s["cancel removes the order"].ok
    assert fake.orders == {}


def test_order_is_journalled_before_it_is_sent(tmp_path):
    from pmbot.journal import replay

    with Journal(tmp_path, "lc") as journal:
        run_checks(MARKET, "Yes", journal, lambda: FakeClient(), dry_run=False)

    kinds = [r["kind"] for r in replay(next(tmp_path.glob("lc-*.jsonl")))]
    assert kinds.index("live_order_intent") < kinds.index("live_order_ack")


def test_closed_market_stops_before_any_client_call(tmp_path):
    closed = Market("0x", "q", "rain", MARKET.tokens, closed=True)

    def explode():
        raise AssertionError("must not connect for a closed market")

    with Journal(tmp_path, "lc") as journal:
        run = run_checks(closed, "Yes", journal, explode, dry_run=False)

    assert not run.ok
    assert not steps(run)["market is open"].ok


def test_failure_to_cancel_triggers_cleanup(tmp_path):
    """If the order survives cancel, cancel_all must run."""
    fake = FakeClient(keeps_order=True)
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "Yes", journal, lambda: fake, dry_run=False)

    assert not steps(run)["cancel removes the order"].ok
    assert fake.cancel_all_called
    assert fake.orders == {}


def test_connect_failure_is_reported_not_raised(tmp_path):
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(
            MARKET, "Yes", journal, lambda: FakeClient(fail_on="connect"), dry_run=False
        )
    assert not run.ok
    assert "simulated connect failure" in run.failed[0].detail


def test_place_failure_leaves_nothing_resting(tmp_path):
    fake = FakeClient(fail_on="place")
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "Yes", journal, lambda: fake, dry_run=False)

    assert not run.ok
    assert fake.orders == {}


def test_empty_book_aborts_before_ordering(tmp_path):
    fake = FakeClient(book={"bids": [], "asks": []})
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "Yes", journal, lambda: fake, dry_run=False)

    assert not steps(run)["read order book"].ok
    assert fake.orders == {}


def test_unknown_outcome_raises_before_connecting(tmp_path):
    from pmbot.discovery import DiscoveryError

    with Journal(tmp_path, "lc") as journal:
        with pytest.raises(DiscoveryError):
            run_checks(MARKET, "Maybe", journal, lambda: FakeClient(), dry_run=False)


# -- config ------------------------------------------------------------


def test_wallet_config_requires_a_key(monkeypatch):
    monkeypatch.delenv("PMBOT_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("PRIVATE_KEY", raising=False)
    with pytest.raises(LiveClientError, match="No private key"):
        WalletConfig.from_env()


def test_wallet_config_never_prints_the_key(monkeypatch):
    monkeypatch.setenv("PMBOT_PRIVATE_KEY", "0xsupersecretkey1234")
    config = WalletConfig.from_env()
    rendered = config.redacted()
    assert "supersecret" not in rendered
    assert rendered.endswith("1234") is False or "..." in rendered
