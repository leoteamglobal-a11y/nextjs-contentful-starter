"""Every Polymarket URL the bot touches, in one place.

VERIFIED 2026-08-17 against the live venue. Every URL below was requested
from a machine with real network access and answered; `doctor` re-runs those
same requests on demand. Two independent cross-checks agree with them:

- the official docs (https://docs.polymarket.com/getting-started/api), and
- the `PRODUCTION` environment baked into Polymarket's own Python SDK
  (`polymarket.environments`, package `polymarket-client`), whose
  `clob_url`, `clob_market_ws_url`, `gamma_url` and `data_url` are
  byte-identical to the constants here.

See docs/VERIFICATION.md for the full record, including what could not be
verified.
"""

from __future__ import annotations

# Indexed market metadata: slugs, conditionIds, outcomes, CLOB token ids.
GAMMA_BASE = "https://gamma-api.polymarket.com"

# Central limit order book: books, prices, midpoints, market metadata.
CLOB_BASE = "https://clob.polymarket.com"

# Streaming order book updates. The `market` channel is public — no auth.
CLOB_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

# Fills, positions and holders. Read-only, public, not used by the feed.
DATA_BASE = "https://data-api.polymarket.com"

# Polygon JSON-RPC, needed only by `approvals` — no read path touches it.
#
# polygon-rpc.com is what the public docs have long pointed at, but as of
# 2026-08-17 it answers HTTP 401 `{"error": "API key disabled, reason:
# tenant disabled"}` to every request, i.e. it is no longer a usable open
# endpoint. Polymarket's own SDK ships polygon.drpc.org instead, so that is
# the default here. `doctor` probes whichever RPC is configured.
POLYGON_RPC = "https://polygon.drpc.org"

# Polygon explorer, for eyeballing settlement of a trade by tx hash.
EXPLORER_TX = "https://polygonscan.com/tx/{tx_hash}"


def gamma_markets_by_slug(slug: str) -> str:
    return f"{GAMMA_BASE}/markets?slug={slug}"


def gamma_active_markets(limit: int = 1) -> str:
    """Any tradeable market — used by `doctor` to get a live id to probe with."""
    return (
        f"{GAMMA_BASE}/markets?closed=false&enableOrderBook=true"
        f"&order=volume24hr&ascending=false&limit={limit}"
    )


def clob_market(condition_id: str) -> str:
    return f"{CLOB_BASE}/markets/{condition_id}"


def clob_book(token_id: str) -> str:
    return f"{CLOB_BASE}/book?token_id={token_id}"


def clob_midpoint(token_id: str) -> str:
    return f"{CLOB_BASE}/midpoint?token_id={token_id}"


def clob_tick_size(token_id: str) -> str:
    return f"{CLOB_BASE}/tick-size?token_id={token_id}"
