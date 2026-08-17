"""Turn a Polymarket US URL into something you can subscribe to and trade.

This module got much smaller in the move, and the reason is the venue's
market structure rather than anything clever here.

On the international CLOB a market was a `conditionId` that fanned out into
one ERC-1155 token id per outcome, and the fiddly part was pairing outcomes
to token ids correctly — tutorials grabbed `[0]` and hoped. Polymarket US
has **one instrument per market**, addressed by its slug. There is no
condition id, no token id, and no pairing to get wrong. The slug you can
read off the URL is the same string you put in an order.

What replaces the outcome/token pairing is the long/short distinction. A
market still has two sides, but they are not two instruments: they are two
*directions* on one. Buying the "No" side is selling the long instrument,
which the venue expresses as an order intent rather than a different asset.
`Market.side()` resolves a human name to that direction; `live/client.py`
turns the direction into an intent.

One consequence worth stating plainly: the slug *is* the instrument key.
Everywhere the rest of this package says `token_id`, it now carries a market
slug. That is deliberate — see the README section on what was reused.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from . import endpoints


class DiscoveryError(RuntimeError):
    """Raised when a market cannot be resolved to a tradeable instrument."""


@dataclass(frozen=True)
class Side:
    """One direction on a market's single instrument."""

    description: str
    long: bool
    tradable: bool = True

    @property
    def direction(self) -> str:
        return "long" if self.long else "short"

    def __str__(self) -> str:
        return self.description or self.direction


@dataclass(frozen=True)
class Market:
    slug: str
    question: str
    market_id: str = ""
    active: bool = False
    closed: bool = False
    archived: bool = False
    tick_size: float = 0.01
    min_qty: float = 1.0
    category: str = ""
    end_date: str = ""
    sides: tuple[Side, ...] = ()

    @property
    def instrument(self) -> str:
        """The key used everywhere downstream. On this venue, the slug."""
        return self.slug

    @property
    def tradable(self) -> bool:
        """Whether an order sent right now has any chance of resting.

        `active` alone is not enough: the live API happily returns markets
        that are active and closed at the same time (a settled game stays
        flagged active for a while), and an order into one is just a reject.
        """
        return self.active and not self.closed and not self.archived

    def side(self, name: str) -> Side:
        """Resolve a side by name, case-insensitively.

        Accepts the venue's own label ("Yes", "No", "Chargers"), or the
        generic direction words, so a script can say "long" without knowing
        what the market calls its sides.
        """
        wanted = (name or "").strip().lower()
        if not wanted:
            raise DiscoveryError("no side given")

        if wanted in {"long", "buy", "yes"}:
            for side in self.sides:
                if side.long:
                    return side
        if wanted in {"short", "sell", "no"}:
            for side in self.sides:
                if not side.long:
                    return side

        for side in self.sides:
            if side.description.strip().lower() == wanted:
                return side

        available = ", ".join(s.description for s in self.sides) or "<none>"
        raise DiscoveryError(
            f"no side {name!r} in market {self.slug!r}; available: {available} "
            "(or use 'long'/'short')"
        )

    @property
    def long_side(self) -> Side | None:
        for side in self.sides:
            if side.long:
                return side
        return None


def slug_from_url(url: str) -> str:
    """Extract the market slug from a Polymarket US URL.

    Accepts a bare slug unchanged, so callers can pass either. Query strings
    and fragments are stripped first: a slug copied out of a browser
    normally arrives with tracking parameters attached.
    """
    cleaned = url.strip().split("?", 1)[0].split("#", 1)[0].rstrip("/")
    if "/" not in cleaned:
        return cleaned
    return cleaned.rsplit("/", 1)[-1]


def _as_float(value: Any, default: float) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if result > 0 else default


