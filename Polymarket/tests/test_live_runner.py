"""The live loop.

Both sockets are faked as plain async generators, so the whole runner —
merging, blindness handling, halting and cleanup — is exercised without a
network and without sleeping.

The property most of these defend: **the bot must never have orders resting
against a book it cannot see.**
"""

import asyncio

import pytest

from pmbot.discovery import Market, Side
from pmbot.intents import PlaceQuote
from pmbot.journal import Journal
from pmbot.live.broker import LiveBroker
from pmbot.live.runner import run_live
from pmbot.plan import build_plan
from pmbot.risk import RiskLimits, RiskManager

from test_live_broker import FakeClient

MARKET = Market(
    slug="mkt",
    question="Will it?",
    active=True,
    closed=False,
    tick_size=0.01,
    sides=(Side("Yes", long=True), Side("No", long=False)),
)
PLAN = build_plan([MARKET])


def book_message(bid=0.45, ask=0.55):
    return {
        "event_type": "book",
        "asset_id": "mkt",
        "bids": [{"price": bid, "size": 500}],
        "asks": [{"price": ask, "size": 500}],
        "timestamp": 1,
    }


async def timed(pairs):
    """Emit messages at explicit times, so the two sockets interleave the
    same way on every run.

    Both feeds are pumped concurrently into one queue, so without this the
    relative order of a book update and a balance update is up to the event
    loop — and half of what this file tests is ordering.
    """
    loop = asyncio.get_running_loop()
    start = loop.time()
    for at, message in pairs:
        wait = start + at - loop.time()
        if wait > 0:
            await asyncio.sleep(wait)
        yield message
    # Park rather than end: a real socket does not stop, and ending would
    # let the runner exit for the wrong reason.
    await asyncio.Event().wait()


#: The private stream comes up first in every test that expects quoting,
#: because the runner refuses to quote until it knows its buying power.
LIVE = [(0.00, {"event_type": "_reconnected", "reconnects": 0}),
        (0.01, {"event_type": "balance", "buying_power": 70.0})]


class QuotingStrategy:
    """Quotes one bid, every update. Enough to see orders reach the venue."""

    name = "test-quoter"

    def __init__(self):
        self.calls = 0

    def on_update(self, ctx):
        self.calls += 1
        return [PlaceQuote(ctx.updated_token, "BUY", 0.40, 1.0, reason="test")]


class SilentStrategy:
    name = "silent"

    def __init__(self):
        self.calls = 0

    def on_update(self, ctx):
        self.calls += 1
        return []


def make_broker(client=None):
    broker = LiveBroker(client=client or FakeClient(), clock=lambda: 0.0)
    broker.max_actions_per_second = 0
    return broker


async def drive(
    market_pairs, private_pairs, strategy=None, risk=None, broker=None,
    tmp_path=None, **kwargs
):
    strategy = strategy or QuotingStrategy()
    risk = risk or RiskManager(RiskLimits(max_order_size=1000, max_exposure=1e6))
    broker = broker or make_broker()
    with Journal(tmp_path, "live") as journal:
        result = await asyncio.wait_for(
            run_live(
                PLAN,
                strategy,
                risk,
                broker,
                timed(market_pairs),
                timed(private_pairs),
                journal,
                **kwargs,
            ),
            timeout=5,
        )
    return result, broker, strategy


UP = {"event_type": "_reconnected", "reconnects": 0}
BALANCE = {"event_type": "balance", "buying_power": 70.0}
DOWN = {"event_type": "_disconnected", "error": "boom"}


# -- the happy path ----------------------------------------------------


@pytest.mark.asyncio
async def test_a_book_update_reaches_the_venue_as_an_order(tmp_path):
    result, broker, _ = await drive(
        [(0.02, UP), (0.03, book_message())], LIVE,
        tmp_path=tmp_path, max_seconds=0.3,
    )
    assert result.updates == 1
    assert broker.client.placed
    assert broker.client.placed[0]["slug"] == "mkt"


@pytest.mark.asyncio
async def test_the_same_strategy_object_drives_both_brokers(tmp_path):
    """Phase 3b's whole claim: the strategy cannot tell which broker it has."""
    strategy = QuotingStrategy()
    await drive(
        [(0.02, UP), (0.03, book_message())], LIVE, strategy=strategy,
        tmp_path=tmp_path, max_seconds=0.3,
    )
    assert strategy.calls == 1

    from pmbot.book import BookSet
    from pmbot.sim import PaperBroker
    from pmbot.strategy.base import Context

    paper = PaperBroker()
    books = BookSet(["mkt"])
    books.handle(book_message())
    paper.apply(strategy.on_update(Context(books, paper.portfolio, [], "mkt", None)))
    assert len(paper.resting) == 1


# -- going blind -------------------------------------------------------


@pytest.mark.asyncio
async def test_nothing_is_quoted_before_both_streams_are_up(tmp_path):
    """A book update with no private stream must not produce an order."""
    result, broker, strategy = await drive(
        [(0.00, UP), (0.01, book_message())], [], tmp_path=tmp_path, max_seconds=0.2
    )
    assert result.updates == 1
    assert strategy.calls == 0
    assert broker.client.placed == []


@pytest.mark.asyncio
async def test_a_market_drop_cancels_everything(tmp_path):
    broker = make_broker()
    await drive(
        [(0.02, UP), (0.03, book_message()), (0.05, DOWN)], LIVE,
        broker=broker, tmp_path=tmp_path, max_seconds=0.3,
    )
    assert broker.client.cancel_all_calls
    assert broker.resting == {}


