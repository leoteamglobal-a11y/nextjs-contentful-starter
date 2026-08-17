"""What an order actually costs you, by this venue's rules.

`risk.py` is venue-agnostic and measures exposure as `|shares| x mark`. That
is the right abstraction for a backtest and it is *wrong* about money here,
in a direction that matters.

Polymarket US is fully collateralised, and the two sides are not symmetric:

    Buying at $0.40   costs $0.40. Max loss $0.40.
    Shorting at $0.40 pays you $0.40, but locks $1.00 of margin per
                      contract. Net buying power consumed: $0.60.

So a short at $0.40 ties up **1.5x** what the agnostic exposure calculation
thinks it does. On a $70 account that difference is the whole account.

The venue's own table, for a trade at $0.40:

| Participant | Cash flow | Margin | Buying power change |
|-------------|-----------|--------|---------------------|
| Buyer       | -$0.40    | $0     | -$0.40              |
| Seller      | +$0.40    | $1.00  | -$0.60              |

Everything here is pure arithmetic on those rules, so it is testable without
a venue — which matters, because the alternative way to discover you had the
formula backwards is a margin call.
"""

from __future__ import annotations

# Every contract settles at $1.00 or $0.00. The margin a short posts is the
# full payout, not its max loss.
PAYOUT = 1.0


def long_cost(price: float, size: float) -> float:
    """Buying power consumed by opening a long."""
    return price * size


def short_cost(price: float, size: float) -> float:
    """Buying power consumed by opening a short.

    You receive `price` and post `PAYOUT` of margin, so the net is the
    complement. There is no collateral release from a favourable move: the
    full payout stays locked until settlement.
    """
    return (PAYOUT - price) * size


def opening_cost(side: str, price: float, size: float) -> float:
    """Buying power consumed by an order that opens or increases a position."""
    return long_cost(price, size) if side.upper() == "BUY" else short_cost(price, size)


def would_open_short(position: float, size: float) -> float:
    """How much of a sell of `size` would open a *new* short, given `position`.

    Selling contracts you already hold is a close and costs no margin.
    Selling past zero is a short and locks $1.00 per contract. This returns
    only the second part.
    """
    if size <= 0:
        return 0.0
    closeable = max(position, 0.0)
    return max(size - closeable, 0.0)


def sell_capacity(position: float, resting_sell_size: float) -> float:
    """How many more contracts can be sold without crossing into a short.

    Counts what is already resting: a stack of small sells is still one big
    one, and the venue fills them independently.
    """
    return max(max(position, 0.0) - max(resting_sell_size, 0.0), 0.0)


def buy_capacity(
    buying_power: float, resting_buy_notional: float, price: float
) -> float:
    """How many more contracts can be bought at `price` with what is left.

    The venue reserves buying power the moment an order rests, not when it
    fills, so resting orders are subtracted before sizing a new one.
    """
    if price <= 0:
        return 0.0
    available = buying_power - max(resting_buy_notional, 0.0)
    return max(available, 0.0) / price
