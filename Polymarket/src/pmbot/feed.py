"""Streaming market data feed, against the Polymarket US markets socket.

Polling REST endpoints in a loop means you are always one poll interval
behind the market. On a venue where the edge is measured in ticks of
spread, that is the difference between quoting and being run over. The
venue says the same thing in its own docs: the single most effective way to
stay inside the rate limit is to stop polling.

Two things changed from the international venue, and both matter:

1. **The feed is authenticated.** There is no public market channel here.
   The socket lives on the same host as trading and needs the same signed
   headers, so `watch` now requires an API key. Nothing about that is
   optional or worked around below.

2. **Every book message is a full snapshot.** The international CLOB sent a
   `book` snapshot followed by `price_change` increments, and missing an
   increment silently corrupted your book. Here each `marketData` message
   carries the whole book, so there is no incremental state to lose.

The connection will still drop, and the response is still to reconnect and
resubscribe. Because updates are snapshots the recovery is cheaper than it
used to be, but the book is still dropped on reconnect: what you missed may
have included a state change, and quoting against a stale book is exactly
the failure this is meant to prevent.

## Normalisation, and why it is the whole point of this file

The venue's wire format is protobuf-derived JSON: camelCase envelopes,
prices as `{"value": "0.555", "currency": "USD"}`, sizes as strings,
timestamps as RFC-3339. None of the strategy, simulation, replay or
portfolio code knows anything about that, and none of it should have to.

So this module translates the venue's messages into the small canonical
shape the rest of the package already consumed — `event_type`, `asset_id`,
plain-float `price`/`size` — before anything downstream sees them. That one
decision is why the fill simulator, the risk layer, the replay engine and
the strategies did not need to change for this migration at all.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime
from typing import Any, AsyncIterator, Iterable, Sequence

import websockets

from . import endpoints
from .auth import Credentials
from .config import Settings

log = logging.getLogger(__name__)


class FeedAuthError(RuntimeError):
    """The venue refused the handshake. Not retryable, so not retried."""


MARKET_DATA = "SUBSCRIPTION_TYPE_MARKET_DATA"
MARKET_DATA_LITE = "SUBSCRIPTION_TYPE_MARKET_DATA_LITE"
TRADE = "SUBSCRIPTION_TYPE_TRADE"

# States in which a market is not accepting orders. Recorded on every book
# message so a backtest can tell "no quotes" from "market was halted" —
# they look identical in an order book and mean opposite things.
INACTIVE_STATES = {
    "MARKET_STATE_SUSPENDED",
    "MARKET_STATE_HALTED",
    "MARKET_STATE_EXPIRED",
    "MARKET_STATE_TERMINATED",
}


def amount(value: Any) -> float | None:
    """Read a venue Amount (`{"value": "0.55", ...}`) or a bare number."""
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("value")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def timestamp_ms(value: Any) -> int | None:
    """RFC-3339 or epoch to integer milliseconds.

    The venue sends `2024-01-15T10:30:00Z`; downstream code wants a number
    it can compare. Fractional seconds are truncated to microseconds because
    the API emits nanosecond precision, which `fromisoformat` rejects.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)

    text = text.replace("Z", "+00:00")
    if "." in text:
        head, _, tail = text.partition(".")
        digits = "".join(c for c in tail if c.isdigit())[:6]
        offset = tail[len(digits) :] if len(tail) > len(digits) else ""
        offset = offset.lstrip("0123456789")
        text = f"{head}.{digits or '0'}{offset}"
    try:
        return int(datetime.fromisoformat(text).timestamp() * 1000)
    except ValueError:
        return None


def _levels(raw: Any) -> list[dict[str, float]]:
    """Venue book levels (`px`/`qty`) to canonical `price`/`size`."""
    out: list[dict[str, float]] = []
    for level in raw or []:
        if not isinstance(level, dict):
            continue
        price = amount(level.get("px"))
        size = amount(level.get("qty"))
        if price is None or size is None or size <= 0:
            continue
        out.append({"price": price, "size": size})
    return out


