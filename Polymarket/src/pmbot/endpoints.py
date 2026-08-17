"""Every Polymarket US URL the bot touches, in one place.

Polymarket US is the CFTC-regulated exchange (KYC, USD, no wallet). It is a
*different venue* from polymarket.com, with a different API, and nothing
here points at the international CLOB any more.

Two hosts, and the split matters:

    gateway.polymarket.us   public reference + market data. No auth.
    api.polymarket.us       trading, portfolio, balances, WebSocket. Auth.

Note which side the market data lives on. Reading a book over REST is
public, but *streaming* it is not: both WebSocket endpoints hang off the
authenticated host and require a signed handshake. There is no anonymous
market feed on this venue.

Paths are kept separate from URLs on purpose. The authentication signature
covers the request path (never the query string — see `auth.py`), so the
signer needs the path on its own, not a full URL it would have to take
apart again.

Verified against the live API on 2026-08-17.
"""

from __future__ import annotations

from urllib.parse import quote

# Public: markets, events, series, sports, search. No credentials.
GATEWAY_BASE = "https://gateway.polymarket.us"

# Authenticated: orders, portfolio, account.
API_BASE = "https://api.polymarket.us"

# Streaming. Both require the same signed headers as the REST API.
WS_MARKETS = "wss://api.polymarket.us/v1/ws/markets"
WS_PRIVATE = "wss://api.polymarket.us/v1/ws/private"

WS_MARKETS_PATH = "/v1/ws/markets"
WS_PRIVATE_PATH = "/v1/ws/private"

# The venue caps one subscription at 100 markets; more needs a second one.
MAX_MARKETS_PER_SUBSCRIPTION = 100


def _slug(slug: str) -> str:
    """Percent-encode a slug for use in a path segment.

    Slugs are venue-generated and tame in practice, but a slug taken from a
    user-supplied URL is still untrusted input, and an unescaped `../` in a
    path is how a typo becomes a request to somewhere else entirely.
    """
    return quote(str(slug), safe="")


# -- public paths (gateway.polymarket.us) ------------------------------


def markets_path() -> str:
    return "/v1/markets"


def market_by_slug_path(slug: str) -> str:
    return f"/v1/market/slug/{_slug(slug)}"


def market_by_id_path(market_id: int | str) -> str:
    return f"/v1/market/id/{_slug(market_id)}"


def market_book_path(slug: str) -> str:
    return f"/v1/markets/{_slug(slug)}/book"


def market_bbo_path(slug: str) -> str:
    return f"/v1/markets/{_slug(slug)}/bbo"


def market_settlement_path(slug: str) -> str:
    return f"/v1/markets/{_slug(slug)}/settlement"


def events_path() -> str:
    return "/v1/events"


def event_by_slug_path(slug: str) -> str:
    return f"/v1/event/slug/{_slug(slug)}"


def search_path() -> str:
    return "/v1/search"


# -- authenticated paths (api.polymarket.us) ---------------------------


def orders_path() -> str:
    return "/v1/orders"


def open_orders_path() -> str:
    return "/v1/orders/open"


def order_path(order_id: str) -> str:
    return f"/v1/order/{_slug(order_id)}"


def cancel_order_path(order_id: str) -> str:
    return f"/v1/order/{_slug(order_id)}/cancel"


def modify_order_path(order_id: str) -> str:
    return f"/v1/order/{_slug(order_id)}/modify"


def cancel_all_orders_path() -> str:
    return "/v1/orders/open/cancel"


def preview_order_path() -> str:
    return "/v1/order/preview"


def close_position_path() -> str:
    return "/v1/order/close-position"


def positions_path() -> str:
    return "/v1/portfolio/positions"


def activities_path() -> str:
    return "/v1/portfolio/activities"


def balances_path() -> str:
    return "/v1/account/balances"


# -- url builders ------------------------------------------------------


def gateway_url(path: str) -> str:
    return f"{GATEWAY_BASE}{path}"


def api_url(path: str) -> str:
    return f"{API_BASE}{path}"


def market_url(slug: str) -> str:
    """The human-facing page, for eyeballing a market in a browser."""
    return f"https://polymarket.us/market/{_slug(slug)}"
