"""Turn a set of markets into a single watch plan.

Watching N markets does not mean opening N connections. The CLOB market
channel takes a list of asset ids in one subscription, so the whole fleet
rides one socket: one thing to reconnect, one ordering of events, one
journal. Each message carries its own `asset_id`, so routing is a dict
lookup.

The only real work is deduplication and labelling, and both are pure — which
is why they live here rather than inline in the CLI.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from .discovery import Market


@dataclass(frozen=True)
class Label:
    slug: str
    outcome: str

    def __str__(self) -> str:
        return f"{self.slug}/{self.outcome}"


@dataclass(frozen=True)
class WatchPlan:
    markets: tuple[Market, ...]
    token_ids: tuple[str, ...]
    labels: dict[str, Label]

    @property
    def open_markets(self) -> tuple[Market, ...]:
        return tuple(m for m in self.markets if not m.closed)

    @property
    def closed_markets(self) -> tuple[Market, ...]:
        return tuple(m for m in self.markets if m.closed)

    def label_for(self, token_id: str) -> str:
        label = self.labels.get(token_id)
        return str(label) if label else token_id[:12]

    def describe(self) -> str:
        return (
            f"{len(self.markets)} market(s), {len(self.token_ids)} token(s), "
            "1 connection"
        )


def build_plan(markets: Iterable[Market]) -> WatchPlan:
    """Flatten markets into a deduplicated, labelled token list.

    Two markets can legitimately reference the same token id (the same market
    passed twice under different URLs, for instance). Subscribing twice would
    mean handling every update for it twice, so first label wins and the
    duplicate is dropped.
    """
    markets = tuple(markets)
    if not markets:
        raise ValueError("a watch plan needs at least one market")

    token_ids: list[str] = []
    labels: dict[str, Label] = {}

    for market in markets:
        for token in market.tokens:
            if token.token_id in labels:
                continue
            labels[token.token_id] = Label(
                slug=market.slug or market.condition_id[:10],
                outcome=token.outcome,
            )
            token_ids.append(token.token_id)

    if not token_ids:
        raise ValueError("no tradeable tokens across the given markets")

    return WatchPlan(markets=markets, token_ids=tuple(token_ids), labels=labels)


def label_width(labels: Sequence[Label] | Iterable[Label]) -> int:
    """Column width for aligned console output, capped so one pathological
    slug cannot push every column off screen."""
    widths = [len(str(label)) for label in labels]
    return min(max(widths, default=12), 44)