def normalize(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Translate one venue message into zero or more canonical messages.

    Pure, and the most heavily tested function in this file: it is the only
    place where a venue schema change can quietly corrupt every downstream
    number, and it is the seam a future venue would be adapted at.
    """
    if not isinstance(payload, dict):
        return []

    if "heartbeat" in payload:
        return []

    if payload.get("error"):
        return [
            {
                "event_type": "_error",
                "error": str(payload.get("error")),
                "request_id": payload.get("requestId"),
            }
        ]

    data = payload.get("marketData")
    if isinstance(data, dict):
        slug = data.get("marketSlug")
        if not slug:
            return []
        state = str(data.get("state") or "")
        stats = data.get("stats") if isinstance(data.get("stats"), dict) else {}
        return [
            {
                "event_type": "book",
                "asset_id": str(slug),
                "bids": _levels(data.get("bids")),
                # The venue calls the sell side "offers"; the canonical name
                # downstream is "asks". Same thing, and this is the only
                # place that needs to know.
                "asks": _levels(data.get("offers")),
                "timestamp": timestamp_ms(data.get("transactTime")),
                "state": state,
                "tradable": state not in INACTIVE_STATES,
                "last_trade_price": amount((stats or {}).get("lastTradePx")),
            }
        ]

    lite = payload.get("marketDataLite")
    if isinstance(lite, dict):
        slug = lite.get("marketSlug")
        if not slug:
            return []
        # Deliberately not an `event_type: "book"`: BBO carries no depth, and
        # feeding it in as a snapshot would wipe every level behind the touch
        # and hand the fill simulator a two-level book that never existed.
        return [
            {
                "event_type": "bbo",
                "asset_id": str(slug),
                "best_bid": amount(lite.get("bestBid")),
                "best_ask": amount(lite.get("bestAsk")),
                "last_trade_price": amount(lite.get("lastTradePx")),
                "bid_depth": lite.get("bidDepth"),
                "ask_depth": lite.get("askDepth"),
            }
        ]

    trade = payload.get("trade")
    if isinstance(trade, dict):
        slug = trade.get("marketSlug")
        price = amount(trade.get("price"))
        size = amount(trade.get("quantity"))
        if not slug or price is None or size is None or size <= 0:
            # A print with no usable size gives no defensible fill quantity,
            # so it is dropped rather than guessed at.
            return []
        return [
            {
                "event_type": "trade",
                "asset_id": str(slug),
                "price": price,
                "size": size,
                "timestamp": timestamp_ms(trade.get("tradeTime")),
            }
        ]

    return []


def decode(raw: str | bytes) -> list[dict[str, Any]]:
    """Decode one frame into zero or more canonical messages.

    Undecodable frames are dropped rather than killing the stream: a feed
    that dies on one malformed frame is worse than one that skips it.
    """
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    text = raw.strip()
    if not text:
        return []
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        log.debug("undecodable frame: %.120s", text)
        return []
    if isinstance(payload, list):
        return [m for entry in payload for m in normalize(entry)]
    return normalize(payload)


class AuthedSocket:
    """The connection half of an authenticated venue stream.

    Both sockets — market data and private — share the same handshake, the
    same backoff, and the same "a rejected key is not retryable" rule. Only
    what they subscribe to and how they decode differs, so those are the two
    hooks subclasses override.
    """

    #: Subclasses set these.
    url: str = endpoints.WS_MARKETS
    path: str = endpoints.WS_MARKETS_PATH
    label: str = "feed"

    def __init__(
        self,
        settings: Settings | None = None,
        credentials: Credentials | None = None,
    ) -> None:
        self.settings = settings or Settings()
        self.credentials = credentials or self.settings.credentials
        if self.credentials is None:
            raise ValueError(
                f"{type(self).__name__} needs API credentials: every "
                "Polymarket US socket is authenticated. Set "
                "POLYMARKET_KEY_ID and POLYMARKET_SECRET_KEY."
            )
        self.reconnects = 0

    # -- hooks ---------------------------------------------------------

    def subscribe_requests(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def decode_frame(self, raw: str | bytes) -> list[dict[str, Any]]:
        raise NotImplementedError

    # -- connection ----------------------------------------------------

    def _headers(self) -> dict[str, str]:
        assert self.credentials is not None
        headers = self.credentials.headers("GET", self.path)
        # The handshake is not a JSON request body; sending a content type
        # for one is noise at best.
        headers.pop("Content-Type", None)
        return headers

    @staticmethod
    def _status_of(exc: Exception) -> int | None:
        """HTTP status from a handshake failure, whichever way it is carried.

        `websockets` hangs it off `exc.response.status_code`; older versions
        and other libraries put it directly on the exception.
        """
        status = getattr(exc, "status_code", None)
        if status is None:
            status = getattr(getattr(exc, "response", None), "status_code", None)
        return status if isinstance(status, int) else None

    @classmethod
    def _is_auth_rejection(cls, exc: Exception) -> bool:
        """True for a handshake the venue refused on credentials.

        Reconnecting through this is pointless and actively harmful: the key
        will not become valid by being retried, and a bot that spins on 401
        forever looks alive in the logs while recording nothing. Backoff is
        for transient failures; a rejected key is not one.
        """
        return cls._status_of(exc) in (401, 403)

    async def _connect(self):
        """Open the socket, tolerating the `websockets` header-kwarg rename."""
        headers = self._headers()
        kwargs: dict[str, Any] = {
            "ping_interval": self.settings.ws_ping_interval_s,
            "ping_timeout": self.settings.ws_ping_interval_s * 2,
            "max_queue": 1024,
        }
        try:
            return await websockets.connect(
                self.url, additional_headers=headers, **kwargs
            )
        except TypeError:
            # websockets < 14 spells it `extra_headers`.
            return await websockets.connect(self.url, extra_headers=headers, **kwargs)

    # -- streaming -----------------------------------------------------

    async def stream(self) -> AsyncIterator[dict[str, Any]]:
        """Yield canonical messages forever, reconnecting as needed.

        A synthetic `{"event_type": "_reconnected"}` message is yielded after
        every successful (re)connect so the consumer knows its state is about
        to be replaced and must not be trusted until the next snapshot.
        """
        backoff = self.settings.ws_reconnect_base_s
        while True:
            try:
                socket = await self._connect()
                async with socket:
                    requests = self.subscribe_requests()
                    for request in requests:
                        await socket.send(json.dumps(request))
                    log.info("%s: sent %d subscription(s)", self.label, len(requests))
                    backoff = self.settings.ws_reconnect_base_s
                    yield {"event_type": "_reconnected", "reconnects": self.reconnects}

                    async for raw in socket:
                        for message in self.decode_frame(raw):
                            yield message

            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - a feed must never die
                if self._is_auth_rejection(exc):
                    raise FeedAuthError(
                        "the venue rejected the WebSocket handshake with HTTP "
                        f"{self._status_of(exc)}. "
                        "Check POLYMARKET_KEY_ID/POLYMARKET_SECRET_KEY, that "
                        "the key is not revoked, and that this machine's clock "
                        "is within 30s of real time — a drifted clock is "
                        "indistinguishable from a bad key here."
                    ) from exc

                self.reconnects += 1
                # Jitter keeps a fleet of bots from retrying in lockstep after
                # a venue-wide blip.
                delay = min(backoff, self.settings.ws_reconnect_max_s)
                delay *= 0.5 + random.random()
                log.warning(
                    "%s dropped (%s: %s); reconnecting in %.1fs",
                    self.label,
                    type(exc).__name__,
                    exc,
                    delay,
                )
                yield {"event_type": "_disconnected", "error": str(exc)}
                await asyncio.sleep(delay)
                backoff = min(backoff * 2, self.settings.ws_reconnect_max_s)


class MarketFeed(AuthedSocket):
    """One socket, many markets, canonical messages out."""

    label = "market feed"

    def __init__(
        self,
        slugs: Sequence[str],
        settings: Settings | None = None,
        credentials: Credentials | None = None,
        url: str = endpoints.WS_MARKETS,
        path: str = endpoints.WS_MARKETS_PATH,
    ) -> None:
        if not slugs:
            raise ValueError("MarketFeed needs at least one market slug")
        self.slugs = list(dict.fromkeys(str(s) for s in slugs))
        super().__init__(settings=settings, credentials=credentials)
        self.url = url
        self.path = path

    def _chunks(self) -> list[list[str]]:
        size = endpoints.MAX_MARKETS_PER_SUBSCRIPTION
        return [self.slugs[i : i + size] for i in range(0, len(self.slugs), size)]

    def subscribe_requests(self) -> list[dict[str, Any]]:
        """Every subscribe frame to send after connecting.

        The book and the tape are separate subscriptions on the same socket.
        Both are worth having: the book is what a strategy quotes against,
        and the tape is what actually fills a resting quote — a book-only
        recording almost never fills a maker, because a maker gets filled
        when a taker crosses to it, and that shows up as a print.
        """
        types = [MARKET_DATA] + ([TRADE] if self.settings.subscribe_trades else [])
        requests: list[dict[str, Any]] = []
        for index, chunk in enumerate(self._chunks()):
            for kind in types:
                requests.append(
                    {
                        "subscribe": {
                            "requestId": f"{kind.lower()}-{index}",
                            "subscriptionType": kind,
                            "marketSlugs": chunk,
                        }
                    }
                )
        return requests

    def decode_frame(self, raw: str | bytes) -> list[dict[str, Any]]:
        return decode(raw)


def iter_normalized(payloads: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalise a batch of venue messages. Useful for tests and tooling."""
    return [message for payload in payloads for message in normalize(payload)]
