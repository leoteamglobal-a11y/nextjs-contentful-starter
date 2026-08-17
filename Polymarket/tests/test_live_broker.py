"""The live broker: guards, fills, and reconciliation.

The client is faked throughout. What is being proved is that the broker
refuses what it should refuse and believes the venue over itself — the two
things that decide whether phase 3b loses money in a way a backtest never
could.
"""

import pytest

from pmbot.intents import CancelAll, CancelQuote, PlaceQuote
from pmbot.live.broker import LiveBroker
from pmbot.live.client import LiveClientError


class FakeClient:
    def __init__(self, fail_on=None, open_orders=None, buying_power=70.0):
        self.fail_on = fail_on
        self.placed: list[dict] = []
        self.cancelled: list[str] = []
        self.cancel_all_calls: list = []
        self._open_orders = open_orders or []
        self._buying_power = buying_power
        self._n = 0

    def _maybe_fail(self, name):
        if self.fail_on == name:
            raise LiveClientError(f"simulated {name} failure")

    def place_limit(self, slug, side, price, size, tick_size=0.01, *, long=True, **kw):
        self._maybe_fail("place")
        self._n += 1
        self.placed.append(
            {"slug": slug, "side": side, "price": price, "size": size, "long": long}
        )
        return {"id": f"o{self._n}"}

    def cancel(self, order_id, slug):
        self._maybe_fail("cancel")
        self.cancelled.append(order_id)

    def cancel_all(self, slug=None):
        self._maybe_fail("cancel_all")
        self.cancel_all_calls.append(slug)

    def balances(self):
        self._maybe_fail("balances")
        return {"buyingPower": self._buying_power, "currency": "USD"}

    def open_orders(self, slug=None):
        self._maybe_fail("open_orders")
        return list(self._open_orders)


def broker(**kwargs) -> LiveBroker:
    client = kwargs.pop("client", None) or FakeClient()
    b = LiveBroker(client=client, clock=lambda: 0.0, **kwargs)
    # A broker with no idea of its buying power refuses to buy, which is
    # correct but makes every test about something else. Most tests start
    # from "the venue has told us".
    b.buying_power = kwargs.pop("buying_power", 70.0)
    b.max_actions_per_second = 0  # rate limiting has its own tests
    return b


async def place(b, side="BUY", price=0.50, size=10.0, slug="mkt"):
    return await b.place(PlaceQuote(slug, side, price, size))


# -- buying power ------------------------------------------------------


@pytest.mark.asyncio
async def test_a_buy_is_capped_by_buying_power():
    b = broker()
    b.buying_power = 3.0
    await place(b, "BUY", price=0.50, size=100)
    # 3.0 / 0.50 = 6 contracts.
    assert b.client.placed[0]["size"] == 6.0


@pytest.mark.asyncio
async def test_resting_buys_consume_buying_power_before_it_fills():
    """The venue reserves at rest, so a second quote must see less."""
    b = broker()
    b.buying_power = 5.0
    await place(b, "BUY", price=0.50, size=6)  # 3.00 reserved
    b.client.placed.clear()
    await place(b, "BUY", price=0.50, size=100)
    assert b.client.placed[0]["size"] == 4.0  # (5.00 - 3.00) / 0.50


@pytest.mark.asyncio
async def test_no_buying_power_means_no_order():
    b = broker()
    b.buying_power = 0.0
    assert await place(b, "BUY") is None
    assert b.client.placed == []
    assert b.refusals["no_buying_power"] == 1


@pytest.mark.asyncio
async def test_unknown_buying_power_refuses_rather_than_assumes():
    """Before the venue has said, the honest answer is no."""
    b = broker()
    b.buying_power = None
    assert await place(b, "BUY") is None
    assert b.refusals["buying_power_unknown"] == 1


# -- the no-accidental-shorts rule -------------------------------------


@pytest.mark.asyncio
async def test_a_sell_with_no_inventory_is_refused():
    """Phase 3b never opens a short: short-side pricing is unverified."""
    b = broker()
    assert await place(b, "SELL", price=0.50, size=10) is None
    assert b.refusals["no_inventory_to_sell"] == 1


@pytest.mark.asyncio
async def test_a_sell_is_clamped_to_the_position_held():
    b = broker()
    b.portfolio.apply_fill("mkt", "BUY", 0.50, 4)
    await place(b, "SELL", price=0.60, size=100)
    assert b.client.placed[0]["size"] == 4.0


