"""Thin adapter over the Polymarket SDK.

Everything that knows an SDK's method names lives in this one file, so when
the SDK changes — and it has, twice — there is exactly one file to fix
rather than a rewrite. That bet paid off: this file was rewritten against
the real SDK without a line changing anywhere else.

VERIFIED 2026-08-17 against `polymarket-client` 0.6.0, the official unified
Python SDK (https://github.com/Polymarket/py-sdk). Every read below was run
live. Every *write* — placing, cancelling — is still unexercised, because
exercising it costs money; that is what `live-check --live` is for.

## What the previous version of this file got wrong

It targeted `py_clob_client_v2`, guessed from a README. Almost none of it
survived contact with the real package:

| assumed                            | actual (`polymarket-client` 0.6.0)         |
| ---------------------------------- | ------------------------------------------ |
| `import py_clob_client_v2`         | `from polymarket import SecureClient`      |
| `ClobClient(host=, chain_id=, key=)` | `SecureClient.create(private_key=, wallet=)` |
| `create_or_derive_api_key()`       | done inside `create()`; read `.credentials` |
| `set_api_creds(creds)`             | gone — `create()` installs them            |
| `signature_type=` parameter        | derived from the wallet; see below         |
| `get_ok()`                         | no such method (plain REST `/ok`)          |
| `get_tick_size(token)`             | `get_order_book().tick_size`               |
| `get_orders()`                     | `list_open_orders()` -> paginator          |
| `create_and_post_order(OrderArgs)` | `place_limit_order(token_id=, price=, ...)` |
| `cancel(order_id)`                 | `cancel_order(order_id=)`                  |
| `get_address()`                    | `.wallet` / `.signer` properties           |

`cancel_all()` was the only call that was already right.

## ⚠️ This adapter targets INTERNATIONAL Polymarket, not Polymarket US ⚠️

Everything here — this SDK, the Polygon signing it does, wallets, contract
approvals, `signature_type` — belongs to the international, self-custody
venue. **The account this bot is meant to trade is on Polymarket US**, the
CFTC-regulated, KYC'd entity, where positions are held in a brokerage
account rather than a wallet you sign for.

None of the live path below has been checked against Polymarket US, and
there is no reason to assume it transfers: a regulated US venue does not
generally expose the same order API as an on-chain exchange. Phase 3a is
therefore **blocked on establishing what Polymarket US's API actually is**,
which is a question about that venue, not about this file.

What follows is still correct for the international venue, and is kept
because the surface it documents was verified there. Do not run
`live-check --live` against a US account on the strength of it.

## Signature type is derived, not configured

There is no `signature_type` argument any more, and setting one was the
single most dangerous guess in the old adapter. The SDK infers it by
deriving each known wallet layout from the signing key and seeing which one
matches the `wallet` address you pass (`polymarket._internal.wallet.
classify_wallet_type`):

| wallet                              | type            | signature_type |
| ----------------------------------- | --------------- | -------------- |
| the signing key's own address       | `EOA`           | 0              |
| email / Magic proxy                 | `POLY_PROXY`    | 1              |
| browser wallet proxy (Gnosis Safe)  | `GNOSIS_SAFE`   | 2              |
| deposit wallet                      | `DEPOSIT_WALLET`| 3              |

This is strictly better than a configured integer: a wrong `funder` cannot
silently sign for the wrong address, because a wallet that derives from no
known layout is rejected up front with `UserInputError` instead of
producing orders the venue rejects for reasons it will not explain.

`PMBOT_FUNDER` sets the `wallet` the key acts for. Leave it unset only for
a plain EOA that funds itself; for any proxy wallet it is the address shown
in the venue's UI, and omitting it silently signs for a different account.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx

from .. import endpoints


class LiveClientError(RuntimeError):
    """Anything that goes wrong talking to the venue."""


def _require_sdk() -> Any:
    """Import the SDK only when actually going live.

    Phases 1 and 2 must stay installable and runnable without it — nothing
    that can sign an order should be a dependency of code that only reads.
    """
    try:
        import polymarket as sdk  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised only without the SDK
        raise LiveClientError(
            "The Polymarket SDK is not installed. For live use:\n"
            "    pip install polymarket-client\n"
            "Note the package name: `polymarket-client` on PyPI, imported as\n"
            "`polymarket`. The older `py-clob-client` and `py-clob-client-v2`\n"
            "packages are superseded and this adapter no longer targets them."
        ) from exc
    return sdk


@dataclass
class WalletConfig:
    """The two things needed to sign: a key, and the wallet it acts for.

    `funder` is the address that holds the money. For a plain EOA it is the
    signing key's own address and may be omitted; for any proxy wallet it
    is a *different* address, and orders signed without it are signed for
    an empty wallet.
    """

    private_key: str
    funder: str | None = None

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
            funder=os.getenv("PMBOT_FUNDER") or os.getenv("PMBOT_WALLET") or None,
        )

    def redacted(self) -> str:
        tail = self.private_key[-4:] if len(self.private_key) > 4 else "????"
        return f"key=...{tail} funder={self.funder}"


class LiveClient:
    """Wraps the SDK client. Constructed only when going live."""

    def __init__(self, config: WalletConfig) -> None:
        self.config = config
        self._sdk = _require_sdk()
        self._client: Any = None
        #: How the SDK classified the key/funder pair — EOA, POLY_PROXY,
        #: GNOSIS_SAFE or DEPOSIT_WALLET. Worth printing: it is the one
        #: thing that says which account orders will actually be signed for.
        self.wallet_type: str | None = None

    # -- setup ---------------------------------------------------------

    def connect(self) -> str:
        """Build the client and derive L2 credentials. Returns the address.

        One call does what used to take three: `create()` signs the L1
        challenge, creates or derives the L2 API key, installs it, and
        classifies the wallet.
        """
        sdk = self._sdk
        try:
            self._client = sdk.SecureClient.create(
                private_key=self.config.private_key,
                wallet=self.config.funder,
            )
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(
                f"connect failed: {type(exc).__name__}: {exc}\n"
                "A 'does not match the signer' error here means PMBOT_FUNDER is\n"
                "not a wallet this key controls — check it against the address\n"
                "in the Polymarket UI."
            ) from exc

        self.wallet_type = str(getattr(self._client, "wallet_type", "") or "")
        return self.address()

    def address(self) -> str:
        return str(getattr(self._client, "wallet", "<unknown>"))

    def signer_address(self) -> str:
        signer = getattr(self._client, "signer", None)
        return str(getattr(signer, "address", signer or "<unknown>"))

    # -- reads ---------------------------------------------------------

    def ok(self) -> bool:
        """Venue liveness. Public REST — the SDK exposes no equivalent."""
        try:
            response = httpx.get(f"{endpoints.CLOB_BASE}/ok", timeout=10.0)
            return response.status_code == 200
        except Exception:  # noqa: BLE001
            return False

    def order_book(self, token_id: str) -> Any:
        """The book, which also carries this market's trading parameters."""
        try:
            return self._client.get_order_book(token_id=token_id)
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"get_order_book failed: {exc}") from exc

    def open_orders(self) -> list[Any]:
        """Every resting order. The SDK paginates; the plumbing check does
        not care about pages, and one page of open orders is all a capped
        test run can produce."""
        try:
            return list(self._client.list_open_orders().iter_items())
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"list_open_orders failed: {exc}") from exc

    # -- writes --------------------------------------------------------

    def place_limit(
        self, token_id: str, side: str, price: float, size: float
    ) -> Any:
        """Post a GTC limit order. This spends real money.

        `post_only` is set: a plumbing-check order that crosses the spread
        would be a taker fill, which is exactly what this run is built not
        to do. If the price is wrong, the venue rejects the order rather
        than filling it.
        """
        try:
            return self._client.place_limit_order(
                token_id=token_id,
                price=price,
                size=size,
                side=side,
                post_only=True,
            )
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"place_limit failed: {exc}") from exc

    def cancel(self, order_id: str) -> Any:
        try:
            return self._client.cancel_order(order_id=order_id)
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"cancel failed: {exc}") from exc

    def cancel_all(self) -> Any:
        try:
            return self._client.cancel_all()
        except Exception as exc:  # noqa: BLE001
            raise LiveClientError(f"cancel_all failed: {exc}") from exc

    def close(self) -> None:
        closer = getattr(self._client, "close", None)
        if callable(closer):
            closer()
