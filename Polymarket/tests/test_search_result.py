"""An empty search must never read as "this market does not exist".

Matching happens locally over one page of markets, so a search that reports
only its matches invites the wrong conclusion. These pin down that the
scanned count travels with the result and that a full page is flagged.
"""

from pmbot.discovery import Market, SearchResult, Side


def market(slug: str) -> Market:
    return Market(
        slug=slug,
        question=f"{slug}?",
        market_id=slug,
        active=True,
        category="sports",
        tick_size=0.001,
        sides=(Side(description="Yes", long=True),),
    )


def test_full_page_is_flagged_as_probably_incomplete():
    result = SearchResult(markets=[], scanned=100, limit=100)
    assert result.page_was_full is True


def test_short_page_means_the_catalogue_was_exhausted():
    result = SearchResult(markets=[], scanned=37, limit=100)
    assert result.page_was_full is False


def test_empty_venue_is_not_flagged():
    assert SearchResult(markets=[], scanned=0, limit=100).page_was_full is False


def test_result_carries_how_much_was_looked_at():
    result = SearchResult(markets=[market("a")], scanned=100, limit=100)
    assert len(result) == 1
    assert result.scanned == 100


def test_result_is_iterable_like_the_list_it_replaced():
    result = SearchResult(markets=[market("a"), market("b")], scanned=2, limit=100)
    assert [m.slug for m in result] == ["a", "b"]


def test_matches_can_be_fewer_than_scanned():
    """One match out of a hundred is the normal case, not an anomaly."""
    result = SearchResult(markets=[market("a")], scanned=100, limit=100)
    assert len(result) < result.scanned
