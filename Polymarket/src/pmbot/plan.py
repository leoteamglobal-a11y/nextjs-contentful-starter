"""Turn a set of markets into a single watch plan.

Watching N markets does not mean opening N connections. The markets
WebSocket takes a list of slugs in one subscription, so the whole fleet
rides one socket: one thing to reconnect, one ordering of events, one
journal. Each message carries its own `marketSlug`, so routing is a dict
lookup.

The venue caps a single subscription at 100 markets, so the plan also
chunks. That limit is the venue's, not ours, which is why it lives in
`endpoints.py` next to the URLs it constrains.

The only real work is deduplication and labelling, and both are pure —
which is why they live here rather than inline in the CLI.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from . import endpoints
from .discovery import Market


@dataclass(frozen=True)
class Label:
    slug: str
    question: str = ""

    def __str__(self) -> str:
        if not self.question:
            return self.slug
        # Slugs are long and mostly boilerplate; the question is what a human
        # actually recognises in a column of scrolling output.
        return f"{self.slug} ({self.question[:28]})" if self.question else self.slug


@dataclass(frozen=True)
class WatchPlan:
    markets: tuple[Market, ...]
    slugs: tuple[str, ...]
    labels: dict[str, Label]

    @property
    def tradable_markets(self) -> tuple[Market, ...]:
        return tuple(m for m in self.markets if m.tradable)

    @property
    def untradable_markets(self) -> tuple[Market, ...]:
        return tuple(m for m in self.markets if not m.tradable)

    @property
    def chunks(self) -> tuple[tuple[str, ...], ...]:
        """Slugs split into subscription-sized batches."""
        size = endpoints.MAX_MARKETS_PER_SUBSCRIPTION
        return tuple(
            tuple(self.slugs[i : i + size]) for i in range(0, len(self.slugs), size)
        )

    def label_for(self, slug: str) -> str:
        label = self.labels.get(slug)
        return str(label) if label else slug

    def describe(self) -> str:
        n = len(self.chunks)
        return (
            f"{len(self.markets)} market(s), {len(self.slugs)} instrument(s), "
            f"1 connection, {n} subscription(s)"
        )


def build_plan(markets: Iterable[Market]) -> WatchPlan:
    """Flatten markets into a deduplicated, labelled slug list.

    The same market can legitimately arrive twice — passed once as a URL and
    once as a bare slug, say. Subscribing twice would mean handling every
    update for it twice, so first label wins and the duplicate is dropped.
    """
    markets = tuple(markets)
    if not markets:
        raise ValueError("a watch plan needs at least one market")

    slugs: list[str] = []
    labels: dict[str, Label] = {}

    for market in markets:
        if not market.slug or market.slug in labels:
            continue
        labels[market.slug] = Label(slug=market.slug, question=market.question)
        slugs.append(market.slug)

    if not slugs:
        raise ValueError("no tradeable instruments across the given markets")

    return WatchPlan(markets=markets, slugs=tuple(slugs), labels=labels)


def label_width(labels: Sequence[Label] | Iterable[Label]) -> int:
    """Column width for aligned console output, capped so one pathological
    slug cannot push every column off screen."""
    widths = [len(str(label)) for label in labels]
    return min(max(widths, default=12), 44)
