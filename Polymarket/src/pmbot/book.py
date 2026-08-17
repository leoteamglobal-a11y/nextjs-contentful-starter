"""In-memory order book, rebuilt from the CLOB market feed.

Prices on Polymarket are probabilities in (0, 1) quoted in cents, and sizes
are share counts. A YES share pays $1 if the outcome happens, $0 otherwise,
so `mid` doubles as the market's implied probability.

Everything here is pure: it takes decoded messages and returns state. That
keeps it testable without a network, which matters because the exchange is
the one thing you cannot spin up locally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal

Side = Literal["BUY", "SELL"]


@dataclass(frozen=True)
class Level:
    price: float
    size: float


@dataclass
class OrderBook:
    """One side-pair of resting orders for a single outcome token."""

    token_id: str
    bids: dict[float, float] = field(default_factory=dict)
    asks: dict[float, float] = field(default_factory=dict)
    last_timestamp: int | None = None

    # -- reads ---------------------------------------------------------

    @property
    def best_bid(self) -> Level | None:
        if not self.bids:
            return None
        price = max(self.bids)
        return Level(price, self.bids[price])

    @property
    def best_ask(self) -> Level | None:
        if not self.asks:
            return None
        price = min(self.asks)
        return Level(price, self.asks[price])

    @property
    def spread(self) -> float | None:
        bid, ask = self.best_bid, self.best_ask
        if bid is None or ask is None:
            return None
        return round(ask.price - bid.price, 6)

    @property
    def mid(self) -> float | None:
        """Midpoint price, i.e. the market's implied probability."""
        bid, ask = self.best_bid, self.best_ask
        if bid is None or ask is None:
            return None
        return round((ask.price + bid.price) / 2, 6)

    def depth(self, side: Side, levels: int = 5) -> list[Level]:
        book = self.bids if side == "BUY" else self.asks
        prices = sorted(book, reverse=(side == "BUY"))[:levels]
        return [Level(p, book[p]) for p in prices]

    def is_crossed(self) -> bool:
        """True if the best bid is at or above the best ask.

        A real book should never be crossed. If this returns True your state
        has drifted and the only safe move is to resubscribe — never to trade
        on it.
        """
        bid, ask = self.best_bid, self.best_ask
        if bid is None or ask is None:
            return False
        return bid.price >= ask.price

    # -- writes --------------------------------------------------------

    def apply_snapshot(self, message: dict[str, Any]) -> None:
        """Replace the book wholesale from a `book` event."""
        self.bids = _levels_to_dict(message.get("bids") or message.get("buys") or [])
        self.asks = _levels_to_dict(message.get("asks") or message.get("sells") or [])
        self.last_timestamp = _as_int(message.get("timestamp"))

    def apply_price_change(self, message: dict[str, Any]) -> None:
        """Apply an incremental `price_change` event.

        A size of zero means the level is gone.

        The live venue batches one frame per *market*, carrying a
        `price_changes` list whose entries each name their own `asset_id`,
        so entries for other tokens are skipped here. Older recordings (and
        the synthetic journals) use a flat `changes` list with the asset id
        at the top level; both are accepted so old journals still replay.
        """
        for change in price_changes_for(message, self.token_id):
            side = str(change.get("side", "")).upper()
            book = self.bids if side == "BUY" else self.asks if side == "SELL" else None
            if book is None:
                continue
            try:
                price = float(change["price"])
                size = float(change["size"])
            except (KeyError, TypeError, ValueError):
                continue
            if size <= 0:
                book.pop(price, None)
            else:
                book[price] = size
        self.last_timestamp = _as_int(message.get("timestamp")) or self.last_timestamp

    def summary(self) -> dict[str, Any]:
        bid, ask = self.best_bid, self.best_ask
        return {
            "token_id": self.token_id,
            "best_bid": bid.price if bid else None,
            "best_bid_size": bid.size if bid else None,
            "best_ask": ask.price if ask else None,
            "best_ask_size": ask.size if ask else None,
            "spread": self.spread,
            "mid": self.mid,
            "crossed": self.is_crossed(),
            "timestamp": self.last_timestamp,
        }


