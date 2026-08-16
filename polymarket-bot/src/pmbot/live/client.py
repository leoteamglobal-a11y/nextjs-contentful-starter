"""Thin adapter over the Polymarket SDK.

Everything that knows an SDK's method names lives in this one file, so when
the SDK changes — and it has, twice: `py-clob-client` is archived,
`py-clob-client-v2` points at a newer unified SDK — there is exactly one
file to fix rather than a rewrite.

⚠️ ADAPTER NOTES — UNVERIFIED SURFACE ⚠️

None of the calls below have been run against the real venue: the machine
this was written on had `*.polymarket.com` blocked by network policy. The
shapes come from the published SDK README. Before trusting any of it, run

    python -m pmbot.cli live-check <market>

which exercises each call in order and tells you which one broke. The list
of things most likely to be wrong, in order:

1. `create_or_derive_api_key()` vs `create_api_key()` / `derive_api_key()`.
2. Whether `signature_type` must be set: 0 for a plain EOA wallet, 1 for an
   email/Magic proxy, 2 for a browser proxy. Getting this wrong signs
   orders for the wrong address and every order is rejected.
3. Whether `funder` (the address holding the USDC) must be passed
   separately from the signing key.
4. The tick size of the specific market, which limits price precision.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any


class LiveClientError(RuntimeError):
    """Anything that goes wrong talking to the venue."""


def _require_sdk() -> Any:
    """Import the SDK only when actually going live.

    Phases 1 and 2 must stay installable and runnable without it — nothing
    that can sign an order should be a dependency of code that only reads.
    """
    try:
        import py_clob_client_v2 as sdk  # type: ignore
    except ImportError:  # pragma: no cover - exercised only with the SDK absent
        try:
            import py_clob_client as sdk  # type: ignore
        except ImportError as exc:
            raise LiveClientError(
                "No Polymarket SDK installed. For live use:\n"
                "    pip install py-clob-client-v2\n"
                "See https://github.com/Polymarket/py-sdk for the newer "
                "unified SDK if this adapter needs updating."
            ) from exc
    return sdk


@dataclass
class WalletConfig:
    private_key: str
    funder: str | None = None
    chain_id: int = 137  # Polygon
    signature_type: int = 0  # 0 = EOA, 1 = email/Magic proxy, 2 = browser proxy
    host: str = "https://clob.polymarket.com"

    @classmethod
    def from_env(cls) -> "WalletConfig":
        key = os.getenv("PMBOT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
        if not key:
            raise LiveClientError(
                "No private key. Set PMBOT_PRIVATE_KEY in your environment.\n"
                "Use a FRESH wallet holding only what you are willing to lose."
            )
        return cls(
            private_key=key,
            funder=os.getenv("PMBOT_FUNDER") or None,
            chain_id=int(os.getenv("PMBOT_CHAIN_ID", "137")),
            signature_type=int(os.getenv("PMBOT_SIGNATURE_TYPE", "0")),
            host=os.getenv("PMBOT_CLOB_HOST", "https://clob.polymarket.com"),
        )

    def redacted(self) -> str:
        tail = self.private_key[-4:] if len(self.private_key) > 4 else "????"
        return f"key=...{tail} chain={self.chain_id} sig_type={self.signature_type}"


class LiveClient:
    """Wraps the SDK client. Constructed only when going live."""

    def __init__(self, config: WalletConfig) -> None:
        self.config = config
        self._sdk = _require_sdk()
        self._client: Any = None

    # -- setup ---------------------------------------------------------

    def connect(self) -> str:
        """Build the client and derive L2 credentials. Returns the address."""
        sdk = self._sdk
        try:
            kwargs: dict[str, Any] = {
                "host": self.config.host,
                "chain_id": self.config.chain_id,
                "key": self.config.private_key,
            }
            if self.config.signature_type:
                kwargs["signature_type"] = self.config.signature_type
            if self.config.funder:
                kwargs["funder"] = self.config.funder

            self._client = sdk.ClobClient(**kwargs)  # type: ignore[attr-defined]

            # L1 wallet signature -> L2 HMAC credentials.
            creds = self._call_first(
                self._client,
                ["create_or_derive_api_key", "derive_api_key", "create_api_key"],
            )
            if creds is not None and hasattr(self._client, "set_api_creds"):
                self._client.set_api_creds(creds)
        except LiveClientError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"connect failed: {type(exc).__name__}: {exc}") from exc

        return self.address()

    def _call_first(self, obj: Any, names: list[str]) -> Any:
        """Call the first method that exists, so an SDK rename is survivable."""
        for name in names:
            method = getattr(obj, name, None)
            if callable(method):
                return method()
        raise LiveClientError(
            f"SDK exposes none of {names}. The adapter needs updating for this "
            "SDK version — see the ADAPTER NOTES at the top of this file."
        )

    def address(self) -> str:
        for name in ("get_address", "get_wallet_address"):
            method = getattr(self._client, name, None)
            if callable(method):
                return str(method())
        return str(getattr(self._client, "address", "<unknown>"))

    # -- reads ---------------------------------------------------------

    def ok(self) -> bool:
        try:
            return bool(self._client.get_ok())
        except Exception:  # noqa: BLE001
            return False

    def tick_size(self, token_id: str) -> float:
        try:
            return float(self._client.get_tick_size(token_id))
        except Exception:  # noqa: BLE001
            return 0.01

    def order_book(self, token_id: str) -> Any:
        return self._client.get_order_book(token_id)

    def open_orders(self) -> list[dict[str, Any]]:
        try:
            orders = self._client.get_orders()
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"get_orders failed: {exc}") from exc
        return list(orders or [])

    # -- writes --------------------------------------------------------

    def place_limit(
        self, token_id: str, side: str, price: float, size: float, tick_size: float
    ) -> dict[str, Any]:
        """Post a GTC limit order. This spends real money."""
        sdk = self._sdk
        try:
            order_args = sdk.clob_types.OrderArgs(  # type: ignore[attr-defined]
                token_id=token_id,
                price=price,
                size=size,
                side=sdk.order_builder.constants.BUY  # type: ignore[attr-defined]
                if side == "BUY"
                else sdk.order_builder.constants.SELL,  # type: ignore[attr-defined]
            )
            return self._client.create_and_post_order(order_args)
        except AttributeError:
            # Newer SDKs expose the enums differently; try the simple path.
            try:
                return self._client.create_and_post_order(
                    {"token_id": token_id, "price": price, "size": size, "side": side}
                )
            except Exception as exc:  # noqa: BLE001
                raise LiveClientError(
                    f"place_limit failed: {exc}. See ADAPTER NOTES."
                ) from exc
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"place_limit failed: {exc}") from exc

    def cancel(self, order_id: str) -> Any:
        try:
            return self._client.cancel(order_id)
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"cancel failed: {exc}") from exc

    def cancel_all(self) -> Any:
        try:
            return self._client.cancel_all()
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"cancel_all failed: {exc}") from exc
