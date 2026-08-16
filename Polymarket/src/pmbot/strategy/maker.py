"""Two-sided market making — "be the casino, not the gambler".

Quote a bid below mid and an ask above it, and earn the difference when
both sides fill. You take no view on the outcome; you get paid for
providing liquidity.

The catch, and the reason most naive versions lose money: your fills are
adversely selected. You get hit on the bid exactly when the market is
moving down, and lifted on the ask exactly when it is moving up. So you
systematically accumulate the wrong side. Two defences here, both cheap and
both essential:

- `min_edge`: refuse to quote when the market's own spread is already
  tighter than what you need to earn. If you are not paid for the risk,
  do not take it.
- `inventory_skew`: as inventory builds, shade both quotes against it, so
  the side that reduces your position is more attractive than the side
  that grows it. This is what stops a slow drift from becoming a large
  directional bet you never decided to make.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..intents import CancelAll, Intent, PlaceQuote
from .base import Context


@dataclass
class MakerStrategy:
    half_spread: float = 0.02
    size: float = 50.0
    min_edge: float = 0.01
    max_inventory: float = 200.0
    inventory_skew: float = 0.5
    requote_threshold: float = 0.005
    tick: float = 0.01
    name: str = "maker"

    def on_update(self, ctx: Context) -> list[Intent]:
        book = ctx.book
        token = ctx.updated_token
        mid = book.mid
        spread = book.spread

        # No mid means a one-sided or empty book: nothing to quote around.
        if mid is None or spread is None or book.is_crossed():
            return [CancelAll(token_id=token, reason="no reliable mid")]

        # The market is already tighter than our required edge. Quoting
        # inside it means paying for the privilege of being run over.
        if spread < self.min_edge:
            return [CancelAll(token_id=token, reason="spread below min_edge")]

        inventory = ctx.position(token)
        skew = 0.0
        if self.max_inventory > 0:
            skew = (
                -(inventory / self.max_inventory)
                * self.inventory_skew
                * self.half_spread
            )

        centre = mid + skew
        bid = self._round(centre - self.half_spread)
        ask = self._round(centre + self.half_spread)

        # Never quote through the market: that turns a maker into a taker.
        best_bid, best_ask = book.best_bid, book.best_ask
        if best_ask is not None:
            bid = min(bid, self._round(best_ask.price - self.tick))
        if best_bid is not None:
            ask = max(ask, self._round(best_bid.price + self.tick))
        if bid >= ask:
            return [CancelAll(token_id=token, reason="degenerate quotes")]

        existing = ctx.resting_for(token)
        if self._still_good(existing, bid, ask):
            return []

        intents: list[Intent] = [CancelAll(token_id=token, reason="requote")]

        # Stop adding to a position that is already at its cap; keep only the
        # side that reduces it.
        if inventory < self.max_inventory:
            intents.append(
                PlaceQuote(token, "BUY", bid, self.size, reason="maker bid")
            )
        if inventory > -self.max_inventory:
            intents.append(
                PlaceQuote(token, "SELL", ask, self.size, reason="maker ask")
            )
        return intents

    def _still_good(
        self, existing: list, bid: float, ask: float
    ) -> bool:
        """Avoid churning: only requote when the target moved meaningfully.

        Every requote is a cancel/replace round trip that costs latency and,
        live, loses queue position.
        """
        if not existing:
            return False
        by_side = {o.side: o for o in existing}
        if "BUY" not in by_side or "SELL" not in by_side:
            return False
        return (
            abs(by_side["BUY"].price - bid) < self.requote_threshold
            and abs(by_side["SELL"].price - ask) < self.requote_threshold
        )

    def _round(self, price: float) -> float:
        if self.tick <= 0:
            return round(price, 4)
        return round(round(price / self.tick) * self.tick, 4)
