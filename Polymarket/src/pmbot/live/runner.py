"""Drive a strategy against the live venue.

This is `replay.run_replay` with the simulator taken out. Compare them side
by side — that similarity is the deliverable:

    backtest:  book update -> match resting -> strategy -> risk -> broker
    live:      book update ->                  strategy -> risk -> broker
                                  ^
                       fills arrive here instead, from the venue

The middle step is the only structural difference. In a backtest the broker
guesses which orders would have filled; live, the exchange says so on the
private stream and `LiveBroker.on_private` applies it. Everything else —
the same `Strategy` object, the same `RiskManager`, the same intents, the
same ordering — is unchanged from phase 2.

## Going blind

The failure this file exists to handle is not a crash. It is the socket
dropping while orders are resting.

A backtest models a reconnect as: forget the book, forget your orders.
That is safe there because the orders are imaginary. Live, orders that you
have forgotten about are still working at the exchange, quoting a price you
chose against a book you can no longer see. A market can move a long way in
the seconds it takes to reconnect, and a stale quote is exactly what gets
picked off.

So on any disconnect — market feed or private feed — the runner cancels
everything and stops quoting until it has both streams back and has
reconciled against the venue over REST. Quoting less is always available;
quoting blind is not.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Sequence

from ..book import BookSet
from ..journal import Journal
from ..plan import WatchPlan
from ..portfolio import Portfolio
from ..risk import RiskManager
from ..strategy.base import Context, Strategy
from .broker import LiveBroker

log = logging.getLogger(__name__)


@dataclass
class LiveResult:
    updates: int = 0
    trades: int = 0
    executions: int = 0
    market_reconnects: int = 0
    private_reconnects: int = 0
    blind_periods: int = 0
    stopped_because: str = ""
    marks: dict[str, float | None] = field(default_factory=dict)
    portfolio: Portfolio = field(default_factory=Portfolio)
    risk: RiskManager = field(default_factory=RiskManager)

    @property
    def realized(self) -> float:
        return self.portfolio.realized

    @property
    def unrealized(self) -> float:
        return self.portfolio.unrealized(self.marks)

    @property
    def total_pnl(self) -> float:
        return self.realized + self.unrealized


async def _pump(
    stream: AsyncIterator[dict[str, Any]], tag: str, queue: asyncio.Queue
) -> None:
    """Forward one stream into the shared queue, tagged with its origin.

    Both sockets are merged into a single queue so there is exactly one
    place that mutates state. Handling them in two concurrent tasks would
    mean a fill and a book update could interleave halfway through a
    re-quote decision.
    """
    try:
        async for message in stream:
            await queue.put((tag, message))
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        await queue.put(("fatal", {"origin": tag, "error": str(exc), "exc": exc}))


async def run_live(
    plan: WatchPlan,
    strategy: Strategy,
    risk: RiskManager,
    broker: LiveBroker,
    market_stream: AsyncIterator[dict[str, Any]],
    private_stream: AsyncIterator[dict[str, Any]],
    journal: Journal,
    max_seconds: float | None = None,
    max_fills: int | None = None,
    slugs: Sequence[str] | None = None,
) -> LiveResult:
    result = LiveResult(portfolio=broker.portfolio, risk=risk)
    books = BookSet(slugs if slugs is not None else plan.slugs)

    queue: asyncio.Queue = asyncio.Queue(maxsize=4096)
    pumps = [
        asyncio.ensure_future(_pump(market_stream, "market", queue)),
        asyncio.ensure_future(_pump(private_stream, "private", queue)),
    ]

    # Quoting requires both streams up *and* a reconciled view. Start blind:
    # nothing is known until the venue has said so.
    market_up = False
    private_up = False

    async def go_blind(why: str) -> None:
        result.blind_periods += 1
        log.warning("going blind (%s): cancelling everything", why)
        journal.write("live_blind", {"reason": why})
        await broker.cancel_all(force=True)

    loop = asyncio.get_running_loop()
    deadline = loop.time() + max_seconds if max_seconds else None

    try:
        while True:
            if deadline is not None:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    result.stopped_because = "time limit reached"
                    break
                try:
                    tag, message = await asyncio.wait_for(queue.get(), timeout=remaining)
                except asyncio.TimeoutError:
                    result.stopped_because = "time limit reached"
                    break
            else:
                tag, message = await queue.get()

            if tag == "fatal":
                result.stopped_because = (
                    f"{message['origin']} stream failed: {message['error']}"
                )
                break

            event = str(message.get("event_type", ""))

            # -- private stream ----------------------------------------
            if tag == "private":
                if event == "_reconnected":
                    result.private_reconnects += 1
                    private_up = True
                    # The venue's snapshot arrives on the socket, but REST is
                    # what makes the *balance* current, and buying power
                    # gates every order.
                    broker.reconcile()
                    journal.write("private_reconnected", {"n": message.get("reconnects")})
                    continue
                if event == "_disconnected":
                    private_up = False
                    journal.write("private_disconnected", {"error": message.get("error")})
                    await go_blind("private feed dropped")
                    continue
                if event == "_error":
                    journal.write("private_error", {"error": message.get("error")})
                    continue

                result.executions += 1 if event == "execution" else 0
                journal.write("private", {"msg": message})
                broker.on_private(message)
                if max_fills is not None and broker.fills >= max_fills:
                    result.stopped_because = f"fill limit reached ({max_fills})"
                    break
                continue

            # -- market stream -----------------------------------------
            if event == "_reconnected":
                result.market_reconnects += 1
                market_up = True
                books.reset()
                broker.reconcile()
                journal.write("reconnected", {"n": message.get("reconnects")})
                continue
            if event == "_disconnected":
                market_up = False
                journal.write("disconnected", {"error": message.get("error")})
                await go_blind("market feed dropped")
                continue
            if event == "_error":
                journal.write("feed_error", {"error": message.get("error")})
                continue

            journal.write("raw", {"msg": message})

            if event == "trade":
                # Live, a print is information, not a fill. Ours come from
                # the private stream; inferring one here would double-count.
                result.trades += 1
                continue

            book = books.handle(message)
            if book is None:
                continue
            result.updates += 1

            for tracked in books.all():
                result.marks[tracked.token_id] = tracked.mid

            if not (market_up and private_up):
                # Book state is arriving again but the other half is not.
                # Track the market, quote nothing.
                continue

            ctx = Context(
                books=books,
                portfolio=broker.portfolio,
                resting=list(broker.resting.values()),
                updated_token=book.token_id,
                timestamp=book.last_timestamp,
            )
            intents = strategy.on_update(ctx)

            allowed = risk.filter(
                intents,
                broker.portfolio,
                result.marks,
                broker.resting_notional_by_token(),
            )
            await broker.apply(allowed)

            if risk.halted:
                result.stopped_because = f"risk halted: {risk.halt_reason}"
                await broker.cancel_all(force=True)
                break

    except asyncio.CancelledError:
        result.stopped_because = result.stopped_because or "cancelled"
        raise
    except KeyboardInterrupt:
        result.stopped_because = "interrupted"
    finally:
        for pump in pumps:
            pump.cancel()
        for pump in pumps:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await pump

        # A crash, a halt or a Ctrl-C must never leave orders resting.
        try:
            cancelled = await broker.cancel_all(force=True)
            if cancelled:
                log.info("cancelled %d resting order(s) on exit", cancelled)
        except Exception as exc:  # noqa: BLE001
            log.error("COULD NOT CANCEL ON EXIT — check the app now: %s", exc)
            journal.write("live_cleanup_failed", {"error": str(exc)})

    return result