class BookSet:
    """Every book the bot is watching, keyed by token id."""

    def __init__(self, token_ids: Iterable[str] = ()) -> None:
        self._token_ids = tuple(token_ids)
        self._books: dict[str, OrderBook] = {}
        self.reset()

    def reset(self) -> None:
        """Drop all book state, keeping the set of watched tokens.

        Called after a reconnect: increments missed while disconnected are
        unrecoverable, so every book must be rebuilt from a fresh snapshot
        rather than resumed.
        """
        self._books = {tid: OrderBook(token_id=tid) for tid in self._token_ids}

    def __contains__(self, token_id: str) -> bool:
        return token_id in self._books

    def __len__(self) -> int:
        return len(self._books)

    def get(self, token_id: str) -> OrderBook:
        book = self._books.get(token_id)
        if book is None:
            book = OrderBook(token_id=token_id)
            self._books[token_id] = book
        return book

    def all(self) -> list[OrderBook]:
        return list(self._books.values())

    def handle(self, message: dict[str, Any]) -> list[OrderBook]:
        """Route one decoded feed message to the book(s) it touches.

        Returns every book whose state changed — empty for messages that
        carry none (heartbeats, tick size changes, unknown future event
        types).

        A list rather than a single book because a live `price_change`
        frame is scoped to a *market*, not a token: one frame routinely
        carries changes for both the YES and the NO side, and an earlier
        version of this that returned one book silently dropped the rest.
        """
        event = str(message.get("event_type", "")).lower()

        if event == "book":
            token_id = message.get("asset_id") or message.get("token_id")
            if not token_id:
                return []
            book = self.get(str(token_id))
            book.apply_snapshot(message)
            return [book]

        if event == "price_change":
            touched = [self.get(tid) for tid in changed_token_ids(message)]
            for book in touched:
                book.apply_price_change(message)
            return touched

        return []


def _change_entries(message: dict[str, Any]) -> list[dict[str, Any]]:
    """The per-level entries of a `price_change`, under either key.

    Live: `price_changes`. Recorded fixtures and synthetic journals:
    `changes`. Nothing else about the entries differs.
    """
    raw = message.get("price_changes")
    if raw is None:
        raw = message.get("changes")
    return [entry for entry in (raw or []) if isinstance(entry, dict)]


def changed_token_ids(message: dict[str, Any]) -> list[str]:
    """Every token id a `price_change` frame touches, in first-seen order.

    Falls back to the top-level asset id for the flat legacy shape, whose
    entries carry no asset id of their own.
    """
    ordered: dict[str, None] = {}
    for entry in _change_entries(message):
        token_id = entry.get("asset_id") or entry.get("token_id")
        if token_id:
            ordered[str(token_id)] = None
    if not ordered:
        fallback = message.get("asset_id") or message.get("token_id")
        if fallback:
            ordered[str(fallback)] = None
    return list(ordered)


def price_changes_for(message: dict[str, Any], token_id: str) -> list[dict[str, Any]]:
    """The entries of a `price_change` that apply to one token."""
    entries = _change_entries(message)
    scoped = [
        entry
        for entry in entries
        if str(entry.get("asset_id") or entry.get("token_id") or "") == token_id
    ]
    if scoped:
        return scoped
    # Legacy shape: entries are unlabelled and the frame is for one token.
    if any(entry.get("asset_id") or entry.get("token_id") for entry in entries):
        return []
    owner = message.get("asset_id") or message.get("token_id")
    return entries if owner is None or str(owner) == token_id else []


def _levels_to_dict(levels: Any) -> dict[float, float]:
    out: dict[float, float] = {}
    for level in levels or []:
        try:
            price = float(level["price"])
            size = float(level["size"])
        except (KeyError, TypeError, ValueError):
            continue
        if size > 0:
            out[price] = size
    return out


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
