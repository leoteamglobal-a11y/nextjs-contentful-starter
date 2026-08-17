"""The Polymarket US fee schedule, exactly.

Effective exchange-wide from 12 AM ET, Wednesday 1 July 2026.

    Fee = Θ × C × p × (1 - p)

    C  contracts
    p  trade price, $0.01 to $0.99
    Θ  fee coefficient: +0.06 taker, -0.0125 maker

**This is not a rate on notional, and that difference is the whole reason
this module exists.** A conventional `fee_bps` model charges
`notional × rate`, i.e. proportional to `p × C`. This venue charges
proportional to `p × (1 - p) × C`. Divide one by the other and the implied
bps rate is `Θ × (1 - p)` — a *function of price*, not a constant.

The two disagree by a factor of ten across a realistic quoting range:

    p = 0.50   fee ∝ 0.25   implied maker rate  -62.5 bps
    p = 0.90   fee ∝ 0.09   implied maker rate  -12.5 bps

So no single `fee_bps` can represent this schedule. A backtest that picks
one is right at exactly one price and wrong everywhere else — and it is
wrong in the expensive direction near the extremes, which is precisely
where a market maker on a sports book spends its time.

Two consequences worth being explicit about:

1. **The maker rebate is income.** Θ is negative for makers, so a fee here
   is a negative number and the cash flow is inbound. A resting quote that
   gets taken is paid ~$0.31 per 100 contracts at the midpoint. For a
   strategy whose entire edge is a cent or two of spread, that is not a
   rounding detail — it can be a material part of the P&L.

2. **Fees are lowest at the extremes.** `p(1-p)` is maximal at $0.50 and
   collapses towards 0 and 1. A taker pays $1.50 per 100 contracts at the
   midpoint and $0.06 at $0.01. That shape rewards quoting long-shot and
   near-certain markets and penalises coin flips, which is the opposite of
   what a flat-bps intuition suggests.

Rounding is banker's (half to even) to the cent, per fill. Verified against
every row of the published table.
"""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

#: Fee coefficients. Positive is money out, negative is money in.
THETA_TAKER = 0.06
THETA_MAKER = -0.0125

#: The schedule is only defined inside this band.
MIN_PRICE = 0.01
MAX_PRICE = 0.99


def round_cents(value: float) -> float:
    """Banker's rounding to the cent, as the venue does it.

    Round-half-to-even, so $0.025 becomes $0.02 and $0.035 becomes $0.04.
    Over many small fills, always rounding half up would bias the modelled
    cost upward; this is what the exchange actually does.
    """
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))


def _exact(contracts: float, price: float, theta: float) -> Decimal:
    """`Θ × C × p × (1 - p)` in exact decimal arithmetic.

    Float arithmetic is not good enough here, and the published table is
    what proves it. At $0.05 the exact taker fee on 100 contracts is
    $0.2850, which banker's-rounds *down* to $0.28 — the venue's own table
    says $0.28. In binary floating point the same expression evaluates to
    0.28500000000000003, which rounds *up* to $0.29.

    A cent on one fill is nothing. The same half-cent bias applied in the
    same direction across every fill of a backtest is not, and it lands on
    the side that makes a strategy look worse than it is — or, with the
    sign flipped on the maker rebate, better.
    """
    if contracts <= 0:
        return Decimal(0)
    bounded = min(max(price, 0.0), 1.0)
    p = Decimal(str(bounded))
    return Decimal(str(theta)) * Decimal(str(contracts)) * p * (Decimal(1) - p)


def _rounded(contracts: float, price: float, theta: float) -> float:
    return float(
        _exact(contracts, price, theta).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_EVEN
        )
    )


def exact_fee(contracts: float, price: float, theta: float) -> float:
    """`Θ × C × p × (1 - p)`, unrounded. Positive is a cost."""
    return float(_exact(contracts, price, theta))


def taker_fee(contracts: float, price: float) -> float:
    """What an aggressive order pays, rounded to the cent."""
    return _rounded(contracts, price, THETA_TAKER)


def maker_fee(contracts: float, price: float) -> float:
    """What a resting order is paid, as a negative fee.

    Negative because the rest of the system treats a fee as a cost: a
    negative cost is income, and the cash flow lands the right way round
    without anything downstream needing a special case.
    """
    return _rounded(contracts, price, THETA_MAKER)


def maker_rebate(contracts: float, price: float) -> float:
    """The same number as a positive amount received. For reporting."""
    return -maker_fee(contracts, price)


def implied_bps(price: float, theta: float = THETA_MAKER) -> float:
    """The flat-bps rate that would match this schedule *at this price only*.

    Useful for sanity-checking a legacy `fee_bps` figure, and for showing
    exactly how much a constant misprices the tails.
    """
    return theta * (1.0 - price) * 10_000.0


def fee_model(role: str = "maker"):
    """A `(side, price, size) -> fee` callable for `PaperBroker.fee_model`.

    A resting limit order is by definition the passive side, so a maker
    strategy backtested against this simulator earns the rebate on every
    fill. `taker` is here for completeness and for modelling a strategy
    that crosses the spread.
    """
    role = (role or "").strip().lower()
    if role == "maker":
        return lambda side, price, size: maker_fee(size, price)
    if role == "taker":
        return lambda side, price, size: taker_fee(size, price)
    if role in ("none", "zero", ""):
        return lambda side, price, size: 0.0
    raise ValueError(f"unknown fee role {role!r}: expected maker, taker or none")


#: Taker-fee rebate tiers, by the prior calendar month's notional taker
#: volume. Paid weekly. Nothing here is reachable on a $70 account — it is
#: recorded so the number is not mistaken for zero at scale.
TAKER_REBATE_TIERS = (
    (250_000.0, 0.10),
    (1_000_000.0, 0.25),
    (10_000_000.0, 0.50),
)


def taker_rebate_rate(prior_month_taker_volume: float) -> float:
    """Fraction of taker fees rebated, given last month's taker volume."""
    rate = 0.0
    for threshold, tier_rate in TAKER_REBATE_TIERS:
        if prior_month_taker_volume >= threshold:
            rate = tier_rate
    return rate
