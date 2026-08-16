"""Turn a Polymarket URL into the token ids you can actually subscribe to.

The chain is:

    market slug  ->  conditionId  ->  one CLOB token id per outcome

The tutorial this was modelled on extracted the YES token by digging through
an array and worrying that "I didn't know if position of YES and NO token are
fixed in array". They are not guaranteed, and you do not need them to be:
both Gamma and the CLOB label every token with its outcome name. Pair by
label, never by index. `outcome_token()` below is the whole fix.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from . import endpoints


class DiscoveryError(RuntimeError):
    """Raised when a market cannot be resolved to tradeable tokens."""


@dataclass(frozen=True)
class Token:
    token_id: str
    outcome: str


@dataclass(frozen=True)
class Market:
    condition_id: str
    question: str
    slug: str
    tokens: tuple[Token, ...]
    closed: bool

    def outcome_token(self, outcome: str) -> Token:
        """Look a token up by outcome name, case-insensitively."""
        wanted = outcome.strip().lower()
        for token in self.tokens:
            if token.outcome.strip().lower() == wanted:
                return token
        available = ", ".join(t.outcome for t in self.tokens) or "<none>"
        raise DiscoveryError(
            f"no outcome {outcome!r} in market {self.slug!r}; available: {available}"
        )

    @property
    def token_ids(self) -> tuple[str, ...]:
        return tuple(t.token_id for t in self.tokens)


def slug_from_url(url: str) -> str:
    """Extract the market slug from a Polymarket event/market URL.

    Accepts a bare slug unchanged, so callers can pass either.
    """
    cleaned = url.strip().split("?", 1)[0].split("#", 1)[0].rstrip("/")
    if "/" not in cleaned:
        return cleaned
    return cleaned.rsplit("/", 1)[-1]


def _maybe_json_list(value: Any) -> list[Any]:
    """Gamma returns some array fields as JSON-encoded strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def market_from_gamma(payload: dict[str, Any]) -> Market:
    """Build a Market from one Gamma `/markets` entry."""
    outcomes = [str(o) for o in _maybe_json_list(payload.get("outcomes"))]
    token_ids = [str(t) for t in _maybe_json_list(payload.get("clobTokenIds"))]

    if not token_ids:
        raise DiscoveryError(
            f"market {payload.get('slug')!r} exposes no clobTokenIds "
            "(not yet tradeable, or the field was renamed)"
        )
    if len(outcomes) != len(token_ids):
        raise DiscoveryError(
            f"market {payload.get('slug')!r} has {len(outcomes)} outcomes but "
            f"{len(token_ids)} token ids; refusing to guess the pairing"
        )

    condition_id = payload.get("conditionId")
    if not condition_id:
        raise DiscoveryError(f"market {payload.get('slug')!r} has no conditionId")

    return Market(
        condition_id=str(condition_id),
        question=str(payload.get("question", "")),
        slug=str(payload.get("slug", "")),
        tokens=tuple(
            Token(token_id=tid, outcome=out) for out, tid in zip(outcomes, token_ids)
        ),
        closed=bool(payload.get("closed", False)),
    )


def market_from_clob(payload: dict[str, Any]) -> Market:
    """Build a Market from a CLOB `/markets/{conditionId}` response.

    This is the fallback path for when Gamma does not return a market by slug
    — a failure mode that is common enough to be worth handling rather than
    working around by hand in browser devtools.
    """
    raw_tokens = payload.get("tokens") or []
    tokens = tuple(
        Token(token_id=str(t["token_id"]), outcome=str(t.get("outcome", "")))
        for t in raw_tokens
        if t.get("token_id")
    )
    if not tokens:
        raise DiscoveryError("CLOB market response contained no tokens")

    return Market(
        condition_id=str(payload.get("condition_id", "")),
        question=str(payload.get("question", "")),
        slug=str(payload.get("market_slug", "")),
        tokens=tokens,
        closed=bool(payload.get("closed", False)),
    )


def fetch_market(url_or_slug: str, *, timeout_s: float = 15.0) -> Market:
    """Resolve a market by slug via Gamma, falling back to the CLOB."""
    slug = slug_from_url(url_or_slug)
    with httpx.Client(timeout=timeout_s) as client:
        response = client.get(endpoints.gamma_markets_by_slug(slug))
        response.raise_for_status()
        payload = response.json()

    entries = payload if isinstance(payload, list) else payload.get("data", [])
    if not entries:
        raise DiscoveryError(
            f"Gamma returned no market for slug {slug!r}. If you know the "
            "conditionId, use fetch_market_by_condition_id() instead."
        )
    return market_from_gamma(entries[0])


def fetch_market_by_condition_id(
    condition_id: str, *, timeout_s: float = 15.0
) -> Market:
    with httpx.Client(timeout=timeout_s) as client:
        response = client.get(endpoints.clob_market(condition_id))
        response.raise_for_status()
        return market_from_clob(response.json())
