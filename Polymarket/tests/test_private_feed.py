"""The private stream: real fills, not inferred ones."""

import base64

import pytest

from pmbot.auth import Credentials
from pmbot.live.private import (
    ACCOUNT_BALANCE,
    ORDER,
    POSITION,
    PrivateFeed,
    decode,
    market_side,
    normalize,
    normalize_order,
)

CREDS = Credentials(
    key_id="key-123", secret_key=base64.b64encode(bytes(range(32))).decode()
)

ORDER_OBJ = {
    "id": "order-123",
    "marketSlug": "btc-100k",
    "side": "ORDER_SIDE_BUY",
    "type": "ORDER_TYPE_LIMIT",
    "price": {"value": "0.555", "currency": "USD"},
    "quantity": 5,
    "leavesQuantity": 3,
    "state": "ORDER_STATE_PARTIALLY_FILLED",
    "intent": "ORDER_INTENT_BUY_LONG",
    "tif": "TIME_IN_FORCE_GOOD_TILL_CANCEL",
}


# -- side resolution ---------------------------------------------------


def test_side_comes_from_the_venues_own_field():
    assert market_side({"side": "ORDER_SIDE_BUY"}) == "BUY"
    assert market_side({"side": "ORDER_SIDE_SELL"}) == "SELL"


@pytest.mark.parametrize(
    "intent,side",
    [
        ("ORDER_INTENT_BUY_LONG", "BUY"),
        ("ORDER_INTENT_SELL_SHORT", "BUY"),
        ("ORDER_INTENT_SELL_LONG", "SELL"),
        ("ORDER_INTENT_BUY_SHORT", "SELL"),
    ],
)
def test_intent_alone_still_gives_the_position_direction(intent, side):
    """"Buy NO" is not a purchase: there is one instrument, and that is a sale."""
    assert market_side({"intent": intent}) == side


def test_an_unreadable_side_is_empty_not_guessed():
    assert market_side({}) == ""
    assert market_side({"side": "ORDER_SIDE_UNSPECIFIED"}) == ""


# -- orders ------------------------------------------------------------


def test_order_normalises_to_the_resting_order_shape():
    order = normalize_order(ORDER_OBJ)
    assert order["order_id"] == "order-123"
    assert order["token_id"] == "btc-100k"
    assert order["side"] == "BUY"
    assert order["price"] == pytest.approx(0.555)
    assert order["size"] == 5.0
    assert order["remaining"] == 3.0
    assert order["working"] is True


def test_leaves_quantity_is_what_is_still_working():
    """Size is what you asked for; remaining is what can still fill."""
    order = normalize_order(ORDER_OBJ | {"leavesQuantity": 0})
    assert order["size"] == 5.0
    assert order["remaining"] == 0.0


def test_missing_leaves_quantity_falls_back_to_the_full_size():
    stripped = {k: v for k, v in ORDER_OBJ.items() if k != "leavesQuantity"}
    assert normalize_order(stripped)["remaining"] == 5.0


@pytest.mark.parametrize(
    "state",
    ["ORDER_STATE_FILLED", "ORDER_STATE_CANCELED", "ORDER_STATE_REJECTED",
     "ORDER_STATE_EXPIRED", "ORDER_STATE_REPLACED"],
)
def test_dead_states_are_not_working(state):
    assert normalize_order(ORDER_OBJ | {"state": state})["working"] is False


def test_an_order_without_an_id_or_slug_is_unusable():
    assert normalize_order(ORDER_OBJ | {"id": None}) is None
    assert normalize_order(ORDER_OBJ | {"marketSlug": ""}) is None


def test_snapshot_keeps_only_working_orders():
    payload = {
        "orderSubscriptionSnapshot": {
            "orders": [
                ORDER_OBJ,
                ORDER_OBJ | {"id": "gone", "state": "ORDER_STATE_CANCELED"},
            ],
            "eof": True,
        }
    }
    (event,) = normalize(payload)
    assert event["event_type"] == "order_snapshot"
    assert [o["order_id"] for o in event["orders"]] == ["order-123"]
    assert event["eof"] is True


def test_a_paged_snapshot_reports_it_is_not_final():
    payload = {"orderSubscriptionSnapshot": {"orders": [], "eof": False}}
    assert normalize(payload)[0]["eof"] is False


# -- executions --------------------------------------------------------


def execution(exec_type="EXECUTION_TYPE_PARTIAL_FILL", **overrides):
    body = {
        "execution": {
            "id": "exec-456",
            "order": ORDER_OBJ,
            "lastShares": "0.25",
            "lastPx": {"value": "0.555", "currency": "USD"},
            "type": exec_type,
            "tradeId": "trade-789",
        }
    }
    body["execution"].update(overrides)
    return {"orderSubscriptionUpdate": body}


