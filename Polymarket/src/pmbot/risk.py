"""The veto layer.

Every intent a strategy produces passes through here before it reaches any
broker. Nothing else in the system is allowed to place an order, which
means there is exactly one place to audit when you ask "could this bot lose
more than X?".

This exists in phase 2, before real money, on purpose: a risk layer written
the day you go live is a risk layer that has never been exercised. Here it
runs against every backtest, so by the time it matters it has already
vetoed thousands of orders.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .intents import CancelAll, CancelQuote, Intent, PlaceQuote
from .portfolio import Portfolio


@dataclass
class RiskLimits:
    max_shares_per_token: float = 500.0
    max_exposure: float = 1_000.0
    max_loss: float = 100.0
    max_order_size: float = 200.0
    min_price: float = 0.02
    max_price: float = 0.98
    kill_switch_file: Path | None = None


@dataclass
class RiskManager:
    limits: RiskLimits = field(default_factory=RiskLimits)
    vetoes: dict[str, int] = field(default_factory=dict)
    halted: bool = False
    halt_reason: str = ""

    def _veto(self, reason: str) -> None:
        self.vetoes[reason] = self.vetoes.get(reason, 0) + 1

    def halt(self, reason: str) -> None:
        if not self.halted:
            self.halted = True
            self.halt_reason = reason

    def check_halt(self, portfolio: Portfolio, marks: dict[str, float | None]) -> bool:
        """Trip the halt on drawdown or kill switch. Once halted, stay halted.

        Recovering automatically from a loss limit means the limit is not a
        limit. Restarting is a human decision.
        """
        if self.halted:
            return True

        pnl = portfolio.realized + portfolio.unrealized(marks)
        if pnl <= -abs(self.limits.max_loss):
            self.halt(f"loss limit hit ({pnl:.2f})")
            return True

        kill = self.limits.kill_switch_file
        # A file on disk, not a config value: stopping the bot must not
        # require a redeploy.
        if kill is not None and Path(kill).exists():
            self.halt(f"kill switch present at {kill}")
            return True

        return False

    def filter(
        self,
        intents: list[Intent],
        portfolio: Portfolio,
        marks: dict[str, float | None],
        resting_by_token: dict[str, float] | None = None,
    ) -> list[Intent]:
        """Return only the intents that are allowed through.

        Cancellations always pass: reducing exposure is never something risk
        management should block.
        """
        if self.check_halt(portfolio, marks):
            # Halted means flatten and stop, not freeze with orders resting.
            return [CancelAll(reason=self.halt_reason)]

        resting_by_token = resting_by_token or {}
        allowed: list[Intent] = []
        exposure = portfolio.exposure(marks)

        for intent in intents:
            if isinstance(intent, (CancelQuote, CancelAll)):
                allowed.append(intent)
                continue
            if not isinstance(intent, PlaceQuote):
                continue

            if intent.size <= 0:
                self._veto("non_positive_size")
                continue
            if intent.size > self.limits.max_order_size:
                self._veto("order_too_large")
                continue
            if not (self.limits.min_price <= intent.price <= self.limits.max_price):
                # Deep out-of-the-money quotes are where fat fingers hide, and
                # where the spread is too thin to pay for the tail risk.
                self._veto("price_out_of_band")
                continue

            signed = intent.size if intent.side == "BUY" else -intent.size
            projected = portfolio.position(intent.token_id).shares + signed
            if abs(projected) > self.limits.max_shares_per_token:
                self._veto("position_limit")
                continue

            # Count what this order would add if fully filled, plus what is
            # already resting: a stack of small orders is still a big one.
            pending = resting_by_token.get(intent.token_id, 0.0)
            if exposure + intent.notional + pending > self.limits.max_exposure:
                self._veto("exposure_limit")
                continue

            exposure += intent.notional
            allowed.append(intent)

        return allowed

    def summary(self) -> dict[str, object]:
        return {
            "halted": self.halted,
            "halt_reason": self.halt_reason,
            "vetoes": dict(sorted(self.vetoes.items(), key=lambda kv: -kv[1])),
            "total_vetoed": sum(self.vetoes.values()),
        }
