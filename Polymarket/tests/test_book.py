import json
from pathlib import Path

import pytest

from pmbot.book import BookSet, OrderBook

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_snapshot_sets_best_prices():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(load("book_snapshot.json"))

    assert book.best_bid.price == 0.61
    assert book.best_bid.size == 400.0
    assert book.best_ask.price == 0.63
    assert book.spread == pytest.approx(0.02)
    assert book.mid == pytest.approx(0.62)
    assert not book.is_crossed()


def test_price_change_updates_and_removes_levels():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(load("book_snapshot.json"))
    book.apply_price_change(load("price_change.json"))

    # 0.62 was added on the bid side and is now the best bid.
    assert book.best_bid.price == 0.62
    # The 0.63 ask was removed by a zero-size change; next ask takes over.
    assert book.best_ask.price == 0.64


def test_zero_size_removes_level():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(load("book_snapshot.json"))
    book.apply_price_change(
        {"changes": [{"side": "BUY", "price": "0.61", "size": "0"}]}
    )
    assert 0.61 not in book.bids
    assert book.best_bid.price == 0.60


def test_empty_book_has_no_mid_or_spread():
    book = OrderBook(token_id="t1")
    assert book.best_bid is None
    assert book.mid is None
    assert book.spread is None
    assert not book.is_crossed()


def test_one_sided_book_has_no_mid():
    book = OrderBook(token_id="t1")
    book.apply_snapshot({"bids": [{"price": "0.5", "size": "10"}], "asks": []})
    assert book.best_bid.price == 0.5
    assert book.best_ask is None
    assert book.mid is None


def test_crossed_book_is_detected():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(
        {
            "bids": [{"price": "0.70", "size": "10"}],
            "asks": [{"price": "0.65", "size": "10"}],
        }
    )
    assert book.is_crossed()
    assert book.summary()["crossed"] is True


def test_malformed_levels_are_skipped_not_fatal():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(
        {
            "bids": [
                {"price": "0.5", "size": "10"},
                {"price": "oops", "size": "10"},
                {"size": "10"},
                None,
            ],
            "asks": [],
        }
    )
    assert list(book.bids) == [0.5]


def test_depth_is_ordered_by_aggression():
    book = OrderBook(token_id="t1")
    book.apply_snapshot(load("book_snapshot.json"))
    assert [lvl.price for lvl in book.depth("BUY", 3)] == [0.61, 0.60, 0.59]
    assert [lvl.price for lvl in book.depth("SELL", 3)] == [0.63, 0.64, 0.65]


def test_bookset_routes_by_asset_id():
    books = BookSet(["t1", "t2"])
    snapshot = load("book_snapshot.json") | {"asset_id": "t2", "event_type": "book"}
    touched = books.handle(snapshot)

    assert touched == [books.get("t2")]
    assert books.get("t2").mid == pytest.approx(0.62)
    assert books.get("t1").mid is None


def test_bookset_ignores_messages_without_book_state():
    books = BookSet(["t1"])
    assert books.handle({"event_type": "tick_size_change", "asset_id": "t1"}) == []
    assert books.handle({"event_type": "book"}) == []


def test_price_change_frame_updates_every_token_it_names():
    """The live venue scopes a `price_change` to a market, not a token: one
    frame carries changes for both sides, each entry naming its own asset
    id. Routing on a top-level asset id — which these frames do not have —
    silently dropped every incremental update the venue sent.
    """
    books = BookSet(["t1", "t2"])
    books.get("t1").apply_snapshot(
        {"bids": [{"price": "0.40", "size": "10"}], "asks": [{"price": "0.60", "size": "10"}]}
    )
    books.get("t2").apply_snapshot(
        {"bids": [{"price": "0.30", "size": "10"}], "asks": [{"price": "0.70", "size": "10"}]}
    )

    touched = books.handle(
        {
            "event_type": "price_change",
            "market": "0xcondition",
            "timestamp": "1786933026174",
            "price_changes": [
                {"asset_id": "t1", "price": "0.41", "size": "25", "side": "BUY"},
                {"asset_id": "t2", "price": "0.69", "size": "30", "side": "SELL"},
            ],
        }
    )

    assert {b.token_id for b in touched} == {"t1", "t2"}
    assert books.get("t1").best_bid.price == pytest.approx(0.41)
    assert books.get("t2").best_ask.price == pytest.approx(0.69)


def test_price_change_does_not_leak_across_tokens():
    """Each entry applies only to the token it names. Applying a whole
    frame to every book would write the other outcome's prices into it."""
    books = BookSet(["t1", "t2"])
    books.handle(
        {
            "event_type": "price_change",
            "price_changes": [
                {"asset_id": "t1", "price": "0.41", "size": "25", "side": "BUY"},
            ],
        }
    )

    assert books.get("t1").best_bid.price == pytest.approx(0.41)
    assert books.get("t2").best_bid is None


def test_legacy_flat_price_change_still_replays():
    """Journals recorded before the batched shape was understood carry a
    flat `changes` list with the asset id at the top level. They have to
    keep replaying — a recording is not re-recordable."""
    books = BookSet(["t1"])
    touched = books.handle(
        {
            "event_type": "price_change",
            "asset_id": "t1",
            "changes": [{"price": "0.42", "size": "12", "side": "BUY"}],
        }
    )

    assert touched == [books.get("t1")]
    assert books.get("t1").best_bid.price == pytest.approx(0.42)
