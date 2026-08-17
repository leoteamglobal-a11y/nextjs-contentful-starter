"""Tests for the plumbing check.

The live client is faked throughout: these prove the *safety rails* hold,
which is the only part that can be verified without a venue.
"""

import pytest

from pmbot.auth import AuthError
from pmbot.discovery import DiscoveryError, Market, Side
from pmbot.journal import Journal
from pmbot.live.checks import (
    PLUMBING_MAX_NOTIONAL,
    resting_price,
    run_checks,
    size_for,
)
from pmbot.live.client import (
    ClientConfig,
    LiveClientError,
    order_id_of,
    order_intent,
    price_amount,
    round_to_tick,
)

MARKET = Market(
    slug="rain",
    question="Will it rain?",
    active=True,
    closed=False,
    tick_size=0.01,
    min_qty=1.0,
    sides=(Side("Yes", long=True), Side("No", long=False)),
)


def venue_book(bids, offers):
    """A book in the venue's own shape, which is what the client returns."""
    return {
        "bids": [{"px": {"value": p, "currency": "USD"}, "qty": q} for p, q in bids],
        "offers": [{"px": {"value": p, "currency": "USD"}, "qty": q} for p, q in offers],
    }


class FakeClient:
    def __init__(self, book=None, fail_on=None, keeps_order=False):
        self.book = book if book is not None else venue_book(
            [("0.45", "100")], [("0.55", "100")]
        )
        self.fail_on = fail_on
        self.keeps_order = keeps_order
        self.orders: dict[str, dict] = {}
        self.cancel_all_called = False
        self.previewed = False
        self.placed: list[dict] = []
        self._n = 0

    def _maybe_fail(self, name):
        if self.fail_on == name:
            raise LiveClientError(f"simulated {name} failure")

    def connect(self):
        self._maybe_fail("connect")
        return "authenticated, buying power 70.0 USD"

    def ok(self):
        return self.fail_on != "ok"

    def tick_size(self, slug):
        return 0.01

    def order_book(self, slug):
        return self.book

    def preview_limit(self, slug, side, price, size, tick_size, *, long=True):
        self._maybe_fail("preview")
        self.previewed = True
        return {"estimatedCost": price * size}

    def place_limit(self, slug, side, price, size, tick_size, *, long=True, **kw):
        self._maybe_fail("place")
        assert self.previewed, "an order must be previewed before it is sent"
        self._n += 1
        oid = f"o{self._n}"
        self.orders[oid] = {"id": oid, "price": price, "size": size}
        self.placed.append(
            {"slug": slug, "side": side, "price": price, "size": size, "long": long}
        )
        return {"id": oid}

    def open_orders(self, slug=None):
        return list(self.orders.values())

    def cancel(self, order_id, slug):
        if not self.keeps_order:
            self.orders.pop(order_id, None)

    def cancel_all(self, slug=None):
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


def test_resting_price_snaps_to_the_market_tick():
    """The venue enforces the tick; an unsnapped price is just a reject."""
    assert resting_price(0.4567, 0.001) == pytest.approx(0.357, abs=1e-6)


def test_size_is_the_venue_minimum_quantity():
    """Whole contracts here, not a dollar floor like the international venue."""
    assert size_for(0.35) == 1.0


def test_size_refuses_to_exceed_the_hard_cap():
    """A market priced above the cap cannot be tested within it."""
    with pytest.raises(LiveClientError, match="cap"):
        size_for(PLUMBING_MAX_NOTIONAL + 0.5)


def test_size_rejects_a_nonsense_price():
    with pytest.raises(ValueError):
        size_for(0)


# -- order encoding ----------------------------------------------------


def test_intent_widens_buy_sell_into_the_four_venue_intents():
    assert order_intent("BUY", long=True) == "ORDER_INTENT_BUY_LONG"
    assert order_intent("SELL", long=True) == "ORDER_INTENT_SELL_LONG"
    assert order_intent("BUY", long=False) == "ORDER_INTENT_BUY_SHORT"
    assert order_intent("SELL", long=False) == "ORDER_INTENT_SELL_SHORT"


def test_intent_rejects_anything_else():
    with pytest.raises(LiveClientError):
        order_intent("HOLD")


def test_prices_go_over_the_wire_as_decimal_strings():
    """A float would send 0.30000000000000004 and be rejected on the tick."""
    assert price_amount(0.1 + 0.2) == {"value": "0.3000", "currency": "USD"}


def test_round_to_tick_matches_the_venues_grid():
    assert round_to_tick(0.5567, 0.001) == pytest.approx(0.557)
    assert round_to_tick(0.5567, 0.01) == pytest.approx(0.56)


