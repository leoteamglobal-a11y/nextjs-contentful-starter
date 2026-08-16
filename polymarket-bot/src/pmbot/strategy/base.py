"""The strategy contract.

A strategy sees state and returns intents. It cannot place an order, cannot
reach the network, and cannot mutate the portfolio — those are somebody
else's job. Keeping it that narrow is what lets the same object run against
a journal today and a live venue later without a rewrite, and what makes it
testable by feeding it dictionaries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from ..book import BookSet, OrderBook
from ..intents import Intent
from ..portfolio import Portfolio
from ..sim import RestingOrder


@dataclass(frozen=True)
class Context:
    """Everything a strategy is allowed to know."""

    books: BookSet
    portfolio: Portfolio
    resting: list[RestingOrder]
    updated_token: str
    timestamp: int | None = None

    @property
    def book(self) -> OrderBook:
        """The book that just changed."""
        return self.books.get(self.updated_token)

    def position(self, token_id: str | None = None) -> float:
        return self.portfolio.position(token_id or self.updated_token).shares

    def resting_for(self, token_id: str) -> list[RestingOrder]:
        return [o for o in self.resting if o.token_id == token_id]


@runtime_checkable
class Strategy(Protocol):
    name: str

    def on_update(self, ctx: Context) -> list[Intent]:
        """React to one book update. Must be free of side effects."""
        ...