def test_a_fill_carries_the_price_and_size_that_actually_traded():
    (event,) = normalize(execution())
    assert event["event_type"] == "execution"
    assert event["filled"] is True
    assert event["price"] == pytest.approx(0.555)
    assert event["size"] == pytest.approx(0.25)
    assert event["side"] == "BUY"
    assert event["trade_id"] == "trade-789"


@pytest.mark.parametrize(
    "exec_type,filled,dead",
    [
        ("EXECUTION_TYPE_FILL", True, False),
        ("EXECUTION_TYPE_PARTIAL_FILL", True, False),
        ("EXECUTION_TYPE_CANCELED", False, True),
        ("EXECUTION_TYPE_REJECTED", False, True),
        ("EXECUTION_TYPE_EXPIRED", False, True),
        ("EXECUTION_TYPE_DONE_FOR_DAY", False, True),
        ("EXECUTION_TYPE_REPLACE", False, False),
    ],
)
def test_execution_types_are_classified(exec_type, filled, dead):
    (event,) = normalize(execution(exec_type))
    assert event["filled"] is filled
    assert event["dead"] is dead


def test_decimal_quantities_survive():
    """Partial-contract markets send fractional shares as strings."""
    (event,) = normalize(execution(lastShares="0.5000"))
    assert event["size"] == pytest.approx(0.5)


# -- positions and balances --------------------------------------------


def test_position_prefers_the_decimal_field():
    payload = {
        "positionSubscription": {
            "afterPosition": {
                "netPosition": "2",
                "netPositionDecimal": "1.5000",
                "cost": {"value": "82.50", "currency": "USD"},
            },
            "entryType": "LEDGER_ENTRY_TYPE_ORDER_EXECUTION",
        }
    }
    (event,) = normalize(payload)
    # The integer field is rounded; the decimal one is what is true.
    assert event["net_position"] == pytest.approx(1.5)
    assert event["cost"] == pytest.approx(82.50)


def test_balance_snapshot_and_update_both_yield_buying_power():
    snapshot = {
        "accountBalancesSnapshot": {
            "balances": [
                {"currentBalance": 70.0, "currency": "USD", "buyingPower": 65.0}
            ]
        }
    }
    (event,) = normalize(snapshot)
    assert event["buying_power"] == pytest.approx(65.0)

    update = {
        "accountBalancesUpdate": {
            "balanceChange": {"afterBalance": {"buyingPower": 60.0}}
        }
    }
    assert normalize(update)[0]["buying_power"] == pytest.approx(60.0)


def test_an_empty_balance_list_yields_nothing():
    assert normalize({"accountBalancesSnapshot": {"balances": []}}) == []


# -- plumbing ----------------------------------------------------------


def test_heartbeats_and_unknowns_yield_nothing():
    assert normalize({"heartbeat": {}}) == []
    assert normalize({"rfqEvent": {}}) == []
    assert normalize({}) == []


def test_errors_are_surfaced():
    (event,) = normalize({"error": "not entitled", "requestId": "order"})
    assert event["event_type"] == "_error"


def test_decode_handles_junk():
    assert decode("") == []
    assert decode("not json") == []
    assert decode(b'{"heartbeat":{}}') == []


def test_subscriptions_cover_orders_positions_and_balance():
    feed = PrivateFeed(["btc-100k"], credentials=CREDS)
    requests = [r["subscribe"] for r in feed.subscribe_requests()]
    assert [r["subscriptionType"] for r in requests] == [ORDER, POSITION, ACCOUNT_BALANCE]


def test_balance_is_account_wide_and_takes_no_market_filter():
    feed = PrivateFeed(["btc-100k"], credentials=CREDS)
    by_type = {r["subscribe"]["subscriptionType"]: r["subscribe"] for r in feed.subscribe_requests()}
    assert by_type[ORDER]["marketSlugs"] == ["btc-100k"]
    assert "marketSlugs" not in by_type[ACCOUNT_BALANCE]


def test_no_markets_means_every_market():
    """A fill elsewhere still moves the balance this bot sizes against."""
    feed = PrivateFeed([], credentials=CREDS)
    assert all(
        "marketSlugs" not in r["subscribe"] for r in feed.subscribe_requests()
    )


def test_the_private_socket_signs_its_own_path():
    feed = PrivateFeed([], credentials=CREDS)
    assert feed.path == "/v1/ws/private"
    assert feed._headers()["X-PM-Signature"]
