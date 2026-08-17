import base64
import json

import pytest

from pmbot.auth import Credentials
from pmbot.config import Settings
from pmbot.feed import (
    MARKET_DATA,
    TRADE,
    MarketFeed,
    amount,
    decode,
    normalize,
    timestamp_ms,
)

# A throwaway Ed25519 seed. Signing is exercised in test_auth.py; here it
# only has to be structurally valid so a feed can be constructed.
CREDS = Credentials(
    key_id="key-123",
    secret_key=base64.b64encode(bytes(range(32))).decode(),
)

BOOK_MESSAGE = {
    "requestId": "md-sub-1",
    "subscriptionType": MARKET_DATA,
    "marketData": {
        "marketSlug": "btc-100k",
        "bids": [
            {"px": {"value": "0.555", "currency": "USD"}, "qty": "0.50"},
            {"px": {"value": "0.550", "currency": "USD"}, "qty": "2.50"},
        ],
        "offers": [{"px": {"value": "0.560", "currency": "USD"}, "qty": "0.80"}],
        "state": "MARKET_STATE_OPEN",
        "stats": {"lastTradePx": {"value": "0.55", "currency": "USD"}},
        "transactTime": "2024-01-15T10:30:00Z",
    },
}

TRADE_MESSAGE = {
    "trade": {
        "marketSlug": "btc-100k",
        "price": {"value": "0.555", "currency": "USD"},
        "quantity": {"value": "0.50", "currency": "USD"},
        "tradeTime": "2024-01-15T10:30:00Z",
    }
}


def feed(slugs=("btc-100k",), **kwargs) -> MarketFeed:
    return MarketFeed(list(slugs), credentials=CREDS, **kwargs)


# -- amount / timestamp parsing ----------------------------------------


def test_amount_reads_venue_objects_and_bare_numbers():
    assert amount({"value": "0.555", "currency": "USD"}) == pytest.approx(0.555)
    assert amount("0.25") == pytest.approx(0.25)
    assert amount(0.25) == pytest.approx(0.25)
    assert amount(None) is None
    assert amount({"currency": "USD"}) is None


def test_timestamp_handles_the_precision_the_venue_actually_sends():
    """The API emits nanoseconds, which `fromisoformat` rejects outright."""
    assert timestamp_ms("2024-01-15T10:30:00Z") == 1705314600000
    assert timestamp_ms("2026-08-17T02:46:52.561636904Z") is not None
    assert timestamp_ms(1705314600000) == 1705314600000
    assert timestamp_ms("1705314600000") == 1705314600000
    assert timestamp_ms("not a time") is None
    assert timestamp_ms(None) is None


# -- normalisation -----------------------------------------------------


def test_book_message_becomes_a_canonical_snapshot():
    (message,) = normalize(BOOK_MESSAGE)
    assert message["event_type"] == "book"
    assert message["asset_id"] == "btc-100k"
    assert message["bids"] == [
        {"price": 0.555, "size": 0.5},
        {"price": 0.55, "size": 2.5},
    ]
    # The venue says "offers"; downstream code says "asks".
    assert message["asks"] == [{"price": 0.56, "size": 0.8}]
    assert message["timestamp"] == 1705314600000
    assert message["tradable"] is True


def test_normalized_book_feeds_the_existing_book_engine_unchanged():
    """The point of normalising: nothing downstream needed rewriting."""
    from pmbot.book import BookSet

    books = BookSet(["btc-100k"])
    book = books.handle(normalize(BOOK_MESSAGE)[0])
    assert book is not None
    assert book.best_bid.price == pytest.approx(0.555)
    assert book.best_ask.price == pytest.approx(0.560)
    assert book.mid == pytest.approx(0.5575)
    assert not book.is_crossed()


def test_halted_market_is_flagged_not_silently_empty():
    """An empty book and a halted market look identical, and are not."""
    halted = {
        "marketData": dict(
            BOOK_MESSAGE["marketData"], state="MARKET_STATE_HALTED", bids=[], offers=[]
        )
    }
    (message,) = normalize(halted)
    assert message["tradable"] is False
    assert message["state"] == "MARKET_STATE_HALTED"


def test_trade_message_becomes_a_canonical_print():
    (message,) = normalize(TRADE_MESSAGE)
    assert message["event_type"] == "trade"
    assert message["asset_id"] == "btc-100k"
    assert message["price"] == pytest.approx(0.555)
    assert message["size"] == pytest.approx(0.5)


def test_normalized_trade_is_what_replay_expects():
    from pmbot.replay import _as_trade

    assert _as_trade(normalize(TRADE_MESSAGE)[0]) == ("btc-100k", 0.555, 0.5)


def test_sizeless_trade_is_dropped_rather_than_guessed():
    broken = {"trade": dict(TRADE_MESSAGE["trade"], quantity={"value": "0"})}
    assert normalize(broken) == []