@pytest.mark.asyncio
async def test_resting_sells_count_against_the_position_too():
    b = broker()
    b.portfolio.apply_fill("mkt", "BUY", 0.50, 10)
    await place(b, "SELL", price=0.60, size=6)
    b.client.placed.clear()
    await place(b, "SELL", price=0.60, size=100)
    assert b.client.placed[0]["size"] == 4.0


@pytest.mark.asyncio
async def test_only_long_intents_are_ever_sent():
    b = broker()
    b.portfolio.apply_fill("mkt", "BUY", 0.50, 10)
    await place(b, "BUY", 0.50, 1)
    await place(b, "SELL", 0.60, 1)
    assert all(order["long"] for order in b.client.placed)
    assert b.intent_for("mkt", "BUY") == ("ORDER_INTENT_BUY_LONG", True)
    assert b.intent_for("mkt", "SELL") == ("ORDER_INTENT_SELL_LONG", True)


# -- notional caps -----------------------------------------------------


@pytest.mark.asyncio
async def test_per_order_notional_cap_applies():
    b = broker()
    b.max_order_notional = 2.0
    await place(b, "BUY", price=0.50, size=100)
    assert b.client.placed[0]["size"] == 4.0  # 2.00 / 0.50


@pytest.mark.asyncio
async def test_aggregate_resting_cap_applies():
    b = broker()
    b.max_order_notional = 100.0
    b.max_resting_notional = 5.0
    await place(b, "BUY", price=0.50, size=8)  # 4.00 resting
    b.client.placed.clear()
    await place(b, "BUY", price=0.50, size=100)
    assert b.client.placed[0]["size"] == 2.0  # (5.00 - 4.00) / 0.50


@pytest.mark.asyncio
async def test_a_full_book_of_resting_orders_refuses_more():
    b = broker()
    b.max_resting_notional = 1.0
    await place(b, "BUY", price=0.50, size=2)
    b.client.placed.clear()
    assert await place(b, "BUY", price=0.50, size=2) is None
    assert b.refusals["resting_notional_cap"] == 1


@pytest.mark.asyncio
async def test_fractional_contracts_round_down_never_up():
    b = broker()
    b.buying_power = 1.75
    await place(b, "BUY", price=0.50, size=100)
    assert b.client.placed[0]["size"] == 3.0  # 3.5 rounds down


@pytest.mark.asyncio
async def test_an_order_that_rounds_to_zero_is_not_sent():
    b = broker()
    b.buying_power = 0.40
    assert await place(b, "BUY", price=0.50, size=100) is None
    assert b.refusals["rounds_to_zero"] == 1


# -- rate limiting -----------------------------------------------------


@pytest.mark.asyncio
async def test_orders_are_rate_limited():
    now = [0.0]
    b = LiveBroker(client=FakeClient(), clock=lambda: now[0])
    b.buying_power = 70.0
    b.max_actions_per_second = 4.0  # one per 250ms

    await place(b, "BUY", 0.50, 1)
    assert len(b.client.placed) == 1

    now[0] = 0.1  # too soon
    await place(b, "BUY", 0.50, 1)
    assert len(b.client.placed) == 1
    assert b.refusals["rate_limited"] == 1

    now[0] = 0.5
    await place(b, "BUY", 0.50, 1)
    assert len(b.client.placed) == 2


@pytest.mark.asyncio
async def test_cancels_are_never_rate_limited():
    """Reducing exposure must not be something a guard can block."""
    now = [0.0]
    b = LiveBroker(client=FakeClient(), clock=lambda: now[0])
    b.buying_power = 70.0
    b.max_actions_per_second = 1.0
    await place(b, "BUY", 0.50, 1)
    order_id = next(iter(b.resting))

    await b.cancel(order_id)  # same instant, must still go through
    assert b.client.cancelled == [order_id]


# -- failures ----------------------------------------------------------


@pytest.mark.asyncio
async def test_a_rejected_order_is_not_recorded_as_resting():
    b = broker(client=FakeClient(fail_on="place"))
    assert await place(b) is None
    assert b.resting == {}
    assert b.refusals["venue_rejected"] == 1


@pytest.mark.asyncio
async def test_a_failed_cancel_keeps_the_order_locally():
    """Forgetting an order whose cancel failed is how a bot loses track."""
    b = broker()
    await place(b)
    order_id = next(iter(b.resting))
    b.client.fail_on = "cancel"

    assert await b.cancel(order_id) is False
    assert order_id in b.resting
    assert b.refusals["cancel_failed"] == 1


