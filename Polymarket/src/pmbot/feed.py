"""Streaming order book feed.

Polling REST endpoints in a loop — what most tutorials do — means you are
always one poll interval behind the market. On a venue where the edge is
measured in cents of spread, that is the difference between quoting and
being run over. This subscribes to the public `market` channel instead: no
authentication, no private key, read-only.

The connection WILL drop. That is normal, and the only correct response is
to reconnect and take a fresh snapshot: incremental updates missed while
disconnected are gone forever, so resuming the old book state would leave
you trading on a book that silently diverged from reality.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any, AsyncIterator, Sequence

import websockets

from . import endpoints
from .config import Settings

log = logging.getLogger(__name__)


class MarketFeed:
    def __init__(
        self,
        token_ids: Sequence[str],
        settings: Settings | None = None,
        url: str = endpoints.CLOB_WS,
    ) -> None:
        if not token_ids:
            raise ValueError("MarketFeed needs at least one token id")
        self.token_ids = list(token_ids)
        self.settings = settings or Settings()
        self.url = url
        self.reconnects = 0

    def _subscribe_payload(self) -> str:
        return json.dumps({"assets_ids": self.token_ids, "type": "market"})

    async def stream(self) -> AsyncIterator[dict[str, Any]]:
        """Yield decoded feed messages forever, reconnecting as needed.

        A synthetic `{"event_type": "_reconnected"}` message is yielded after
        every successful (re)connect so the consumer knows its book state is
        about to be replaced and must not trust it until the next snapshot.
        """
        backoff = self.settings.ws_reconnect_base_s
        while True:
            try:
                async with websockets.connect(
                    self.url,
                    ping_interval=self.settings.ws_ping_interval_s,
                    ping_timeout=self.settings.ws_ping_interval_s * 2,
                    max_queue=1024,
                ) as socket:
                    await socket.send(self._subscribe_payload())
                    log.info("subscribed to %d token(s)", len(self.token_ids))
                    backoff = self.settings.ws_reconnect_base_s
                    yield {"event_type": "_reconnected", "reconnects": self.reconnects}

                    async for raw in socket:
                        for message in _decode(raw):
                            yield message

            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - a feed must never die
                self.reconnects += 1
                # Jitter keeps a fleet of bots from retrying in lockstep after
                # a venue-wide blip.
                delay = min(backoff, self.settings.ws_reconnect_max_s)
                delay *= 0.5 + random.random()
                log.warning(
                    "feed dropped (%s: %s); reconnecting in %.1fs",
                    type(exc).__name__,
                    exc,
                    delay,
                )
                yield {"event_type": "_disconnected", "error": str(exc)}
                await asyncio.sleep(delay)
                backoff = min(backoff * 2, self.settings.ws_reconnect_max_s)


def _decode(raw: str | bytes) -> list[dict[str, Any]]:
    """Decode one frame into zero or more messages.

    The venue batches messages into a JSON array on busy markets and sends a
    bare object otherwise, so handle both. Undecodable frames are dropped
    rather than killing the stream.
    """
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    text = raw.strip()
    if not text or text == "PONG":
        return []
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        log.debug("undecodable frame: %.120s", text)
        return []
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if isinstance(payload, dict):
        return [payload]
    return []
