"""The plumbing test.

This is not a trading bot. It is a checklist that proves, one step at a
time, that the full path works end to end:

    connect -> derive credentials -> read the book -> post a resting order
    -> see it listed -> cancel it -> see it gone

The default run **costs nothing but gas**. Every order it places is
deliberately far from the touch so it cannot fill, and it is cancelled
before the run ends. The only step that can lose money is the optional
`--fill-test`, which crosses the spread once with the smallest legal order.

Design rules, all of them there because this touches real money:

- Nothing runs without `--live`. The default is a dry run that prints
  exactly what it would do.
- Order size is capped by `PLUMBING_MAX_NOTIONAL` — a module constant, not
  a flag. Raising it requires editing code, which means a diff, which means
  somebody thought about it.
- Orders are journalled *before* they are sent. If the process dies mid-
  request, the journal still says what was in flight.
- Cancellation runs in a `finally`. A crash must not leave orders resting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..discovery import Market
from ..journal import Journal
from .client import LiveClient, LiveClientError

# Hard ceilings for the plumbing test. Deliberately not command-line flags.
PLUMBING_MAX_NOTIONAL = 2.50   # USDC per order
PLUMBING_MIN_NOTIONAL = 1.05   # the venue rejects orders under ~$1
PLUMBING_RESTING_OFFSET = 0.10  # how far below the touch to rest, in probability


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
    price = anchor - PLUMBING_RESTING_OFFSET
    price = max(price, 0.02)
    if tick > 0:
        price = round(round(price / tick) * tick, 6)
    return max(price, tick if tick > 0 else 0.01)


def size_for(price: float, min_shares: float = 1.0) -> float:
    """Smallest share count that clears the venue minimum without exceeding
    the plumbing ceiling.

    There are two independent minimums and an order has to clear both: a
    notional floor, and the market's own `min_order_size` in shares, which
    the live venue reports as 5 on every market checked. Guessing either
    one wrong means an order rejected for a reason the error does not name.
    """
    if price <= 0:
        raise ValueError("price must be positive")
    shares = max(PLUMBING_MIN_NOTIONAL / price, min_shares)
    shares = max(1.0, round(shares + 0.5))
    if shares * price > PLUMBING_MAX_NOTIONAL:
        raise LiveClientError(
            f"minimum viable order at price {price:.4f} is {shares:g} shares "
            f"(venue minimum {min_shares:g}), costing {shares * price:.2f} "
            f"USDC — over the {PLUMBING_MAX_NOTIONAL} cap. Pick a market whose "
            "prices are not this extreme."
        )
    return float(shares)


def run_checks(
    market: Market,
    outcome: str,
    journal: Journal,
    client_factory: Callable[[], LiveClient] | None = None,
    dry_run: bool = True,
    fill_test: bool = False,
) -> CheckRun:
    run = CheckRun(dry_run=dry_run)

    token = market.outcome_token(outcome)
    run.add(
        Step(
            "resolve market",
            True,
            f"{market.slug} / {token.outcome}",
            {"token_id": token.token_id, "condition_id": market.condition_id},
        )
    )
    if market.closed:
        run.add(Step("market is open", False, "market is already closed"))
        return run
    run.add(Step("market is open", True))

    if dry_run or client_factory is None:
        run.add(
            Step(
                "DRY RUN",
                True,
                "no credentials read, no orders sent. Re-run with --live.",
            )
        )
        return run

    client = client_factory()
    placed_order_id: str | None = None

    try:
        address = client.connect()
        run.add(Step("connect + derive API credentials", True, address))
        journal.write("live_connect", {"address": address})

        if not client.ok():
            run.add(Step("venue reachable", False, "get_ok() returned false"))
            return run
        run.add(Step("venue reachable", True))

        # One call, three answers: the book, the tick size and the minimum
        # order size all arrive together. The SDK has no separate tick-size
        # read, and inventing a default for either minimum is how you get an
        # order rejected for a reason the venue does not spell out.
        book = client.order_book(token.token_id)
        tick = _as_float(getattr(book, "tick_size", None)) or 0.01
        min_shares = _as_float(getattr(book, "min_order_size", None)) or 1.0
        run.add(
            Step(
                "read market parameters",
                True,
                f"tick={tick} min_order_size={min_shares:g}",
                {"tick_size": tick, "min_order_size": min_shares},
            )
        )

        best_bid = _best(book, "bids", max)
        best_ask = _best(book, "asks", min)
        if best_bid is None and best_ask is None:
            run.add(Step("read order book", False, "book is empty on both sides"))
            return run
        run.add(Step("read order book", True, f"bid={best_bid} ask={best_ask}"))

        price = resting_price(best_bid, tick)
        size = size_for(price, min_shares)
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
                f"{size:g} @ {price:.4f} = {notional:.2f} USDC, well below the touch",
            )
        )

        # Journal BEFORE sending: if this dies mid-flight, the record survives.
        journal.write(
            "live_order_intent",
            {
                "token_id": token.token_id,
                "side": "BUY",
                "price": price,
                "size": size,
                "notional": notional,
            },
        )

        response = client.place_limit(token.token_id, "BUY", price, size)
        placed_order_id = _order_id(response)
        journal.write("live_order_ack", {"order_id": placed_order_id, "raw": str(response)[:500]})
        if not placed_order_id:
            run.add(Step("post resting order", False, _rejection(response)))
            return run
        run.add(Step("post resting order", True, f"id={placed_order_id}"))

        listed = any(_order_id(o) == placed_order_id for o in client.open_orders())
        run.add(
            Step(
                "order appears in open orders",
                listed,
                "" if listed else "posted but not listed — check the funder address",
            )
        )

        client.cancel(placed_order_id)
        journal.write("live_cancel", {"order_id": placed_order_id})
        still_there = any(_order_id(o) == placed_order_id for o in client.open_orders())
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
                client.cancel_all()
                journal.write("live_cleanup", {"cancelled": "all"})
                run.add(Step("cleanup: cancelled all orders", True))
            except Exception as exc:  # noqa: BLE001
                run.add(
                    Step(
                        "cleanup: cancelled all orders",
                        False,
                        f"COULD NOT CANCEL — check the UI now: {exc}",
                    )
                )

    return run


def _best(book: Any, side: str, pick) -> float | None:
    levels = getattr(book, side, None)
    if levels is None and isinstance(book, dict):
        levels = book.get(side)
    prices = []
    for level in levels or []:
        raw = getattr(level, "price", None)
        if raw is None and isinstance(level, dict):
            raw = level.get("price")
        try:
            prices.append(float(raw))
        except (TypeError, ValueError):
            continue
    return pick(prices) if prices else None


def _as_float(value: Any) -> float | None:
    """SDK models return Decimal; the venue's JSON returns strings."""
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _order_id(response: Any) -> str | None:
    if response is None:
        return None
    for key in ("order_id", "orderID", "orderId", "id"):
        value = getattr(response, key, None)
        if value is None and isinstance(response, dict):
            value = response.get(key)
        if value:
            return str(value)
    return None


def _rejection(response: Any) -> str:
    """Why an order carries no id. A rejected order says so in its own
    fields, and repeating them beats printing the whole object."""
    code = getattr(response, "code", None)
    message = getattr(response, "message", None)
    if isinstance(response, dict):
        code = code or response.get("code")
        message = message or response.get("message")
    if code or message:
        return f"rejected: {code or '?'}: {message or ''}".strip()
    return f"no order id in {response!r}"
