"""The plumbing test.

This is not a trading bot. It is a checklist that proves, one step at a
time, that the full path works end to end:

    connect -> read the market -> read the book -> preview an order
    -> post a resting order -> see it listed -> cancel it -> see it gone

The default run **costs nothing at all**. Every order it places is
deliberately far from the touch so it cannot fill, and it is cancelled
before the run ends. On Polymarket US there are not even gas fees to lose,
because there is no chain: an unfilled, cancelled order costs zero.

Design rules, all of them there because this touches real money:

- Nothing runs without `--live`. The default is a dry run that prints
  exactly what it would do.
- Order size is capped by `PLUMBING_MAX_NOTIONAL` — a module constant, not
  a flag. Raising it requires editing code, which means a diff, which means
  somebody thought about it.
- The order is previewed before it is sent. The venue will tell you an
  order is malformed for free; there is no reason to learn it from a
  rejection.
- Orders are journalled *before* they are sent. If the process dies mid-
  request, the journal still says what was in flight.
- Cancellation runs in a `finally`. A crash must not leave orders resting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..discovery import Market
from ..journal import Journal
from .client import LiveClient, LiveClientError, order_id_of, round_to_tick

# Hard ceilings for the plumbing test. Deliberately not command-line flags.
PLUMBING_MAX_NOTIONAL = 2.50  # USD per order
PLUMBING_RESTING_OFFSET = 0.10  # how far below the touch to rest, in probability
PLUMBING_MIN_PRICE = 0.02


@dataclass
class Step:
    name: str
    ok: bool
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def render(self) -> str:
        mark = "PASS" if self.ok else "FAIL"
        return f"  [{mark}] {self.name}" + (f"  {self.detail}" if self.detail else "")


@dataclass
class CheckRun:
    steps: list[Step] = field(default_factory=list)
    dry_run: bool = True

    def add(self, step: Step) -> Step:
        self.steps.append(step)
        return step

    @property
    def ok(self) -> bool:
        return all(s.ok for s in self.steps)

    @property
    def failed(self) -> list[Step]:
        return [s for s in self.steps if not s.ok]


def resting_price(best_bid: float | None, tick: float) -> float:
    """A price far enough below the touch that it will not fill.

    The point of the resting-order step is to prove an order can be posted
    and cancelled, not to trade. Anything that might fill defeats it.
    """
    anchor = best_bid if best_bid is not None else 0.50
    price = max(anchor - PLUMBING_RESTING_OFFSET, PLUMBING_MIN_PRICE)
    price = round_to_tick(price, tick)
    return max(price, tick if tick > 0 else 0.01)


def size_for(price: float, min_qty: float = 1.0) -> float:
    """Smallest order the venue will accept, within the plumbing ceiling.

    Polymarket US trades whole contracts unless a market says otherwise
    (`minimumTradeQty`), so the floor is a quantity, not a dollar minimum
    like the international venue had.
    """
    if price <= 0:
        raise ValueError("price must be positive")
    quantity = max(min_qty, 1.0) if min_qty >= 1 else min_qty
    notional = quantity * price
    if notional > PLUMBING_MAX_NOTIONAL:
        raise LiveClientError(
            f"the smallest legal order at price {price:.4f} would cost "
            f"{notional:.2f} USD, over the {PLUMBING_MAX_NOTIONAL} cap. "
            "Pick a market whose prices are not this extreme."
        )
    return float(quantity)


def _best(book: dict[str, Any], key: str, pick) -> float | None:
    """Best price on one side of a venue order book."""
    prices: list[float] = []
    for level in book.get(key) or []:
        raw = level.get("px") if isinstance(level, dict) else None
        if isinstance(raw, dict):
            raw = raw.get("value")
        try:
            prices.append(float(raw))
        except (TypeError, ValueError):
            continue
    return pick(prices) if prices else None


def run_checks(
    market: Market,
    side_name: str,
    journal: Journal,
    client_factory: Callable[[], LiveClient] | None = None,
    dry_run: bool = True,
    fill_test: bool = False,
) -> CheckRun:
    run = CheckRun(dry_run=dry_run)

    side = market.side(side_name)
    run.add(
        Step(
            "resolve market",
            True,
            f"{market.slug} / {side} ({side.direction})",
            {"slug": market.slug, "long": side.long},
        )
    )

    if not market.tradable:
        run.add(
            Step(
                "market is tradable",
                False,
                f"active={market.active} closed={market.closed} "
                f"archived={market.archived}",
            )
        )
        return run
    run.add(Step("market is tradable", True))

    if dry_run or client_factory is None:
        run.add(
            Step(
                "DRY RUN",
                True,
                "no credentials used, no orders sent. Re-run with --live.",
            )
        )
        return run

    client = client_factory()
    placed_order_id: str | None = None

    try:
        who = client.connect()
        run.add(Step("connect + authenticate", True, who))
        journal.write("live_connect", {"detail": who})

        if not client.ok():
            run.add(Step("venue reachable", False, "market list call failed"))
            return run
        run.add(Step("venue reachable", True))

        tick = client.tick_size(market.slug)
        run.add(Step("read tick size", True, f"tick={tick}"))

        book = client.order_book(market.slug)
        best_bid = _best(book, "bids", max)
        best_ask = _best(book, "offers", min)
        if best_bid is None and best_ask is None:
            run.add(Step("read order book", False, "book is empty on both sides"))
            return run
        run.add(Step("read order book", True, f"bid={best_bid} ask={best_ask}"))

        price = resting_price(best_bid, tick)
        size = size_for(price, market.min_qty)
        notional = price * size

        if best_ask is not None and price >= best_ask:
            run.add(
                Step(
                    "resting price is safe",
                    False,
                    f"computed {price} would cross the ask at {best_ask}",
                )
            )
            return run
        run.add(
            Step(
                "resting price is safe",
                True,
                f"{size:g} @ {price:.4f} = {notional:.2f} USD, well below the touch",
            )
        )

        # Free, and it catches a malformed order before it can be rejected.
        preview = client.preview_limit(
            market.slug, "BUY", price, size, tick, long=side.long
        )
        run.add(Step("preview accepted", True, str(preview)[:120]))

        # Journal BEFORE sending: if this dies mid-flight, the record survives.
        journal.write(
            "live_order_intent",
            {
                "slug": market.slug,
                "side": "BUY",
                "long": side.long,
                "price": price,
                "size": size,
                "notional": notional,
            },
        )

        response = client.place_limit(
            market.slug, "BUY", price, size, tick, long=side.long
        )
        placed_order_id = order_id_of(response)
        journal.write(
            "live_order_ack",
            {"order_id": placed_order_id, "raw": str(response)[:500]},
        )
        if not placed_order_id:
            run.add(Step("post resting order", False, f"no order id in {response!r}"))
            return run
        run.add(Step("post resting order", True, f"id={placed_order_id}"))

        listed = any(
            order_id_of(o) == placed_order_id
            for o in client.open_orders(market.slug)
        )
        run.add(
            Step(
                "order appears in open orders",
                listed,
                "" if listed else "posted but not listed — check the order state",
            )
        )

        client.cancel(placed_order_id, market.slug)
        journal.write("live_cancel", {"order_id": placed_order_id})
        still_there = any(
            order_id_of(o) == placed_order_id
            for o in client.open_orders(market.slug)
        )
        run.add(Step("cancel removes the order", not still_there))
        if not still_there:
            placed_order_id = None

        if fill_test:
            run.add(
                Step(
                    "fill test",
                    False,
                    "not implemented: crossing the spread costs money and is "
                    "only worth doing once the steps above all pass",
                )
            )

    except LiveClientError as exc:
        run.add(Step("live call", False, str(exc)))
    except Exception as exc:  # noqa: BLE001
        run.add(Step("unexpected error", False, f"{type(exc).__name__}: {exc}"))
    finally:
        # A crash must never leave an order resting on the book.
        if placed_order_id is not None:
            try:
                client.cancel_all(market.slug)
                journal.write("live_cleanup", {"cancelled": market.slug})
                run.add(Step("cleanup: cancelled all orders", True))
            except Exception as exc:  # noqa: BLE001
                run.add(
                    Step(
                        "cleanup: cancelled all orders",
                        False,
                        f"COULD NOT CANCEL — check the app now: {exc}",
                    )
                )

    return run
