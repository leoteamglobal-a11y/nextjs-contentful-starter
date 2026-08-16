"""Drive a strategy over a recorded journal.

The loop, and the order of its steps, is the whole thing:

    book update  ->  match resting orders  ->  strategy reacts  ->  risk
    vetoes  ->  broker applies what survived

Matching happens before the strategy sees the update. Reversing those two
lets a strategy act on a price and then be filled at it — lookahead bias,
and the reason so many paper P&Ls do not survive contact with a venue.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .book import BookSet
from .intents import CancelAll
from .journal import replay as replay_journal
from .portfolio import Portfolio
from .risk import RiskManager
from .sim import Fill, PaperBroker
from .strategy.base import Context, Strategy


TRADE_EVENTS = {"last_trade_price", "trade"}


def _as_trade(message: dict[str, Any]) -> tuple[str, float, float] | None:
    """Extract (token_id, price, size) from a trade print, if this is one."""
    if str(message.get("event_type", "")).lower() not in TRADE_EVENTS:
        return None
    token_id = message.get("asset_id") or message.get("token_id")
    if not token_id:
        return None
    try:
        price = float(message["price"])
    except (KeyError, TypeError, ValueError):
        return None
    try:
        size = float(message.get("size", 0) or 0)
    except (TypeError, ValueError):
        size = 0.0
    if size <= 0:
        # `last_trade_price` does not always carry a size. Without one there
        # is no defensible fill quantity, so the print is recorded and
        # skipped rather than guessed at.
        return None
    return str(token_id), price, size


@dataclass
class ReplayResult:
    messages: int = 0
    updates: int = 0
    trades: int = 0
    reconnects: int = 0
    fills: list[Fill] = field(default_factory=list)
    labels: dict[str, str] = field(default_factory=dict)
    portfolio: Portfolio = field(default_factory=Portfolio)
    risk: RiskManager = field(default_factory=RiskManager)
    marks: dict[str, float | None] = field(default_factory=dict)

    @property
    def realized(self) -> float:
        return self.portfolio.realized

    @property
    def unrealized(self) -> float:
        return self.portfolio.unrealized(self.marks)

    @property
    def total_pnl(self) -> float:
        return self.realized + self.unrealized - 0.0

    def label(self, token_id: str) -> str:
        return self.labels.get(token_id, token_id[:12])


def iter_messages(paths: Iterable[Path]) -> Iterable[dict[str, Any]]:
    """Yield journal records across files, in file order."""
    for path in paths:
        yield from replay_journal(Path(path))


def run_replay(
    paths: Iterable[Path],
    strategy: Strategy,
    risk: RiskManager | None = None,
    broker: PaperBroker | None = None,
) -> ReplayResult:
    broker = broker or PaperBroker()
    risk = risk or RiskManager()
    result = ReplayResult(portfolio=broker.portfolio, risk=risk)
    books = BookSet()

    for record in iter_messages(paths):
        kind = str(record.get("kind"))

        if kind == "market":
            for token in record.get("tokens") or []:
                tid = str(token.get("token_id"))
                slug = record.get("slug") or record.get("condition_id", "")[:10]
                result.labels[tid] = f"{slug}/{token.get('outcome')}"
            continue

        if kind == "reconnected":
            # The live bot cannot trust its book or its resting orders after
            # a drop, so neither may the backtest. Modelling the reconnect as
            # free continuity would hide a real source of loss.
            result.reconnects += 1
            books.reset()
            broker.cancel_all()
            continue

        if kind != "raw":
            continue

        message = record.get("msg")
        if not isinstance(message, dict):
            continue
        result.messages += 1

        # A printed trade is the main way a resting quote gets filled, so it
        # is handled before anything else. It carries no book state, hence
        # the early continue.
        trade = _as_trade(message)
        if trade is not None:
            token_id, price, size = trade
            result.trades += 1
            result.fills.extend(broker.match_trade(token_id, price, size))
            continue

        book = books.handle(message)
        if book is None:
            continue
        result.updates += 1

        # 1. Fills happen against the book as it arrived.
        result.fills.extend(broker.match(book))

        # 2. Marks refresh before risk reads them.
        for tracked in books.all():
            result.marks[tracked.token_id] = tracked.mid

        # 3. Strategy reacts.
        ctx = Context(
            books=books,
            portfolio=broker.portfolio,
            resting=list(broker.resting.values()),
            updated_token=book.token_id,
            timestamp=book.last_timestamp,
        )
        intents = strategy.on_update(ctx)

        # 4. Risk vetoes, 5. broker applies the survivors.
        allowed = risk.filter(
            intents,
            broker.portfolio,
            result.marks,
            broker.resting_notional_by_token(),
        )
        broker.apply(allowed)

        if risk.halted:
            broker.apply([CancelAll(reason=risk.halt_reason)])

    return result