def market_from_payload(payload: dict[str, Any]) -> Market:
    """Build a Market from one gateway market object.

    Pure, so the parsing is testable without a network — which matters,
    because the exchange is the one thing you cannot spin up locally.
    """
    if not isinstance(payload, dict):
        raise DiscoveryError(f"expected a market object, got {type(payload).__name__}")

    # Both `GET /v1/market/slug/{slug}` and `GET /v1/market/id/{id}` wrap the
    # object; the list endpoint does not.
    if "market" in payload and isinstance(payload["market"], dict):
        payload = payload["market"]

    slug = str(payload.get("slug") or "").strip()
    if not slug:
        raise DiscoveryError(
            "market payload carries no slug, so there is nothing to trade or "
            "subscribe to"
        )

    sides = tuple(
        Side(
            description=str(raw.get("description") or ""),
            long=bool(raw.get("long", False)),
            tradable=bool(raw.get("tradable", True)),
        )
        for raw in payload.get("marketSides") or []
        if isinstance(raw, dict)
    )

    return Market(
        slug=slug,
        question=str(payload.get("question") or ""),
        market_id=str(payload.get("id") or ""),
        active=bool(payload.get("active", False)),
        closed=bool(payload.get("closed", False)),
        archived=bool(payload.get("archived", False)),
        # A tick size of zero would let the maker quote at arbitrary
        # precision and have every order rejected, so fall back rather than
        # trust a missing field.
        tick_size=_as_float(payload.get("orderPriceMinTickSize"), 0.01),
        min_qty=_as_float(payload.get("minimumTradeQty"), 1.0),
        category=str(payload.get("category") or ""),
        end_date=str(payload.get("endDate") or ""),
        sides=sides,
    )


def fetch_market(url_or_slug: str, *, timeout_s: float = 15.0) -> Market:
    """Resolve a market by slug. Public endpoint — no credentials needed."""
    slug = slug_from_url(url_or_slug)
    if not slug:
        raise DiscoveryError(f"could not read a slug out of {url_or_slug!r}")

    url = endpoints.gateway_url(endpoints.market_by_slug_path(slug))
    with httpx.Client(timeout=timeout_s) as client:
        response = client.get(url)
        if response.status_code == 404:
            raise DiscoveryError(
                f"no market with slug {slug!r}. Slugs on Polymarket US are not "
                "the same as on polymarket.com — find it with "
                f"`python -m pmbot.cli search <text>`."
            )
        response.raise_for_status()
        return market_from_payload(response.json())


def fetch_market_by_id(market_id: int | str, *, timeout_s: float = 15.0) -> Market:
    """Fallback path for when you have the numeric id but not the slug."""
    url = endpoints.gateway_url(endpoints.market_by_id_path(market_id))
    with httpx.Client(timeout=timeout_s) as client:
        response = client.get(url)
        if response.status_code == 404:
            raise DiscoveryError(f"no market with id {market_id!r}")
        response.raise_for_status()
        return market_from_payload(response.json())


@dataclass(frozen=True)
class SearchResult:
    """What a search found, and how much of the catalogue it looked at.

    The second part matters as much as the first. Matching happens on one
    page of markets fetched from the venue, so an empty result means "not in
    the markets I looked at", never "does not exist". Reporting only the
    matches invites exactly the wrong conclusion — someone asks whether a
    market exists, sees nothing, and believes it.
    """

    markets: list[Market]
    scanned: int
    limit: int

    @property
    def page_was_full(self) -> bool:
        """True when the venue returned as many markets as we asked for,
        which means there are probably more we never saw."""
        return self.scanned >= self.limit

    def __iter__(self):
        return iter(self.markets)

    def __len__(self) -> int:
        return len(self.markets)


def search_markets(
    query: str, *, limit: int = 20, timeout_s: float = 15.0
) -> SearchResult:
    """Find tradeable markets by free text.

    Slugs here are venue-generated and unguessable (`aec-nfl-lac-ten-...`),
    so a search that works without credentials is not a convenience — it is
    the only practical way to get the first slug.

    Matching is done here rather than by the venue, over a single page. See
    `SearchResult.page_was_full` before reading anything into an empty
    result.
    """
    url = endpoints.gateway_url(endpoints.markets_path())
    params: dict[str, Any] = {"limit": limit, "active": True, "closed": False}
    with httpx.Client(timeout=timeout_s) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()

    raw_markets = payload.get("markets") or []
    needle = query.strip().lower()
    found: list[Market] = []
    for raw in raw_markets:
        try:
            market = market_from_payload(raw)
        except DiscoveryError:
            continue
        haystack = f"{market.slug} {market.question} {market.category}".lower()
        if not needle or needle in haystack:
            found.append(market)

    return SearchResult(markets=found, scanned=len(raw_markets), limit=limit)