@pytest.mark.asyncio
async def test_a_private_drop_also_cancels_everything(tmp_path):
    """Blind to fills is as dangerous as blind to prices."""
    broker = make_broker()
    result, _, _ = await drive(
        [(0.02, UP), (0.03, book_message())],
        LIVE + [(0.05, DOWN)],
        broker=broker, tmp_path=tmp_path, max_seconds=0.3,
    )
    assert result.blind_periods >= 1
    assert broker.client.cancel_all_calls
    assert broker.resting == {}


@pytest.mark.asyncio
async def test_quoting_stops_while_blind_and_the_book_keeps_being_tracked(tmp_path):
    broker = make_broker()
    strategy = QuotingStrategy()
    result, _, _ = await drive(
        [
            (0.02, UP),
            (0.03, book_message()),
            (0.05, DOWN),
            (0.07, book_message(0.44, 0.54)),
            (0.09, book_message(0.43, 0.53)),
        ],
        LIVE,
        strategy=strategy, broker=broker, tmp_path=tmp_path, max_seconds=0.3,
    )
    # Books kept updating; the strategy was only consulted while sighted.
    assert result.updates == 3
    assert strategy.calls == 1


@pytest.mark.asyncio
async def test_reconnect_resets_the_book_and_reconciles(tmp_path):
    broker = make_broker()
    result, _, _ = await drive(
        [(0.02, UP), (0.03, book_message()), (0.05, DOWN), (0.07, UP)], LIVE,
        broker=broker, tmp_path=tmp_path, max_seconds=0.3,
    )
    assert result.market_reconnects == 2
    # reconcile() read the venue rather than trusting local state.
    assert broker.buying_power == 70.0


# -- fills come from the venue ----------------------------------------


def fill(size=1.0):
    return {
        "event_type": "execution",
        "exec_type": "EXECUTION_TYPE_FILL",
        "order_id": "o1",
        "token_id": "mkt",
        "side": "BUY",
        "price": 0.40,
        "size": size,
        "filled": True,
        "dead": False,
        "order": None,
    }


@pytest.mark.asyncio
async def test_a_trade_print_is_not_treated_as_a_fill(tmp_path):
    """Live, our fills arrive on the private stream. Inferring one double-counts."""
    result, broker, _ = await drive(
        [(0.02, UP),
         (0.03, {"event_type": "trade", "asset_id": "mkt", "price": 0.4, "size": 50})],
        LIVE, tmp_path=tmp_path, max_seconds=0.3,
    )
    assert result.trades == 1
    assert broker.fills == 0
    assert broker.portfolio.position("mkt").shares == 0


@pytest.mark.asyncio
async def test_a_reported_fill_moves_the_portfolio(tmp_path):
    _, broker, _ = await drive(
        [(0.02, UP)], LIVE + [(0.03, fill(2.0))],
        tmp_path=tmp_path, max_seconds=0.3,
    )
    assert broker.fills == 1
    assert broker.portfolio.position("mkt").shares == 2.0


# -- stopping ----------------------------------------------------------


@pytest.mark.asyncio
async def test_max_fills_stops_the_run(tmp_path):
    result, _, _ = await drive(
        [(0.02, UP)],
        LIVE + [(0.03, fill()), (0.04, fill()), (0.05, fill())],
        tmp_path=tmp_path, max_fills=2,
    )
    assert "fill limit" in result.stopped_because


@pytest.mark.asyncio
async def test_the_time_limit_stops_the_run(tmp_path):
    result, _, _ = await drive([(0.02, UP)], LIVE, tmp_path=tmp_path, max_seconds=0.1)
    assert "time limit" in result.stopped_because


@pytest.mark.asyncio
async def test_a_risk_halt_stops_and_flattens(tmp_path):
    risk = RiskManager(RiskLimits(max_loss=0.01, max_order_size=1000))
    broker = make_broker()
    # Book a loss big enough to trip the sticky halt.
    broker.portfolio.apply_fill("mkt", "BUY", 0.90, 10)

    result, _, _ = await drive(
        [(0.02, UP), (0.03, book_message())], LIVE,
        risk=risk, broker=broker, tmp_path=tmp_path, max_seconds=0.4,
    )
    assert risk.halted
    assert "risk halted" in result.stopped_because
    assert broker.client.cancel_all_calls


@pytest.mark.asyncio
async def test_orders_are_cancelled_on_exit_whatever_the_reason(tmp_path):
    broker = make_broker()
    await drive(
        [(0.02, UP), (0.03, book_message())], LIVE,
        broker=broker, tmp_path=tmp_path, max_seconds=0.15,
    )
    assert broker.client.cancel_all_calls
    assert broker.resting == {}


@pytest.mark.asyncio
async def test_a_dead_stream_is_reported_not_hidden(tmp_path):
    async def exploding():
        yield UP
        raise RuntimeError("socket died")

    broker = make_broker()
    with Journal(tmp_path, "live") as journal:
        result = await asyncio.wait_for(
            run_live(
                PLAN, SilentStrategy(), RiskManager(RiskLimits()), broker,
                exploding(), timed(LIVE), journal,
            ),
            timeout=5,
        )
    assert "socket died" in result.stopped_because
