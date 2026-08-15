"""Configuration.

Phase 1 is deliberately read-only: this module refuses to look at a private
key at all. When you move to phase 3 (live trading) you add credential
loading here, and you add it behind an explicit opt-in flag.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

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

    # Guard rails that exist even though phase 1 cannot trade. They are here
    # so that the risk module has something to read from day one, rather than
    # being bolted on the day real money shows up.
    max_position_usdc: float = 0.0
    max_daily_loss_usdc: float = 0.0
    trading_enabled: bool = False

    tags: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            journal_dir=Path(os.getenv("PMBOT_JOURNAL_DIR", str(DEFAULT_JOURNAL_DIR))),
            http_timeout_s=float(os.getenv("PMBOT_HTTP_TIMEOUT_S", "15")),
            ws_ping_interval_s=float(os.getenv("PMBOT_WS_PING_S", "10")),
            # trading_enabled is intentionally NOT readable from the
            # environment. Flipping it requires editing code, which requires
            # a diff, which requires you to think about it.
            trading_enabled=False,
        )
