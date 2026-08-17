"""Request signing for the Polymarket US authenticated API.

This is the whole authentication story, and it is worth noting how little
of it there is. The international venue signed orders with an Ethereum
private key, derived L2 credentials from an L1 wallet signature, and needed
on-chain token approvals before a single order could rest. None of that
exists here. Polymarket US is a regulated exchange: you are already KYC'd,
the exchange knows who you are, and an API key is enough.

An API key is a pair:

    key_id      a UUID, safe to log
    secret_key  base64 Ed25519 seed, never log it

Every authenticated request carries three headers:

    X-PM-Access-Key   the key id
    X-PM-Timestamp    now, in milliseconds
    X-PM-Signature    Ed25519(timestamp + METHOD + path), base64

Two details that are easy to get wrong and expensive to debug:

1. **The signature covers the path only — never the query string.** A
   request to `/v1/markets?limit=10` signs `/v1/markets`. This is checked
   against the official SDK, which passes params separately from the signed
   path; signing the query too yields a 401 with no useful message.

2. **Timestamps must be within 30 seconds of server time.** A clock that
   has drifted looks exactly like a bad key from the client side. If
   everything suddenly 401s, check the clock before regenerating keys.
"""

from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass


class AuthError(RuntimeError):
    """Missing, malformed, or unusable credentials."""


def _signing_key(secret_key: str):
    """Build an Ed25519 signing key from the base64 secret.

    Accepts either a bare 32-byte seed or the 64-byte seed+public form that
    some key exports use, taking the seed from the front of the latter.
    """
    try:
        from cryptography.hazmat.primitives.asymmetric import ed25519
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise AuthError(
            "cryptography is not installed. Install it with:\n"
            "    pip install -r requirements.txt"
        ) from exc

    try:
        raw = base64.b64decode(secret_key, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise AuthError(
            "secret key is not valid base64. Copy it exactly as the developer "
            "portal showed it — it is displayed only once."
        ) from exc

    if len(raw) not in (32, 64):
        raise AuthError(
            f"secret key decodes to {len(raw)} bytes; expected 32 (seed) or 64 "
            "(seed+public). This is probably the key id, not the secret key."
        )

    try:
        return ed25519.Ed25519PrivateKey.from_private_bytes(raw[:32])
    except Exception as exc:  # noqa: BLE001
        raise AuthError(f"secret key is not a usable Ed25519 seed: {exc}") from exc


def sign(secret_key: str, method: str, path: str, timestamp_ms: str) -> str:
    """Sign one request. `path` must exclude the query string."""
    message = f"{timestamp_ms}{method.upper()}{path}".encode()
    signature = _signing_key(secret_key).sign(message)
    return base64.b64encode(signature).decode()


def now_ms() -> str:
    return str(int(time.time() * 1000))


@dataclass(frozen=True)
class Credentials:
    """An API key pair. Read from the environment, never from a file in the
    repo, and never printed except through `redacted()`."""

    key_id: str
    secret_key: str

    @classmethod
    def from_env(cls) -> "Credentials":
        key_id = os.getenv("POLYMARKET_KEY_ID") or os.getenv("PMBOT_KEY_ID")
        secret_key = os.getenv("POLYMARKET_SECRET_KEY") or os.getenv(
            "PMBOT_SECRET_KEY"
        )
        if not key_id or not secret_key:
            raise AuthError(
                "No Polymarket US API credentials. Set both:\n"
                "    export POLYMARKET_KEY_ID=...\n"
                "    export POLYMARKET_SECRET_KEY=...\n"
                "Create a key at https://polymarket.us/developer (the secret "
                "is shown once)."
            )
        return cls(key_id=key_id, secret_key=secret_key)

    @classmethod
    def from_env_or_none(cls) -> "Credentials | None":
        """For code paths that are allowed to run unauthenticated."""
        try:
            return cls.from_env()
        except AuthError:
            return None

    def validate(self) -> None:
        """Fail now, with a clear message, rather than on a 401 later."""
        _signing_key(self.secret_key)

    def headers(self, method: str, path: str) -> dict[str, str]:
        timestamp = now_ms()
        return {
            "X-PM-Access-Key": self.key_id,
            "X-PM-Timestamp": timestamp,
            "X-PM-Signature": sign(self.secret_key, method, path, timestamp),
            "Content-Type": "application/json",
        }

    def redacted(self) -> str:
        tail = self.key_id[-6:] if len(self.key_id) > 6 else "??????"
        return f"key_id=...{tail} secret=<{len(self.secret_key)} chars, hidden>"
