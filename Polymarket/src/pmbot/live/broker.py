"""The live broker: the same interface as the paper one, real money behind it.

`PaperBroker` and `LiveBroker` present the same surface to everything above
them — `portfolio`, `resting`, `apply(intents)`, `cancel_all()`,
`resting_notional_by_token()`, `orders_for()`. That is the whole point of
phase 3b: the strategy and the risk layer are not modified, not subclassed
and not configured differently. They cannot tell which broker they are
talking to.

What is deliberately *not* mirrored is `match()` and `match_trade()`. Those
are the fill simulator, and live there is nothing to simulate: the exchange
reports what filled. `private.py` supplies those reports and `on_private()`
applies them.

## The three guards that exist only here

The agnostic `RiskManager` runs first and is unchanged. These sit *after*
it, because each encodes something about this venue that a venue-neutral
risk layer cannot know:

1. **Buying power.** `risk.py` measures exposure as `|shares| x mark`. This
   venue is fully collateralised and asymmetric — a short at $0.40 locks
   $1.00 of margin, so it consumes $0.60 of buying power, not $0.40. See
   `collateral.py`. Buying power is read from the venue, never computed.

2. **No accidental shorts.** A sell is clamped to the position actually
   held. This is a real restriction and the reasoning is in
   `intent_for()` — short-side pricing is the one thing in the API surface
   that could not be pinned down from the docs, and guessing it wrong
   places real orders at the wrong price.

3. **Rate.** 20 requests/second per key, shared with everything else. A
   maker requoting on every book update will blow through that during a
   fast market, and the venue's answer to that is to start rejecting.

Any of these three refusing is normal operation, not an error. They are
counted and reported, in the same shape as `RiskManager.summary()`.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from ..intents import CancelAll, CancelQuote, Intent, PlaceQuote
from ..portfolio import Portfolio
from ..sim import RestingOrder
from . import collateral
from .client import LiveClient, LiveClientError, order_id_of

log = logging.getLogger(__name__)

# Hard ceilings. Deliberately module constants and not command-line flags:
# raising one requires a diff, which requires somebody to think about it.
LIVE_MAX_ORDER_NOTIONAL = 5.00  # USD of buying power per single order
LIVE_MAX_RESTING_NOTIONAL = 20.00  # USD of buying power across all resting orders
LIVE_MAX_ACTIONS_PER_SECOND = 4.0  # order actions/s, well inside the 20 req/s cap


@dataclass
class LiveBroker:
    """Places real orders. Constructed only by the live runner."""

    client: LiveClient
    portfolio: Portfolio = field(default_factory=Portfolio)
    resting: dict[str, RestingOrder] = field(default_factory=dict)

    #: Venue-reported, never computed. `None` until the first balance arrives.
    buying_power: float | None = None

    max_order_notional: float = LIVE_MAX_ORDER_NOTIONAL
    max_resting_notional: float = LIVE_MAX_RESTING_NOTIONAL
    max_actions_per_second: float = LIVE_MAX_ACTIONS_PER_SECOND

    #: Injectable so the rate limiter is testable without sleeping.
    clock: Callable[[], float] = time.monotonic

    refusals: dict[str, int] = field(default_factory=dict)
    fills: int = 0
    orders_sent: int = 0
    orders_cancelled: int = 0
    journal: Any = None

    #: None until the first action. A zero default would compare against a
    #: clock that starts at zero and block the very first order.
    _last_action_at: float | None = None
    _snapshot_seen: bool = False

    # -- bookkeeping ---------------------------------------------------

    def _refuse(self, reason: str) -> None:
        self.refusals[reason] = self.refusals.get(reason, 0) + 1

    def _record(self, kind: str, payload: dict[str, Any]) -> None:
        if self.journal is not None:
            self.journal.write(kind, payload)

    def summary(self) -> dict[str, Any]:
        return {
            "orders_sent": self.orders_sent,
            "orders_cancelled": self.orders_cancelled,
            "fills": self.fills,
            "buying_power": self.buying_power,
            "resting": len(self.resting),
            "refusals": dict(sorted(self.refusals.items(), key=lambda kv: -kv[1])),
            "total_refused": sum(self.refusals.values()),
        }

    # -- reads, mirroring PaperBroker ----------------------------------

    def orders_for(self, token_id: str) -> list[RestingOrder]:
        return [o for o in self.resting.values() if o.token_id == token_id]

    def resting_notional_by_token(self) -> dict[str, float]:
        out: dict[str, float] = {}
        for order in self.resting.values():
            out[order.token_id] = out.get(order.token_id, 0.0) + order.notional
        return out

    def resting_size(self, token_id: str, side: str) -> float:
        return sum(
            o.remaining
            for o in self.resting.values()
            if o.token_id == token_id and o.side == side
        )

    def resting_buy_notional(self) -> float:
        return sum(o.notional for o in self.resting.values() if o.side == "BUY")

    # -- the venue-specific guards -------------------------------------

    def intent_for(self, token_id: str, side: str) -> tuple[str, bool]:
        """Pick the venue order intent, and whether it is a long-side order.

        Phase 3b sends **long-side intents only** — `BUY_LONG` to open or add,
        `SELL_LONG` to reduce. Both are unambiguously priced at the
        instrument's own price.

        The short intents are not sent, and the reason is worth recording
        rather than leaving as an omission. The API exposes `BUY_SHORT` /
        `SELL_SHORT` and the market data carries a `shortQuote` that is the
        complement of the long quote (`longPx` 0.0010 and `shortPx` 0.999 on
        a live market — they sum to 1). Whether a short order's `price` is
        quoted in long or short terms could not be established from the docs,
        and the two readings differ by `1 - p`: a mistake there does not fail,
        it fills at a wildly wrong price.

        So the bot never opens a short. `apply()` clamps sells to the position
        held. Once `live-check` has confirmed the convention with one small
        order, this is where that restriction lifts.
        """
        return ("ORDER_INTENT_BUY_LONG" if side == "BUY" else "ORDER_INTENT_SELL_LONG"), True

    def clamp(self, intent: PlaceQuote) -> tuple[float, str | None]:
        """Largest size this order may be, and why it was cut if it was.

        Returns `(0.0, reason)` when the order must not be sent at all.
        """
        size = intent.size
        token = intent.token_id

        if size <= 0 or intent.price <= 0:
            return 0.0, "non_positive"

        cost_per_contract = (
            collateral.long_cost(intent.price, 1.0)
            if intent.side == "BUY"
            else collateral.short_cost(intent.price, 1.0)
        )

        if intent.side == "SELL":
            # Never cross into a short: see intent_for().
            position = self.portfolio.position(token).shares
            capacity = collateral.sell_capacity(
                position, self.resting_size(token, "SELL")
            )
            if capacity <= 0:
                return 0.0, "no_inventory_to_sell"
            size = min(size, capacity)
        else:
            if self.buying_power is None:
                return 0.0, "buying_power_unknown"
            capacity = collateral.buy_capacity(
                self.buying_power, self.resting_buy_notional(), intent.price
            )
            if capacity <= 0:
                return 0.0, "no_buying_power"
            size = min(size, capacity)

        # Per-order ceiling.
        if cost_per_contract > 0:
            size = min(size, self.max_order_notional / cost_per_contract)

        # Aggregate ceiling across everything already resting.
        resting_total = sum(
            collateral.opening_cost(o.side, o.price, o.remaining)
            for o in self.resting.values()
        )
        headroom = self.max_resting_notional - resting_total
        if headroom <= 0:
            return 0.0, "resting_notional_cap"
        if cost_per_contract > 0:
            size = min(size, headroom / cost_per_contract)

        # Whole contracts. Rounding down is the only safe direction.
        size = float(int(size))
        if size <= 0:
            return 0.0, "rounds_to_zero"

        reason = "clamped" if size < intent.size else None
        return size, reason

    def _rate_limited(self) -> bool:
        """True if this action is coming too fast to send."""
        if self.max_actions_per_second <= 0:
            return False
        now = self.clock()
        if (
            self._last_action_at is not None
            and now - self._last_action_at < 1.0 / self.max_actions_per_second
        ):
            return True
        self._last_action_at = now
        return False

    # -- writes --------------------------------------------------------

    async def apply(self, intents: list[Intent]) -> None:
        """Send what survives the venue-specific guards.

        Cancellations are processed before placements, and are never rate
        limited or refused: reducing exposure must not be something a guard
        can block.
        """
        placements = []
        for intent in intents:
            if isinstance(intent, CancelAll):
                await self.cancel_all(intent.token_id)
            elif isinstance(intent, CancelQuote):
                await self.cancel(intent.order_id)
            elif isinstance(intent, PlaceQuote):
                placements.append(intent)

        for intent in placements:
            await self.place(intent)

    async def place(self, intent: PlaceQuote) -> RestingOrder | None:
        size, reason = self.clamp(intent)
        if size <= 0:
            self._refuse(reason or "refused")
            return None
        if self._rate_limited():
            self._refuse("rate_limited")
            return None
        if reason:
            self._refuse(reason)

        order_intent, long = self.intent_for(intent.token_id, intent.side)

        # Journal BEFORE sending. If this process dies mid-request the
        # journal still says what was in flight, which is the only way to
        # find out what to cancel by hand.
        self._record(
            "live_order_intent",
            {
                "slug": intent.token_id,
                "side": intent.side,
                "intent": order_intent,
                "price": intent.price,
                "size": size,
                "requested_size": intent.size,
                "reason": intent.reason,
            },
        )

        try:
            response = self.client.place_limit(
                intent.token_id,
                intent.side,
                intent.price,
                size,
                long=long,
            )
        except LiveClientError as exc:
            self._refuse("venue_rejected")
            self._record("live_order_error", {"error": str(exc)})
            log.warning("order rejected: %s", exc)
            return None

        order_id = order_id_of(response)
        self._record(
            "live_order_ack", {"order_id": order_id, "raw": str(response)[:500]}
        )
        if not order_id:
            self._refuse("no_order_id")
            return None

        self.orders_sent += 1
        order = RestingOrder(
            order_id=order_id,
            token_id=intent.token_id,
            side=intent.side,
            price=intent.price,
            size=size,
            remaining=size,
        )
        # Optimistic: the private stream will correct this with the venue's
        # own view within milliseconds. Recording it now means the next book
        # update does not re-quote on top of an order that already exists.
        self.resting[order_id] = order
        return order

    async def cancel(self, order_id: str) -> bool:
        order = self.resting.get(order_id)
        if order is None:
            return False
        try:
            self.client.cancel(order_id, order.token_id)
        except LiveClientError as exc:
            # Do not drop it locally: an order whose cancel failed is still
            # resting at the venue, and forgetting it here is how a bot ends
            # up with orders it does not know about.
            self._refuse("cancel_failed")
            self._record("live_cancel_error", {"order_id": order_id, "error": str(exc)})
            log.warning("cancel failed for %s: %s", order_id, exc)
            return False

        self.orders_cancelled += 1
        self.resting.pop(order_id, None)
        self._record("live_cancel", {"order_id": order_id})
        return True

    async def cancel_all(self, token_id: str | None = None, force: bool = False) -> int:
        """Cancel everything, or everything on one market.

        `force` sends the request even when the local view says there is
        nothing resting. The routine path skips that to save rate limit —
        the maker emits a `CancelAll` on most updates — but the safety paths
        (halting, going blind, exiting) always force, because the belief
        being acted on there is precisely "I think I have no orders", which
        is the belief most worth not trusting.
        """
        victims = [
            oid
            for oid, o in self.resting.items()
            if token_id is None or o.token_id == token_id
        ]
        if not victims and not force:
            return 0
        try:
            self.client.cancel_all(token_id)
        except LiveClientError as exc:
            self._refuse("cancel_all_failed")
            self._record("live_cancel_error", {"scope": token_id, "error": str(exc)})
            log.error("CANCEL ALL FAILED (%s) — check the app now: %s", token_id, exc)
            return 0

        for oid in victims:
            self.resting.pop(oid, None)
        self.orders_cancelled += len(victims)
        self._record("live_cancel_all", {"scope": token_id, "count": len(victims)})
        return len(victims)

    # -- the venue talking back ----------------------------------------

    def on_private(self, event: dict[str, Any]) -> None:
        """Apply one private-stream event. The venue is always right."""
        kind = event.get("event_type")

        if kind == "balance":
            power = event.get("buying_power")
            if power is not None:
                self.buying_power = float(power)
            return

        if kind == "order_snapshot":
            # Replace, never merge: the snapshot is the venue's complete list
            # of working orders, and anything local that is missing from it
            # does not exist.
            self.resting = {
                o["order_id"]: RestingOrder(
                    order_id=o["order_id"],
                    token_id=o["token_id"],
                    side=o["side"],
                    price=o["price"],
                    size=o["size"],
                    remaining=o["remaining"],
                )
                for o in event.get("orders") or []
            }
            self._snapshot_seen = True
            self._record("live_order_snapshot", {"count": len(self.resting)})
            return

        if kind != "execution":
            return

        order_id = str(event.get("order_id") or "")

        if event.get("filled"):
            slug = str(event.get("token_id") or "")
            side = str(event.get("side") or "")
            price = event.get("price")
            size = event.get("size")
            if slug and side and price is not None and size:
                # Fees are not carried on the execution; they land in the
                # balance ledger, and `buying_power` comes from the venue
                # rather than being derived here. So the portfolio's P&L is
                # gross of fees, and the balance is what is real.
                realized = self.portfolio.apply_fill(slug, side, price, size, 0.0)
                self.fills += 1
                self._record(
                    "live_fill",
                    {
                        "order_id": order_id,
                        "slug": slug,
                        "side": side,
                        "price": price,
                        "size": size,
                        "realized": realized,
                        "trade_id": event.get("trade_id"),
                    },
                )

        order = event.get("order")
        if order_id and isinstance(order, dict):
            if order.get("working") and order.get("remaining", 0) > 0:
                self.resting[order_id] = RestingOrder(
                    order_id=order_id,
                    token_id=order["token_id"],
                    side=order["side"],
                    price=order["price"],
                    size=order["size"],
                    remaining=order["remaining"],
                )
            else:
                self.resting.pop(order_id, None)
        elif event.get("dead") and order_id:
            self.resting.pop(order_id, None)

    # -- reconciliation ------------------------------------------------

    def reconcile(self) -> None:
        """Rebuild local state from the venue over REST.

        Called on startup and after any disconnect. Accumulated state across
        a gap is a guess; this is not. It costs two requests and removes the
        entire class of bug where the bot is confidently wrong about what it
        holds.
        """
        try:
            balances = self.client.balances()
            power = balances.get("buyingPower")
            if power is not None:
                self.buying_power = float(power)
        except (LiveClientError, TypeError, ValueError) as exc:
            log.warning("could not read balances: %s", exc)

        try:
            orders = self.client.open_orders()
        except LiveClientError as exc:
            log.warning("could not read open orders: %s", exc)
            return

        from .private import normalize_order

        rebuilt: dict[str, RestingOrder] = {}
        for raw in orders:
            normalized = normalize_order(raw)
            if normalized is None or not normalized["working"]:
                continue
            rebuilt[normalized["order_id"]] = RestingOrder(
                order_id=normalized["order_id"],
                token_id=normalized["token_id"],
                side=normalized["side"],
                price=normalized["price"],
                size=normalized["size"],
                remaining=normalized["remaining"],
            )

        if rebuilt != self.resting:
            log.info(
                "reconciled: %d local -> %d at venue", len(self.resting), len(rebuilt)
            )
        self.resting = rebuilt
        self._record("live_reconcile", {"resting": len(rebuilt), "buying_power": self.buying_power})
