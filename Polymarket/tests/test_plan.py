import pytest

from pmbot.discovery import Market, Side
from pmbot.plan import Label, build_plan, label_width


def market(slug: str, *, question: str = "", tradable: bool = True) -> Market:
    return Market(
        slug=slug,
        question=question or f"{slug}?",
        active=tradable,
        closed=not tradable,
        sides=(Side("Yes", long=True), Side("No", long=False)),
    )


RAIN = market("rain")
ELECTION = market("election")


def test_single_market_plan():
    plan = build_plan([RAIN])
    assert plan.slugs == ("rain",)
    assert plan.label_for("rain").startswith("rain")


def test_multiple_markets_share_one_connection():
    plan = build_plan([RAIN, ELECTION])
    assert plan.slugs == ("rain", "election")
    assert len(plan.markets) == 2
    assert plan.describe() == (
        "2 market(s), 2 instrument(s), 1 connection, 1 subscription(s)"
    )


def test_one_instrument_per_market():
    """The structural change: no more two token ids per market."""
    assert len(build_plan([RAIN, ELECTION]).slugs) == 2


def test_labels_carry_the_question_so_slugs_are_recognisable():
    plan = build_plan([market("aec-nfl-lac-ten-2025-11-02", question="LA vs Tennessee")])
    assert "LA vs Tennessee" in plan.label_for("aec-nfl-lac-ten-2025-11-02")


def test_duplicate_markets_are_subscribed_once():
    plan = build_plan([RAIN, RAIN])
    assert plan.slugs == ("rain",)


def test_first_label_wins_for_a_repeated_slug():
    plan = build_plan([RAIN, market("rain", question="different question")])
    assert "rain?" in plan.label_for("rain")


def test_tradable_and_untradable_are_separated():
    done = market("old", tradable=False)
    plan = build_plan([RAIN, done])
    assert [m.slug for m in plan.tradable_markets] == ["rain"]
    assert [m.slug for m in plan.untradable_markets] == ["old"]
    # An untradable market is still subscribed: the caller warns, it does not
    # drop. Recording a market through its close is useful.
    assert "old" in plan.slugs


def test_unknown_slug_falls_back_to_itself():
    assert build_plan([RAIN]).label_for("mystery") == "mystery"


def test_large_fleets_are_chunked_at_the_venue_limit():
    plan = build_plan([market(f"m{i}") for i in range(250)])
    assert [len(c) for c in plan.chunks] == [100, 100, 50]
    assert "3 subscription(s)" in plan.describe()


def test_small_fleets_are_one_chunk():
    assert len(build_plan([RAIN, ELECTION]).chunks) == 1


def test_empty_inputs_raise():
    with pytest.raises(ValueError, match="at least one market"):
        build_plan([])
    with pytest.raises(ValueError, match="no tradeable instruments"):
        build_plan([Market(slug="", question="?")])


def test_label_width_is_capped():
    assert label_width([Label(slug="x" * 200)]) == 44
    assert label_width([Label("rain")]) == len("rain")
    assert label_width([]) == 12
