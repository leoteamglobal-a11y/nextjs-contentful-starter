"""Paper broker: resting orders and a deliberately unflattering fill model.

READ THIS BEFORE BELIEVING A BACKTEST.

Journals from phase 1 record the order book, not the trade tape. So a fill
has to be inferred, and every inference is an assumption you can get wrong
in your own favour. The rules here:

1. A resting BUY at price p fills only when the best ask drops to p or
   below — i.e. the market traded down through your quote. A SELL at p
   fills only when the best bid rises to p or above. Merely being at the
   top of the book fills nothing: someone has to come and take you.

2. Fill size is capped by the size actually available through your price.
   You cannot fill 100 shares against a 5-share sweep.

3. `queue_factor` haircuts every fill (default 0.5). You are not at the
   front of the queue — you are behind everyone already resting at that
   price, and on a venue with real market makers you are behind bots that
   requote faster than you. Setting this to 1.0 assumes perfect queue
   position and will flatter your results.

4. Fills are evaluated on the book state BEFORE the strategy reacts to it.
   Letting a strategy see a price and then fill at it is lookahead bias,
   and it is the single most common way a paper-trading P&L turns into a
   live loss.

What this model still gets wrong, in your favour:

- No latency. Real quotes arrive after a round trip, by which time the
  price has often moved.
- No partial-cancel races: here a cancel always succeeds, live it can lose
  to an incoming fill.
- Book-only inference misses trades that happen and revert between two
  snapshots.

The direction of every remaining error is optimistic. Treat a marginal
backtest as a losing one.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Callable

from .book import OrderBook
from .intents import CancelAll, CancelQuote, Intent, PlaceQuote
from .portfolio import Portfolio


@dataclass(frozen=True)
class Fill:
    order_id: str
    token_id: str
    side: str
    price: float
    size: float
    fee: float
    realized: float


@dataclass
class RestingOrder:
    order_id: str
    token_id: str
    side: str
    price: float
    size: float
    remaining: float

    @property
    def notional(self) -> float:
        return self.price * self.remaining


@dataclass
class PaperBroker:
    portfolio: Portfolio = field(default_factory=Portfolio)
    fee_bps: float = 0.0
    queue_factor: float = 0.5
    resting: dict[str, RestingOrder] = field(default_factory=dict)
    fills: list[Fill] = field(default_factory=list)

    #: Optional `(side, price, size) -> fee` override. Positive is a cost,
    #: negative is a rebate. `fee_bps` is used when this is None, so the
    #: default behaviour is unchanged.
    #:
    #: This hook exists because Polymarket US does not charge a rate on
    #: notional: its fee is `Θ × contracts × p × (1 - p)`, which is a
    #: different *shape*, not a different number — no value of `fee_bps`
    #: can express it at more than one price. See `pmbot.fees`.
    fee_model: Callable[[str, float, float], float] | None = None

    _ids: itertools.count = field(default_factory=lambda: itertools.count(1))

    def _fee(self, side: str, price: float, size: float) -> float:
        """Fee for one fill. Positive is a cost, negative is income."""
        if self.fee_model is not None:
            return self.fee_model(side, price, size)
        return price * size * (self.fee_bps / 10_000.0)

    # -- order management ----------------------------------------------

    def place(self, intent: PlaceQuote) -> RestingOrder:
        order_id = f"p{next(self._ids)}"
        order = RestingOrder(
            order_id=order_id,
            token_id=intent.token_id,
            side=intent.side,
            price=round(intent.price, 4),
            size=intent.size,
            remaining=intent.size,
        )
        self.resting[order_id] = order
        return order

    def cancel(self, order_id: str) -> bool:
        return self.resting.pop(order_id, None) is not None

    def cancel_all(self, token_id: str | None = None) -> int:
        victims = [
            oid
            for oid, o in self.resting.items()
            if token_id is None or o.token_id == token_id
        ]
        for oid in victims:
            del self.resting[oid]
        return len(victims)

    def apply(self, intents: list[Intent]) -> None:
        for intent in intents:
            if isinstance(intent, PlaceQuote):
                self.place(intent)
            elif isinstance(intent, CancelQuote):
                self.cancel(intent.order_id)
            elif isinstance(intent, CancelAll):
                self.cancel_all(intent.token_id)

    def resting_notional_by_token(self) -> dict[str, float]:
        out: dict[str, float] = {}
        for order in self.resting.values():
            out[order.token_id] = out.get(order.token_id, 0.0) + order.notional
        return out

    def orders_for(self, token_id: str) -> list[RestingOrder]:
        return [o for o in self.resting.values() if o.token_id == token_id]

    # -- matching ------------------------------------------------------

    def match(self, book: OrderBook) -> list[Fill]:
        """Fill any resting orders the book has traded through.

        Call this with the book state as it arrived, before the strategy
        sees it.
        """
        if book.is_crossed():
            # A crossed book is corrupt state, not an arbitrage. Filling
            # against it would manufacture free money that does not exist.
            return []

        filled: list[Fill] = []
        for order in list(self.orders_for(book.token_id)):
            available = self._size_through(book, order)
            if available <= 0:
                continue

            size = min(order.remaining, available * self.queue_factor)
            if size <= 1e-9:
                continue

            fee = self._fee(order.side, order.price, size)
            realized = self.portfolio.apply_fill(
                order.token_id, order.side, order.price, size, fee
            )
            fill = Fill(
                order_id=order.order_id,
                token_id=order.token_id,
                side=order.side,
                price=order.price,
                size=size,
                fee=fee,
                realized=realized,
            )
            filled.append(fill)
            self.fills.append(fill)

            order.remaining -= size
            if order.remaining <= 1e-9:
                del self.resting[order.order_id]

        return filled

    def match_trade(self, token_id: str, price: float, size: float) -> list[Fill]:
        """Fill resting orders that a printed trade would have taken.

        This is the fill path that actually matters for a maker. Book
        snapshots only reveal a fill when the market jumps clean through
        your quote, which for a quote resting outside the spread means
        essentially never — yet makers get filled constantly, because
        takers cross to them. Those crossings show up on the trade tape,
        not in the book.

        Price priority: a trade printed at p means anyone bidding at or
        above p should have been hit first. So a resting BUY at >= p fills,
        and a resting SELL at <= p fills — at their own price, since the
        taker crosses to the resting order.
        """
        if size <= 0:
            return []

        filled: list[Fill] = []
        budget = size * self.queue_factor

        for order in sorted(
            self.orders_for(token_id),
            key=lambda o: o.price,
            reverse=True,
        ):
            if budget <= 1e-9:
                break
            eligible = (
                order.price >= price if order.side == "BUY" else order.price <= price
            )
            if not eligible:
                continue

            fill_size = min(order.remaining, budget)
            if fill_size <= 1e-9:
                continue
            budget -= fill_size

            fee = self._fee(order.side, order.price, fill_size)
            realized = self.portfolio.apply_fill(
                order.token_id, order.side, order.price, fill_size, fee
            )
            fill = Fill(
                order_id=order.order_id,
                token_id=order.token_id,
                side=order.side,
                price=order.price,
                size=fill_size,
                fee=fee,
                realized=realized,
            )
            filled.append(fill)
            self.fills.append(fill)

            order.remaining -= fill_size
            if order.remaining <= 1e-9:
                del self.resting[order.order_id]

        return filled

    def _size_through(self, book: OrderBook, order: RestingOrder) -> float:
        """How much size traded through this order's price, if any."""
        if order.side == "BUY":
            # Someone is offering at or below what we bid.
            return sum(size for price, size in book.asks.items() if price <= order.price)
        return sum(size for price, size in book.bids.items() if price >= order.price)
