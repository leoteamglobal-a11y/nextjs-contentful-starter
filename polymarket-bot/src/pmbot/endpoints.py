"""Every Polymarket URL the bot touches, in one place.

These endpoints could NOT be verified from the environment this file was
written in (outbound access to *.polymarket.com was blocked by network
policy). Run `python -m pmbot.cli doctor` from a machine with real network
access before trusting anything here.
"""

from __future__ import annotations

# Indexed market metadata: slugs, conditionIds, outcomes, CLOB token ids.
GAMMA_BASE = "https://gamma-api.polymarket.com"

# Central limit order book: books, prices, midpoints, market metadata.
CLOB_BASE = "https://clob.polymarket.com"

# Streaming order book updates. The `market` channel is public — no auth.
CLOB_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

# Polygon explorer, for eyeballing settlement of a trade by tx hash.
EXPLORER_TX = "https://polygonscan.com/tx/{tx_hash}"


def gamma_markets_by_slug(slug: str) -> str:
    return f"{GAMMA_BASE}/markets?slug={slug}"


def clob_market(condition_id: str) -> str:
    return f"{CLOB_BASE}/markets/{condition_id}"


def clob_book(token_id: str) -> str:
    return f"{CLOB_BASE}/book?token_id={token_id}"
