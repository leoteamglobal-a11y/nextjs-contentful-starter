import pytest

from pmbot.book import BookSet
from pmbot.cli import build_parser


def test_watch_accepts_multiple_markets():
    args = build_parser().parse_args(["watch", "rain", "election", "--seconds", "30"])
    assert args.market == ["rain", "election"]
    assert args.seconds == 30.0
    assert args.name == "feed"


def test_watch_accepts_a_single_market():
    assert build_parser().parse_args(["watch", "rain"]).market == ["rain"]


def test_market_accepts_multiple():
    assert build_parser().parse_args(["market", "a", "b", "c"]).market == ["a", "b", "c"]


def test_watch_requires_at_least_one_market():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["watch"])


def test_journal_stream_name_is_overridable():
    args = build_parser().parse_args(["watch", "rain", "--name", "overnight"])
    assert args.name == "overnight"


def test_search_takes_free_text():
    """Slugs here are venue-generated, so search is the entry point."""
    args = build_parser().parse_args(["search", "super bowl"])
    assert args.text == "super bowl"


def test_live_check_defaults_to_the_long_side_and_a_dry_run():
    args = build_parser().parse_args(["live-check", "rain"])
    assert args.side == "long"
    assert args.live is False


def test_live_check_side_is_selectable():
    args = build_parser().parse_args(["live-check", "rain", "--side", "No"])
    assert args.side == "No"


def test_backtest_tick_is_settable_for_the_venues_finer_grid():
    args = build_parser().parse_args(["backtest", "j.jsonl", "--tick", "0.001"])
    assert args.tick == 0.001


def test_bookset_reset_clears_state_but_keeps_tokens():
    books = BookSet(["t1", "t2"])
    books.handle(
        {
            "event_type": "book",
            "asset_id": "t1",
            "bids": [{"price": "0.5", "size": "10"}],
            "asks": [{"price": "0.6", "size": "10"}],
        }
    )
    assert books.get("t1").mid == pytest.approx(0.55)

    books.reset()

    assert len(books) == 2
    assert books.get("t1").mid is None
    assert books.get("t1").bids == {}