def test_order_id_is_found_whatever_the_sdk_calls_it():
    assert order_id_of({"id": "o1"}) == "o1"
    assert order_id_of({"orderId": "o2"}) == "o2"
    assert order_id_of({}) is None
    assert order_id_of(None) is None


# -- the run ----------------------------------------------------------


def test_dry_run_never_constructs_a_client(tmp_path):
    def explode():
        raise AssertionError("dry run must not build a client")

    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, client_factory=explode, dry_run=True)

    assert run.ok
    assert "DRY RUN" in steps(run)


def test_happy_path_previews_posts_lists_and_cancels(tmp_path):
    fake = FakeClient()
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    s = steps(run)
    assert run.ok
    assert s["preview accepted"].ok
    assert s["post resting order"].ok
    assert s["order appears in open orders"].ok
    assert s["cancel removes the order"].ok
    assert fake.orders == {}


def test_the_order_never_crosses_the_spread(tmp_path):
    fake = FakeClient()
    with Journal(tmp_path, "lc") as journal:
        run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    (placed,) = fake.placed
    assert placed["price"] < 0.55  # strictly below the ask
    assert placed["price"] * placed["size"] <= PLUMBING_MAX_NOTIONAL


def test_the_requested_side_reaches_the_order(tmp_path):
    fake = FakeClient()
    with Journal(tmp_path, "lc") as journal:
        run_checks(MARKET, "No", journal, lambda: fake, dry_run=False)

    assert fake.placed[0]["long"] is False


def test_order_is_journalled_before_it_is_sent(tmp_path):
    from pmbot.journal import replay

    with Journal(tmp_path, "lc") as journal:
        run_checks(MARKET, "long", journal, lambda: FakeClient(), dry_run=False)

    kinds = [r["kind"] for r in replay(next(tmp_path.glob("lc-*.jsonl")))]
    assert kinds.index("live_order_intent") < kinds.index("live_order_ack")


def test_untradable_market_stops_before_any_client_call(tmp_path):
    """Active *and* closed is a real state the venue returns."""
    closed = Market(slug="rain", question="q", active=True, closed=True,
                    sides=MARKET.sides)

    def explode():
        raise AssertionError("must not connect for an untradable market")

    with Journal(tmp_path, "lc") as journal:
        run = run_checks(closed, "long", journal, explode, dry_run=False)

    assert not run.ok
    assert not steps(run)["market is tradable"].ok


def test_failure_to_cancel_triggers_cleanup(tmp_path):
    """If the order survives cancel, cancel_all must run."""
    fake = FakeClient(keeps_order=True)
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    assert not steps(run)["cancel removes the order"].ok
    assert fake.cancel_all_called
    assert fake.orders == {}


def test_connect_failure_is_reported_not_raised(tmp_path):
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(
            MARKET, "long", journal, lambda: FakeClient(fail_on="connect"),
            dry_run=False,
        )
    assert not run.ok
    assert "simulated connect failure" in run.failed[0].detail


def test_preview_failure_stops_before_a_real_order(tmp_path):
    fake = FakeClient(fail_on="preview")
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    assert not run.ok
    assert fake.orders == {}


def test_place_failure_leaves_nothing_resting(tmp_path):
    fake = FakeClient(fail_on="place")
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    assert not run.ok
    assert fake.orders == {}


def test_empty_book_aborts_before_ordering(tmp_path):
    fake = FakeClient(book=venue_book([], []))
    with Journal(tmp_path, "lc") as journal:
        run = run_checks(MARKET, "long", journal, lambda: fake, dry_run=False)

    assert not steps(run)["read order book"].ok
    assert fake.orders == {}


def test_unknown_side_raises_before_connecting(tmp_path):
    with Journal(tmp_path, "lc") as journal:
        with pytest.raises(DiscoveryError):
            run_checks(MARKET, "Maybe", journal, lambda: FakeClient(), dry_run=False)


# -- config ------------------------------------------------------------


def test_client_config_requires_credentials(monkeypatch):
    for name in (
        "POLYMARKET_KEY_ID",
        "POLYMARKET_SECRET_KEY",
        "PMBOT_KEY_ID",
        "PMBOT_SECRET_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(AuthError, match="No Polymarket US API credentials"):
        ClientConfig.from_env()


def test_client_config_never_prints_the_secret(monkeypatch):
    import base64

    secret = base64.b64encode(bytes(range(32))).decode()
    monkeypatch.setenv("POLYMARKET_KEY_ID", "key-abcdef123456")
    monkeypatch.setenv("POLYMARKET_SECRET_KEY", secret)
    rendered = ClientConfig.from_env().redacted()
    assert secret not in rendered
    assert "hidden" in rendered
