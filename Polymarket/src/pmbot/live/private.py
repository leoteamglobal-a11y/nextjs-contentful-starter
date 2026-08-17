"""The private stream: your orders, your fills, your balance.

This is the single biggest correctness difference between phase 2 and phase
3b, and it is worth being blunt about it.

In a backtest, fills are **inferred**. `sim.py` watches the book and the
tape and guesses which of your resting orders would have been hit, with a
queue haircut and a page of caveats about how every remaining error points
in your favour.

Live, fills are **reported**. The exchange tells you what filled, at what
price, for how much. There is no model, no queue factor, no inference, and
no optimism. The entire fill-simulation apparatus is switched off and this
stream replaces it.

That means the numbers phase 3b produces are real in a way a backtest's
never are — and it means that if this stream is wrong, the bot's idea of its
own position is wrong, which is the most dangerous state a trading system
can be in. Hence: a snapshot on every connect, reconciliation against REST
rather than trust in accumulated state, and no attempt to be clever.

Polling the REST endpoints instead would be both slower and a good way to
spend the 20 req/s budget on questions the venue is willing to push to you.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .. import endpoints
from ..feed import AuthedSocket, amount, timestamp_ms

log = logging.getLogger(__name__)

ORDER = "SUBSCRIPTION_TYPE_ORDER"
POSITION = "SUBSCRIPTION_TYPE_POSITION"
ACCOUNT_BALANCE = "SUBSCRIPTION_TYPE_ACCOUNT_BALANCE"

# Execution types that mean contracts changed hands.
FILL_TYPES = {"EXECUTION_TYPE_FILL", "EXECUTION_TYPE_PARTIAL_FILL"}

# Execution types that mean the order is gone and will never fill.
DEAD_TYPES = {
    "EXECUTION_TYPE_CANCELED",
    "EXECUTION_TYPE_REJECTED",
    "EXECUTION_TYPE_EXPIRED",
    "EXECUTION_TYPE_DONE_FOR_DAY",
}

# Order states that mean the order is no longer working.
DEAD_STATES = {
    "ORDER_STATE_FILLED",
    "ORDER_STATE_CANCELED",
    "ORDER_STATE_REJECTED",
    "ORDER_STATE_EXPIRED",
    "ORDER_STATE_REPLACED",
}


def market_side(order: dict[str, Any]) -> str:
    """Which way an order moves the position: BUY or SELL.

    `side` and `intent` say overlapping things, and they disagree in a way
    that matters. There is one instrument per market, so "buy NO" is not a
    purchase of anything — it is a sale of the instrument. The four intents
    encode direction *and* whether you are opening or closing:

        BUY_LONG     buy the instrument      position up
        SELL_SHORT   close a short           position up
        SELL_LONG    sell what you hold      position down
        BUY_SHORT    open a short            position down

    `side` is the venue's own answer to the same question, so it is
    preferred when present; the intent is the fallback.
    """
    raw_side = str(order.get("side") or "").upper()
    if raw_side.endswith("BUY"):
        return "BUY"
    if raw_side.endswith("SELL"):
        return "SELL"

    intent = str(order.get("intent") or "").upper()
    if intent in ("ORDER_INTENT_BUY_LONG", "ORDER_INTENT_SELL_SHORT"):
        return "BUY"
    if intent in ("ORDER_INTENT_SELL_LONG", "ORDER_INTENT_BUY_SHORT"):
        return "SELL"
    return ""


def _quantity(value: Any) -> float | None:
    """Quantities arrive as bare numbers or decimal strings, never Amounts."""
    if isinstance(value, dict):
        value = value.get("value")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_order(raw: dict[str, Any]) -> dict[str, Any] | None:
    """One venue order object to the canonical resting-order shape."""
    order_id = raw.get("id")
    slug = raw.get("marketSlug")
    price = amount(raw.get("price"))
    side = market_side(raw)
    if not order_id or not slug or price is None or not side:
        return None

    size = _quantity(raw.get("quantity"))
    remaining = _quantity(raw.get("leavesQuantity"))
    if remaining is None:
        remaining = size
    state = str(raw.get("state") or "")

    return {
        "order_id": str(order_id),
        "token_id": str(slug),
        "side": side,
        "price": price,
        "size": size if size is not None else (remaining or 0.0),
        "remaining": remaining if remaining is not None else 0.0,
        "state": state,
        "working": state not in DEAD_STATES,
    }


def normalize(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Translate one private message into zero or more canonical events."""
    if not isinstance(payload, dict):
        return []

    if "heartbeat" in payload:
        return []

    if payload.get("error"):
        return [
            {
                "event_type": "_error",
                "error": str(payload.get("error")),
                "request_id": payload.get("requestId"),
            }
        ]

    snapshot = payload.get("orderSubscriptionSnapshot")
    if isinstance(snapshot, dict):
        orders = [
            normalized
            for raw in snapshot.get("orders") or []
            if isinstance(raw, dict) and (normalized := normalize_order(raw))
        ]
        return [
            {
                "event_type": "order_snapshot",
                "orders": [o for o in orders if o["working"]],
                # The venue pages large snapshots; only the final page means
                # "you now know everything".
                "eof": bool(snapshot.get("eof", True)),
            }
        ]

    update = payload.get("orderSubscriptionUpdate")
    if isinstance(update, dict):
        execution = update.get("execution")
        if not isinstance(execution, dict):
            return []
        order = execution.get("order")
        order = order if isinstance(order, dict) else {}
        normalized = normalize_order(order)

        exec_type = str(execution.get("type") or "")
        price = amount(execution.get("lastPx"))
        size = _quantity(execution.get("lastShares"))

        event = {
            "event_type": "execution",
            "exec_type": exec_type,
            "order_id": str(order.get("id") or execution.get("id") or ""),
            "token_id": str(order.get("marketSlug") or ""),
            "side": market_side(order),
            "price": price,
            "size": size,
            "trade_id": execution.get("tradeId"),
            "timestamp": timestamp_ms(execution.get("transactTime")),
            "filled": exec_type in FILL_TYPES,
            "dead": exec_type in DEAD_TYPES,
            "order": normalized,
        }
        return [event]

    position = payload.get("positionSubscription")
    if isinstance(position, dict):
        after = position.get("afterPosition")
        after = after if isinstance(after, dict) else {}
        net = _quantity(
            after.get("netPositionDecimal")
            if after.get("netPositionDecimal") is not None
            else after.get("netPosition")
        )
        return [
            {
                "event_type": "position",
                "net_position": net,
                "cost": amount(after.get("cost")),
                "entry_type": position.get("entryType"),
                "trade_id": position.get("tradeId"),
                "timestamp": timestamp_ms(position.get("updateTime")),
            }
        ]

    balances = payload.get("accountBalancesSnapshot")
    if isinstance(balances, dict):
        entries = [b for b in balances.get("balances") or [] if isinstance(b, dict)]
        if not entries:
            return []
        first = entries[0]
        return [
            {
                "event_type": "balance",
                "buying_power": _quantity(first.get("buyingPower")),
                "current_balance": _quantity(first.get("currentBalance")),
                "currency": first.get("currency", "USD"),
            }
        ]

    change = payload.get("accountBalancesUpdate")
    if isinstance(change, dict):
        after = (change.get("balanceChange") or {}).get("afterBalance")
        after = after if isinstance(after, dict) else {}
        return [
            {
                "event_type": "balance",
                "buying_power": _quantity(after.get("buyingPower")),
                "current_balance": _quantity(after.get("currentBalance")),
                "currency": after.get("currency", "USD"),
            }
        ]

    return []


