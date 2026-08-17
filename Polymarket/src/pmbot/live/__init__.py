"""Live venue access. Importing this package does nothing on its own —
the SDK is loaded lazily and no credentials are read until a check runs.

There is no `approvals` module any more, and its absence is the single
clearest measure of what this migration removed. On the international venue
a fresh wallet had to grant the exchange standing permission to move its
USDC (ERC-20) and its outcome shares (ERC-1155) before a single order could
rest, which meant an on-chain transaction to an address that had to be
exactly right — approving the wrong one hands a stranger your balance, and
it is not a failed transaction, it is a working one.

Polymarket US has no wallet and no chain. Your KYC'd account holds USD, the
exchange settles it, and an API key is the whole of the authorisation
story. That entire failure mode no longer exists.
"""

from .checks import CheckRun, Step, run_checks
from .client import ClientConfig, LiveClient, LiveClientError, order_intent

__all__ = [
    "CheckRun",
    "Step",
    "run_checks",
    "ClientConfig",
    "LiveClient",
    "LiveClientError",
    "order_intent",
]
