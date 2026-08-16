"""Positions, cash and P&L.

Share accounting uses a weighted-average cost basis, so realised P&L is
booked when a position is reduced and the rest stays unrealised.

A note on negative positions. Polymarket has no short selling: you cannot
sell a YES share you do not hold. But YES + NO always settles to exactly
$1, so being short 100 YES is economically identical to holding 100 NO
funded with $100 of collateral — which is precisely how the venue
implements it, by splitting and merging the collateral pair. A negative
number here therefore means "the complementary token", not a borrow. It is
still real exposure and still consumes collateral, which is why `exposure`
sums absolute values.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Position:
    token_id: str
    shares: float = 0.0
    avg_cost: float = 0.0  # per share, in USDC
    realized: float = 0.0

    def apply(self, side: str, price: float, size: float) -> float:
        """Book a fill. Returns realised P&L from this fill alone."""
        signed = size if side == "BUY" else -size
        realized_now = 0.0

        opening = self.shares == 0 or (self.shares > 0) == (signed > 0)
        if opening:
            total = self.shares + signed
            if total != 0:
                self.avg_cost = (
                    self.avg_cost * self.shares + price * signed
                ) / total
            self.shares = total
        else:
            closing = min(abs(signed), abs(self.shares))
            direction = 1.0 if self.shares > 0 else -1.0
            realized_now = (price - self.avg_cost) * closing * direction
            self.realized += realized_now
            self.shares += signed
            if abs(self.shares) < 1e-9:
                self.shares = 0.0
                self.avg_cost = 0.0
            elif (self.shares > 0) != (direction > 0):
                # Flipped through zero: the remainder opens at fill price.
                self.avg_cost = price

        return realized_now

    def unrealized(self, mark: float | None) -> float:
        if mark is None or self.shares == 0:
            return 0.0
        return (mark - self.avg_cost) * self.shares


@dataclass
class Portfolio:
    cash: float = 0.0
    positions: dict[str, Position] = field(default_factory=dict)
    fees_paid: float = 0.0
    fills: int = 0
    volume: float = 0.0

    def position(self, token_id: str) -> Position:
        pos = self.positions.get(token_id)
        if pos is None:
            pos = Position(token_id=token_id)
            self.positions[token_id] = pos
        return pos

    def apply_fill(
        self, token_id: str, side: str, price: float, size: float, fee: float = 0.0
    ) -> float:
        notional = price * size
        self.cash += -notional if side == "BUY" else notional
        self.cash -= fee
        self.fees_paid += fee
        self.fills += 1
        self.volume += notional
        return self.position(token_id).apply(side, price, size)

    @property
    def realized(self) -> float:
        return sum(p.realized for p in self.positions.values())

    def unrealized(self, marks: dict[str, float | None]) -> float:
        return sum(p.unrealized(marks.get(p.token_id)) for p in self.positions.values())

    def equity(self, marks: dict[str, float | None]) -> float:
        """Cash plus the mark value of every open position."""
        holdings = 0.0
        for pos in self.positions.values():
            mark = marks.get(pos.token_id)
            if mark is not None:
                holdings += pos.shares * mark
        return self.cash + holdings

    def exposure(self, marks: dict[str, float | None]) -> float:
        total = 0.0
        for pos in self.positions.values():
            mark = marks.get(pos.token_id)
            if mark is not None:
                total += abs(pos.shares) * mark
        return total

    def open_positions(self) -> list[Position]:
        return [p for p in self.positions.values() if p.shares != 0]
