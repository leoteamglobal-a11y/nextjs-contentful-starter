import pytest

from pmbot.discovery import Market, Token
from pmbot.plan import Label, build_plan, label_width


def market(slug: str, *outcomes: tuple[str, str], closed: bool = False) -> Market:
    return Market(
        condition_id=f"0x{slug}",
        question=f"{slug}?",
        slug=slug,
        tokens=tuple(Token(token_id=tid, outcome=out) for out, tid in outcomes),
        closed=closed,
    )


RAIN = market("rain", ("Yes", "r-yes"), ("No", "r-no"))
ELECTION = market("election", ("Yes", "e-yes"), ("No", "e-no"))


def test_single_market_plan():
    plan = build_plan([RAIN])
    assert plan.token_ids == ("r-yes", "r-no")
    assert plan.label_for("r-yes") == "rain/Yes"


def test_multiple_markets_share_one_subscription():
    plan = build_plan([RAIN, ELECTION])
    assert plan.token_ids == ("r-yes", "r-no", "e-yes", "e-no")
    assert len(plan.markets) == 2
    assert "2 market(s), 4 token(s), 1 connection" == plan.describe()


def test_labels_disambiguate_identical_outcome_names():
    """Both markets have a 'Yes'; the label must say which market."""
    plan = build_plan([RAIN, ELECTION])
    assert plan.label_for("r-yes") == "rain/Yes"
    assert plan.label_for("e-yes") == "election/Yes"


def test_duplicate_tokens_are_subscribed_once():
    plan = build_plan([RAIN, RAIN])
    assert plan.token_ids == ("r-yes", "r-no")
    assert plan.label_for("r-yes") == "rain/Yes"


def test_overlapping_markets_keep_first_label():
    shared = market("rain-alias", ("Yes", "r-yes"), ("No", "r-no"))
    plan = build_plan([RAIN, shared])
    assert plan.token_ids == ("r-yes", "r-no")
    assert plan.label_for("r-yes") == "rain/Yes"


def test_open_and_closed_are_separated():
    done = market("old", ("Yes", "o-yes"), closed=True)
    plan = build_plan([RAIN, done])
    assert [m.slug for m in plan.open_markets] == ["rain"]
    assert [m.slug for m in plan.closed_markets] == ["old"]
    # A closed market is still subscribed: the caller warns, it does not drop.
    assert "o-yes" in plan.token_ids


def test_unknown_token_falls_back_to_truncated_id():
    plan = build_plan([RAIN])
    assert plan.label_for("abcdefghijklmnop") == "abcdefghijkl"


def test_slugless_market_labels_by_condition_id():
    anonymous = Market(
        condition_id="0xdeadbeefcafe",
        question="?",
        slug="",
        tokens=(Token(token_id="t1", outcome="Yes"),),
        closed=False,
    )
    assert build_plan([anonymous]).label_for("t1") == "0xdeadbeef/Yes"


def test_empty_inputs_raise():
    with pytest.raises(ValueError, match="at least one market"):
        build_plan([])
    with pytest.raises(ValueError, match="no tradeable tokens"):
        build_plan([market("empty")])


def test_label_width_is_capped():
    long = Label(slug="x" * 200, outcome="Yes")
    assert label_width([long]) == 44
    assert label_width([Label("rain", "Yes")]) == len("rain/Yes")
    assert label_width([]) == 12
