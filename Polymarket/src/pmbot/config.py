"""Configuration.

The read-only posture from the earlier design does not survive the move to
Polymarket US, and pretending otherwise would be worse than saying so: on
this venue the market feed itself is authenticated, so even `watch` — which
only records order books — now needs an API key.

The guard rail that replaces it is narrower but real. Credentials are read,
but `trading_enabled` still cannot be set from the environment, and nothing
in this module can place an order. The one key that could is the same key
that reads the feed, so the separation has moved from "no credentials at
all" to "credentials, but the only code that can send an order lives in
`live/` and asks first".
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from .auth import Credentials

DEFAULT_JOURNAL_DIR = Path("journal")


@dataclass(frozen=True)
class Settings:
    """Runtime settings. Nothing here can move money."""

    journal_dir: Path = DEFAULT_JOURNAL_DIR
    http_timeout_s: float = 15.0

    # WebSocket resilience.
    ws_ping_interval_s: float = 10.0
    ws_reconnect_base_s: float = 1.0
    ws_reconnect_max_s: float = 60.0

    # Subscribe to the trade tape alongside the book. Costs nothing extra on
    # the same socket and is the difference between a backtest that can fill
    # a resting quote and one that essentially never does.
    subscribe_trades: bool = True

    # Guard rails that exist even where nothing can trade yet, so the risk
    # module has something to read from day one rather than being bolted on
    # the day real money shows up.
    max_position_usd: float = 0.0
    max_daily_loss_usd: float = 0.0
    trading_enabled: bool = False

    credentials: Credentials | None = None

    tags: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            journal_dir=Path(os.getenv("PMBOT_JOURNAL_DIR", str(DEFAULT_JOURNAL_DIR))),
            http_timeout_s=float(os.getenv("PMBOT_HTTP_TIMEOUT_S", "15")),
            ws_ping_interval_s=float(os.getenv("PMBOT_WS_PING_S", "10")),
            subscribe_trades=os.getenv("PMBOT_SUBSCRIBE_TRADES", "1") != "0",
            # Credentials are optional here: `market`, `report` and
            # `backtest` all work without them, and failing at import time
            # would make the offline half of the tool unusable.
            credentials=Credentials.from_env_or_none(),
            # trading_enabled is intentionally NOT readable from the
            # environment. Flipping it requires editing code, which requires
            # a diff, which requires you to think about it.
            trading_enabled=False,
        )

    def require_credentials(self) -> Credentials:
        """Credentials or a useful error — used by anything that streams."""
        if self.credentials is None:
            from .auth import AuthError

            raise AuthError(
                "This command needs Polymarket US API credentials. Set:\n"
                "    export POLYMARKET_KEY_ID=...\n"
                "    export POLYMARKET_SECRET_KEY=...\n"
                "Unlike the international venue, the market data WebSocket "
                "here is authenticated — there is no anonymous feed."
            )
        return self.credentials