def decode(raw: str | bytes) -> list[dict[str, Any]]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    text = raw.strip()
    if not text:
        return []
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        log.debug("undecodable private frame: %.120s", text)
        return []
    if isinstance(payload, list):
        return [m for entry in payload for m in normalize(entry)]
    return normalize(payload)


class PrivateFeed(AuthedSocket):
    """Orders, executions, positions and balance, pushed."""

    label = "private feed"
    url = endpoints.WS_PRIVATE
    path = endpoints.WS_PRIVATE_PATH

    def __init__(self, slugs=None, settings=None, credentials=None) -> None:
        # An empty market list means "everything", which is what you want:
        # a fill on a market this process is not watching still changes the
        # balance and the position it is about to size an order against.
        self.slugs = list(dict.fromkeys(str(s) for s in slugs or []))
        super().__init__(settings=settings, credentials=credentials)

    def subscribe_requests(self) -> list[dict[str, Any]]:
        requests = []
        for kind in (ORDER, POSITION, ACCOUNT_BALANCE):
            body: dict[str, Any] = {
                "requestId": kind.lower(),
                "subscriptionType": kind,
            }
            # Balance is account-wide and takes no market filter.
            if self.slugs and kind != ACCOUNT_BALANCE:
                body["marketSlugs"] = self.slugs
            requests.append({"subscribe": body})
        return requests

    def decode_frame(self, raw: str | bytes) -> list[dict[str, Any]]:
        return decode(raw)
