"""Thin adapter over the Polymarket US SDK.

Everything that knows an SDK's method names lives in this one file, so an
SDK change is one file to fix rather than a rewrite. That rule earned its
keep: the previous version of this file wrapped `py-clob-client`, which was
archived and replaced mid-project, and this rewrite replaced it again.

## What went away

The old adapter had a long list of things that could silently break: which
`create_or_derive_api_key` spelling the SDK used, whether `signature_type`
was 0, 1 or 2 (getting it wrong signed orders for the wrong address and
every order was rejected), whether `funder` had to be passed separately,
and whether the wallet had approved the exchange to move its tokens.

None of that exists on Polymarket US. There is no wallet, no chain, no
signature type, no funder, and no approvals. There is an API key, and the
exchange already knows who you are because you completed KYC. The entire
class of "the order was rejected and the error does not say why" failures
that came from wallet configuration is gone.

## What replaced it

One thing genuinely new: **intent**. The international venue had a separate
token per outcome, so "buy NO" meant buying a different asset. Here there is
one instrument per market and four intents over it:

    BUY_LONG    open/increase a YES position
    SELL_LONG   reduce/close a YES position (also how you go short)
    BUY_SHORT   open/increase a NO position
    SELL_SHORT  reduce/close a NO position

The strategy layer upstream only knows BUY and SELL. This file is where
that widens into an intent, using the market side the caller asked for.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..auth import AuthError, Credentials

# Time in force. GTC is the only one a resting maker quote wants; the others
# are here so the mapping is stated once rather than spelled inline.
TIF_GTC = "TIME_IN_FORCE_GOOD_TILL_CANCEL"
TIF_GTD = "TIME_IN_FORCE_GOOD_TILL_DATE"
TIF_IOC = "TIME_IN_FORCE_IMMEDIATE_OR_CANCEL"
TIF_FOK = "TIME_IN_FORCE_FILL_OR_KILL"

TYPE_LIMIT = "ORDER_TYPE_LIMIT"
TYPE_MARKET = "ORDER_TYPE_MARKET"

CURRENCY = "USD"


class LiveClientError(RuntimeError):
    """Anything that goes wrong talking to the venue."""


def order_intent(side: str, *, long: bool = True) -> str:
    """Map a BUY/SELL on a chosen market side to a venue order intent."""
    side = (side or "").strip().upper()
    if side not in {"BUY", "SELL"}:
        raise LiveClientError(f"side must be BUY or SELL, got {side!r}")
    direction = "LONG" if long else "SHORT"
    return f"ORDER_INTENT_{side}_{direction}"


def price_amount(price: float) -> dict[str, str]:
    """Prices go over the wire as decimal strings, not floats.

    Sending a float would let `0.1 + 0.2` reach the exchange as
    `0.30000000000000004` and be rejected for violating the tick — the
    classic way a working strategy fails only in production.
    """
    return {"value": f"{price:.4f}", "currency": CURRENCY}


def round_to_tick(price: float, tick: float) -> float:
    """Snap a price to the market's tick, which the venue enforces."""
    if tick <= 0:
        return round(price, 4)
    return round(round(price / tick) * tick, 6)


def _require_sdk() -> Any:
    """Import the SDK only when actually going live.

    Reading, recording and backtesting must stay runnable without it —
    nothing that can send an order should be a dependency of code that only
    reads.
    """
    try:
        import polymarket_us as sdk  # type: ignore
    except ImportError as exc:
        raise LiveClientError(
            "The Polymarket US SDK is not installed. For live use:\n"
            "    pip install -r requirements-live.txt\n"
            "(or: pip install polymarket-us)"
        ) from exc
    return sdk


@dataclass
class ClientConfig:
    """What the live client needs. No key material beyond the API key."""

    credentials: Credentials
    timeout_s: float = 30.0

    @classmethod
    def from_env(cls) -> "ClientConfig":
        credentials = Credentials.from_env()
        credentials.validate()
        return cls(credentials=credentials)

    def redacted(self) -> str:
        return self.credentials.redacted()