def test_bbo_is_not_passed_off_as_a_book():
    """BBO carries no depth; treating it as a snapshot would erase the book."""
    lite = {
        "marketDataLite": {
            "marketSlug": "btc-100k",
            "bestBid": {"value": "0.54", "currency": "USD"},
            "bestAsk": {"value": "0.56", "currency": "USD"},
        }
    }
    (message,) = normalize(lite)
    assert message["event_type"] == "bbo"

    from pmbot.book import BookSet

    books = BookSet(["btc-100k"])
    books.handle(normalize(BOOK_MESSAGE)[0])
    books.handle(message)
    # The real book survived the BBO update.
    assert len(books.get("btc-100k").bids) == 2


def test_heartbeats_and_unknown_envelopes_yield_nothing():
    assert normalize({"heartbeat": {}}) == []
    assert normalize({"somethingNew": {"marketSlug": "x"}}) == []
    assert normalize({}) == []
    assert normalize([]) == []


def test_errors_are_surfaced_not_swallowed():
    (message,) = normalize({"requestId": "md-sub-1", "error": "bad subscription"})
    assert message["event_type"] == "_error"
    assert message["error"] == "bad subscription"


def test_book_without_a_slug_is_unroutable_and_dropped():
    assert normalize({"marketData": {"bids": [], "offers": []}}) == []


# -- decoding ----------------------------------------------------------


def test_decode_handles_objects_bytes_and_batches():
    assert decode(json.dumps(BOOK_MESSAGE))[0]["event_type"] == "book"
    assert decode(json.dumps(BOOK_MESSAGE).encode())[0]["event_type"] == "book"
    batch = json.dumps([BOOK_MESSAGE, TRADE_MESSAGE])
    assert [m["event_type"] for m in decode(batch)] == ["book", "trade"]


@pytest.mark.parametrize("raw", ["", "   ", "not json", "[1, 2, 3]", '"str"', "null"])
def test_decode_drops_junk_without_raising(raw):
    assert decode(raw) == []


# -- subscriptions -----------------------------------------------------


def test_subscribe_requests_cover_book_and_tape():
    requests = feed().subscribe_requests()
    types = [r["subscribe"]["subscriptionType"] for r in requests]
    assert types == [MARKET_DATA, TRADE]
    assert requests[0]["subscribe"]["marketSlugs"] == ["btc-100k"]


def test_tape_subscription_can_be_turned_off():
    quiet = feed(settings=Settings(subscribe_trades=False))
    types = [r["subscribe"]["subscriptionType"] for r in quiet.subscribe_requests()]
    assert types == [MARKET_DATA]


def test_request_ids_are_unique_per_subscription():
    requests = feed(slugs=[f"m{i}" for i in range(150)]).subscribe_requests()
    ids = [r["subscribe"]["requestId"] for r in requests]
    assert len(ids) == len(set(ids))


def test_large_fleets_are_chunked_to_the_venue_limit():
    """The venue caps one subscription at 100 markets."""
    slugs = [f"m{i}" for i in range(150)]
    requests = feed(slugs=slugs).subscribe_requests()
    book_requests = [
        r for r in requests if r["subscribe"]["subscriptionType"] == MARKET_DATA
    ]
    assert [len(r["subscribe"]["marketSlugs"]) for r in book_requests] == [100, 50]


def test_duplicate_slugs_are_subscribed_once():
    assert feed(slugs=["a", "b", "a"]).slugs == ["a", "b"]


def test_feed_requires_markets():
    with pytest.raises(ValueError):
        MarketFeed([], credentials=CREDS)


def test_feed_refuses_to_run_unauthenticated():
    """There is no public market channel on this venue; say so early."""
    with pytest.raises(ValueError, match="authenticated"):
        MarketFeed(["btc-100k"], settings=Settings(credentials=None))


class FakeStatusError(Exception):
    def __init__(self, status_code):
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


@pytest.mark.parametrize("status", [401, 403])
def test_auth_rejections_are_not_retried(status):
    """A key does not become valid by being retried.

    Spinning on 401 forever looks alive in the logs while recording nothing,
    which is worse than stopping.
    """
    assert MarketFeed._is_auth_rejection(FakeStatusError(status))


@pytest.mark.parametrize("status", [500, 502, 429])
def test_transient_failures_still_reconnect(status):
    assert not MarketFeed._is_auth_rejection(FakeStatusError(status))


def test_a_plain_network_drop_still_reconnects():
    assert not MarketFeed._is_auth_rejection(ConnectionResetError("dropped"))


def test_handshake_signs_the_websocket_path():
    headers = feed()._headers()
    assert headers["X-PM-Access-Key"] == "key-123"
    assert headers["X-PM-Timestamp"].isdigit()
    assert headers["X-PM-Signature"]
    # A handshake is not a JSON request body.
    assert "Content-Type" not in headers
