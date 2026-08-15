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

    assert touched is books.get("t2")
    assert books.get("t2").mid == pytest.approx(0.62)
    assert books.get("t1").mid is None


def test_bookset_ignores_messages_without_book_state():
    books = BookSet(["t1"])
    assert books.handle({"event_type": "tick_size_change", "asset_id": "t1"}) is None
    assert books.handle({"event_type": "book"}) is None
