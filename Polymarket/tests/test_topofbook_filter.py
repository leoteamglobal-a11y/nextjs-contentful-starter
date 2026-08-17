"""Console de-duplication for `watch`.

The venue republishes a book on every depth change, so an unmoved market
emits the same top-of-book line hundreds of times. These pin down that the
console shows movement and the journal keeps everything.
"""

from pmbot.cli import TopOfBookFilter


def summary(bid=0.44, ask=0.46, crossed=False, bid_size=100.0):
    return {
        "best_bid": bid,
        "best_ask": ask,
        "best_bid_size": bid_size,
        "spread": None if bid is None or ask is None else round(ask - bid, 6),
        "mid": None if bid is None or ask is None else round((ask + bid) / 2, 6),
        "crossed": crossed,
    }


def test_first_update_is_always_shown():
    assert TopOfBookFilter().should_show("lad", summary()) is True


def test_identical_touch_is_suppressed():
    f = TopOfBookFilter()
    f.should_show("lad", summary())
    assert f.should_show("lad", summary()) is False
    assert f.should_show("lad", summary()) is False


def test_a_real_price_move_is_shown():
    f = TopOfBookFilter()
    f.should_show("lad", summary(0.44, 0.46))
    assert f.should_show("lad", summary(0.45, 0.46)) is True


def test_depth_change_behind_an_unmoved_touch_is_suppressed():
    """Size moved, price did not — the printed line would be identical."""
    f = TopOfBookFilter()
    f.should_show("lad", summary(bid_size=100))
    assert f.should_show("lad", summary(bid_size=900)) is False


def test_markets_are_tracked_independently():
    f = TopOfBookFilter()
    f.should_show("lad", summary())
    assert f.should_show("nym", summary()) is True


def test_returning_to_a_previous_price_is_shown():
    """It moved away and came back: that is two real changes, not a repeat."""
    f = TopOfBookFilter()
    f.should_show("lad", summary(0.44, 0.46))
    f.should_show("lad", summary(0.45, 0.47))
    assert f.should_show("lad", summary(0.44, 0.46)) is True


def test_one_sided_book_is_handled():
    f = TopOfBookFilter()
    assert f.should_show("lad", summary(0.44, None)) is True
    assert f.should_show("lad", summary(0.44, None)) is False


def test_counts_updates_and_changes():
    f = TopOfBookFilter()
    for _ in range(5):
        f.should_show("lad", summary())
    f.should_show("lad", summary(0.45, 0.46))

    assert f.updates == 6
    assert f.changes["lad"] == 2


def test_quiet_market_summary_says_so_rather_than_looking_broken():
    f = TopOfBookFilter()
    lines = f.summary_lines()
    assert "0 book update(s)" in lines[0]
    assert any("quiet, not broken" in line for line in lines)


def test_summary_ranks_the_busiest_market_first():
    f = TopOfBookFilter()
    f.should_show("quiet", summary(0.10, 0.12))
    for i in range(4):
        f.should_show("busy", summary(0.40 + i / 100, 0.50))

    lines = f.summary_lines()
    assert "5 book update(s)" in lines[0]
    assert "busy" in lines[1]
    assert "quiet" in lines[2]
