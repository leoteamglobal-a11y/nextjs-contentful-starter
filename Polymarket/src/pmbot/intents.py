"""What a strategy is allowed to ask for.

A strategy never touches a broker, a client or a socket. It returns
intents — plain data describing what it wants — and something else decides
whether that happens. That boundary is what makes the same strategy object
runnable against a recorded journal, a paper broker, and (in phase 3) a
live venue, with no changes and no risk of a backtest accidentally reaching
the network.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union

Side = Literal["BUY", "SELL"]


@dataclass(frozen=True)
class PlaceQuote:
    """Rest a limit order at `price` for `size` shares."""

    token_id: str
    side: Side
    price: float
    size: float
    reason: str = ""

    @property
    def notional(self) -> float:
        return self.price * self.size


@dataclass(frozen=True)
class CancelQuote:
    order_id: str
    reason: str = ""


@dataclass(frozen=True)
class CancelAll:
    token_id: str | None = None
    reason: str = ""


Intent = Union[PlaceQuote, CancelQuote, CancelAll]