@pytest.mark.asyncio
async def test_a_failed_cancel_all_keeps_everything_locally():
    b = broker()
    await place(b)
    b.client.fail_on = "cancel_all"
    assert await b.cancel_all() == 0
    assert len(b.resting) == 1


# -- intents -----------------------------------------------------------


@pytest.mark.asyncio
async def test_apply_cancels_before_it_places():
    """Otherwise a requote briefly doubles the exposure it meant to replace."""
    b = broker()
    await place(b)
    order = list(b.resting.values())[0]
    b.client.placed.clear()

    await b.apply([PlaceQuote("mkt", "BUY", 0.45, 2), CancelAll(token_id="mkt")])

    assert b.client.cancel_all_calls == ["mkt"]
    assert order.order_id not in b.resting
    assert len(b.client.placed) == 1


@pytest.mark.asyncio
async def test_cancel_quote_is_routed():
    b = broker()
    await place(b)
    order_id = next(iter(b.resting))
    await b.apply([CancelQuote(order_id=order_id)])
    assert b.client.cancelled == [order_id]


# -- the venue talking back --------------------------------------------


def test_a_fill_updates_the_portfolio():
    b = broker()
    b.on_private(
        {
            "event_type": "execution",
            "exec_type": "EXECUTION_TYPE_FILL",
            "order_id": "o1",
            "token_id": "mkt",
            "side": "BUY",
            "price": 0.50,
            "size": 10.0,
            "filled": True,
            "dead": False,
            "order": None,
        }
    )
    assert b.fills == 1
    assert b.portfolio.position("mkt").shares == 10.0
    assert b.portfolio.cash == pytest.approx(-5.0)


def test_a_snapshot_replaces_local_state_rather_than_merging():
    """Anything missing from the venue's snapshot does not exist."""
    b = broker()
    b.resting["ghost"] = None  # something stale we invented
    b.on_private(
        {
            "event_type": "order_snapshot",
            "orders": [
                {
                    "order_id": "real",
                    "token_id": "mkt",
                    "side": "BUY",
                    "price": 0.5,
                    "size": 3.0,
                    "remaining": 3.0,
                    "state": "ORDER_STATE_PENDING_NEW",
                    "working": True,
                }
            ],
            "eof": True,
        }
    )
    assert set(b.resting) == {"real"}


def test_a_dead_execution_removes_the_order():
    b = broker()
    b.on_private(
        {
            "event_type": "execution",
            "exec_type": "EXECUTION_TYPE_CANCELED",
            "order_id": "o1",
            "token_id": "mkt",
            "side": "BUY",
            "price": 0.5,
            "size": None,
            "filled": False,
            "dead": True,
            "order": None,
        }
    )
    assert "o1" not in b.resting


def test_balance_updates_are_taken_from_the_venue():
    b = broker()
    b.on_private({"event_type": "balance", "buying_power": 42.5})
    assert b.buying_power == 42.5


# -- reconciliation ----------------------------------------------------


def test_reconcile_rebuilds_from_the_venue():
    client = FakeClient(
        buying_power=12.5,
        open_orders=[
            {
                "id": "venue-1",
                "marketSlug": "mkt",
                "side": "ORDER_SIDE_BUY",
                "price": {"value": "0.42", "currency": "USD"},
                "quantity": 5,
                "leavesQuantity": 3,
                "state": "ORDER_STATE_PARTIALLY_FILLED",
            }
        ],
    )
    b = broker(client=client)
    b.resting["stale"] = None

    b.reconcile()

    assert set(b.resting) == {"venue-1"}
    assert b.resting["venue-1"].remaining == 3.0
    assert b.buying_power == 12.5


def test_reconcile_survives_an_unreadable_venue():
    """A failed read must not silently empty the local view."""
    b = broker(client=FakeClient(fail_on="open_orders"))
    b.on_private(
        {
            "event_type": "order_snapshot",
            "orders": [
                {
                    "order_id": "keep",
                    "token_id": "mkt",
                    "side": "BUY",
                    "price": 0.5,
                    "size": 1.0,
                    "remaining": 1.0,
                    "state": "ORDER_STATE_PENDING_NEW",
                    "working": True,
                }
            ],
            "eof": True,
        }
    )
    b.reconcile()
    assert set(b.resting) == {"keep"}