class LiveClient:
    """Wraps the SDK client. Constructed only when going live."""

    def __init__(self, config: ClientConfig) -> None:
        self.config = config
        self._sdk = _require_sdk()
        self._client: Any = None

    # -- setup ---------------------------------------------------------

    def connect(self) -> str:
        """Build the client and prove the credentials work.

        There is no key derivation step any more, so "connect" is really
        "construct, then make one authenticated call". Doing that call here
        means a bad key fails on the first line of output rather than
        halfway through a run.
        """
        try:
            self._client = self._sdk.PolymarketUS(
                key_id=self.config.credentials.key_id,
                secret_key=self.config.credentials.secret_key,
                timeout=self.config.timeout_s,
            )
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"could not build client: {exc}") from exc

        balances = self.balances()
        currency = balances.get("currency", CURRENCY)
        buying_power = balances.get("buyingPower")
        return f"authenticated, buying power {buying_power} {currency}"

    def _require_client(self) -> Any:
        if self._client is None:
            raise LiveClientError("not connected: call connect() first")
        return self._client

    def _wrap(self, what: str, call) -> Any:
        """Run one SDK call, turning its exceptions into ours."""
        try:
            return call()
        except LiveClientError:
            raise
        except Exception as exc:  # noqa: BLE001
            sdk = self._sdk
            if isinstance(exc, getattr(sdk, "AuthenticationError", ())):
                raise LiveClientError(
                    f"{what} rejected the credentials. Check the key is not "
                    "revoked, and that this machine's clock is correct — "
                    "timestamps more than 30s out look identical to a bad key."
                ) from exc
            if isinstance(exc, getattr(sdk, "RateLimitError", ())):
                raise LiveClientError(
                    f"{what} was rate limited (20 req/s per key). Back off, or "
                    "move the polling to the WebSocket."
                ) from exc
            raise LiveClientError(f"{what} failed: {type(exc).__name__}: {exc}") from exc

    # -- reads ---------------------------------------------------------

    def ok(self) -> bool:
        """Cheap reachability check on the public side."""
        try:
            self._require_client().markets.list({"limit": 1})
            return True
        except Exception:  # noqa: BLE001
            return False

    def balances(self) -> dict[str, Any]:
        return dict(
            self._wrap("balances", lambda: self._require_client().account.balances())
            or {}
        )

    def buying_power(self) -> float:
        try:
            return float(self.balances().get("buyingPower") or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def positions(self) -> dict[str, Any]:
        result = self._wrap(
            "positions", lambda: self._require_client().portfolio.positions()
        )
        return dict((result or {}).get("positions") or {})

    def market(self, slug: str) -> dict[str, Any]:
        result = self._wrap(
            "market lookup",
            lambda: self._require_client().markets.retrieve_by_slug(slug),
        )
        return dict((result or {}).get("market") or result or {})

    def tick_size(self, slug: str) -> float:
        """The market's minimum price increment.

        Falls back to a coarse tick rather than raising: a wrong-but-coarse
        tick rounds a price to something legal, while guessing finer than the
        venue allows gets every order rejected.
        """
        try:
            value = float(self.market(slug).get("orderPriceMinTickSize") or 0)
        except (LiveClientError, TypeError, ValueError):
            return 0.01
        return value if value > 0 else 0.01

    def order_book(self, slug: str) -> dict[str, Any]:
        result = self._wrap(
            "order book", lambda: self._require_client().markets.book(slug)
        )
        return dict((result or {}).get("marketData") or {})

    def open_orders(self, slug: str | None = None) -> list[dict[str, Any]]:
        params = {"marketSlug": slug} if slug else None
        result = self._wrap(
            "open orders", lambda: self._require_client().orders.list(params)
        )
        return list((result or {}).get("orders") or [])

    # -- writes --------------------------------------------------------

    def place_limit(
        self,
        slug: str,
        side: str,
        price: float,
        size: float,
        tick_size: float = 0.01,
        *,
        long: bool = True,
        tif: str = TIF_GTC,
    ) -> dict[str, Any]:
        """Post a resting limit order. This spends real money."""
        snapped = round_to_tick(price, tick_size)
        params = {
            "marketSlug": slug,
            "intent": order_intent(side, long=long),
            "type": TYPE_LIMIT,
            "price": price_amount(snapped),
            "quantity": size,
            "tif": tif,
        }
        return dict(
            self._wrap(
                "place order", lambda: self._require_client().orders.create(params)
            )
            or {}
        )

    def preview_limit(
        self,
        slug: str,
        side: str,
        price: float,
        size: float,
        tick_size: float = 0.01,
        *,
        long: bool = True,
    ) -> dict[str, Any]:
        """Ask the venue what an order would do, without sending it.

        The international venue had no equivalent, so the only way to learn
        an order was malformed was to have it rejected. Using this before the
        first real order turns a rejection into a dry run.
        """
        params = {
            "marketSlug": slug,
            "intent": order_intent(side, long=long),
            "type": TYPE_LIMIT,
            "price": price_amount(round_to_tick(price, tick_size)),
            "quantity": size,
        }
        return dict(
            self._wrap(
                "preview order", lambda: self._require_client().orders.preview(params)
            )
            or {}
        )

    def cancel(self, order_id: str, slug: str) -> Any:
        """Cancel one order. The venue wants the market slug alongside the id."""
        return self._wrap(
            "cancel",
            lambda: self._require_client().orders.cancel(
                order_id, {"marketSlug": slug}
            ),
        )

    def cancel_all(self, slug: str | None = None) -> Any:
        params = {"marketSlug": slug} if slug else None
        return self._wrap(
            "cancel all", lambda: self._require_client().orders.cancel_all(params)
        )

    def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            try:
                client.close()
            except Exception:  # noqa: BLE001 - closing must never raise
                pass


def order_id_of(response: Any) -> str | None:
    """Pull an order id out of whatever shape the SDK handed back."""
    if response is None:
        return None
    for key in ("id", "orderId", "order_id", "orderID"):
        value = getattr(response, key, None)
        if value is None and isinstance(response, dict):
            value = response.get(key)
        if value:
            return str(value)
    return None


__all__ = [
    "ClientConfig",
    "LiveClient",
    "LiveClientError",
    "AuthError",
    "order_intent",
    "order_id_of",
    "price_amount",
    "round_to_tick",
    "TIF_GTC",
    "TIF_IOC",
    "TIF_FOK",
    "TYPE_LIMIT",
    "TYPE_MARKET",
]
