"""Approval planning and config validation.

The chain I/O cannot be tested without a node, so it is kept in separate
functions. What is tested here is everything that decides *whether* to send
a transaction — which is the part that, wrong, costs money.
"""

import json

import pytest

from pmbot.live.approvals import (
    ApprovalConfig,
    ApprovalError,
    ApprovalState,
    Spender,
    looks_like_address,
    plan,
    refuse_for_proxy_wallet,
)

A = "0x" + "a" * 40
B = "0x" + "b" * 40
COLLATERAL = "0x" + "c" * 40
CTF = "0x" + "d" * 40


def config(spenders=None) -> ApprovalConfig:
    return ApprovalConfig(
        rpc_url="https://polygon-rpc.com",
        collateral=COLLATERAL,
        conditional_tokens=CTF,
        spenders=tuple(spenders or [Spender("exchange", A)]),
    )


# -- address validation ------------------------------------------------


def test_placeholder_addresses_are_rejected():
    """The template ships placeholders; they must never pass validation."""
    assert not looks_like_address("0x<the CTF Exchange contract>")
    assert not looks_like_address("")
    assert not looks_like_address("0x123")
    assert not looks_like_address("0x" + "z" * 40)


def test_real_looking_address_passes():
    assert looks_like_address(A)


def test_config_rejects_a_placeholder(tmp_path):
    path = tmp_path / "approvals.json"
    path.write_text(json.dumps({
        "rpc_url": "https://polygon-rpc.com",
        "collateral": "0x<fill me in>",
        "conditional_tokens": CTF,
        "spenders": [{"name": "exchange", "address": A}],
    }))
    with pytest.raises(ApprovalError, match="not a valid address"):
        ApprovalConfig.load(path)


def test_config_rejects_duplicate_spenders():
    with pytest.raises(ApprovalError, match="share an address"):
        config([Spender("exchange", A), Spender("neg-risk", A)]).validate()


def test_config_rejects_empty_spenders():
    # Built directly: the `config()` helper substitutes a default for an
    # empty list, which would make this test pass without testing anything.
    bare = ApprovalConfig("https://polygon.drpc.org", COLLATERAL, CTF, ())
    with pytest.raises(ApprovalError, match="nothing to approve"):
        bare.validate()


def test_config_rejects_a_bad_rpc_url():
    with pytest.raises(ApprovalError, match="rpc_url"):
        ApprovalConfig("ftp://nope", COLLATERAL, CTF, (Spender("e", A),)).validate()


def test_missing_config_explains_how_to_create_one(tmp_path):
    with pytest.raises(ApprovalError, match="--init"):
        ApprovalConfig.load(tmp_path / "nope.json")


def test_template_is_not_silently_overwritten(tmp_path):
    path = tmp_path / "approvals.json"
    ApprovalConfig.write_template(path)
    with pytest.raises(ApprovalError, match="refusing to overwrite"):
        ApprovalConfig.write_template(path)


def test_written_template_does_not_validate(tmp_path):
    """A freshly generated template must not be usable until filled in."""
    path = tmp_path / "approvals.json"
    ApprovalConfig.write_template(path)
    with pytest.raises(ApprovalError):
        ApprovalConfig.load(path)


# -- planning ----------------------------------------------------------


def test_fresh_wallet_needs_both_approvals():
    actions = plan(config(), ApprovalState(), min_allowance=100)
    assert [a.kind for a in actions] == ["erc20", "erc1155"]


def test_nothing_to_do_when_already_approved():
    state = ApprovalState(
        collateral_allowances={A.lower(): 1_000}, ctf_approved={A.lower(): True}
    )
    assert plan(config(), state, min_allowance=100) == []


def test_insufficient_allowance_is_topped_up():
    state = ApprovalState(
        collateral_allowances={A.lower(): 50}, ctf_approved={A.lower(): True}
    )
    actions = plan(config(), state, min_allowance=100)
    assert len(actions) == 1
    assert actions[0].kind == "erc20"
    assert "50 < required 100" in actions[0].reason


def test_erc1155_alone_is_planned_when_collateral_is_fine():
    state = ApprovalState(
        collateral_allowances={A.lower(): 1_000}, ctf_approved={A.lower(): False}
    )
    actions = plan(config(), state, min_allowance=100)
    assert [a.kind for a in actions] == ["erc1155"]


def test_each_spender_is_planned_independently():
    state = ApprovalState(
        collateral_allowances={A.lower(): 1_000, B.lower(): 0},
        ctf_approved={A.lower(): True, B.lower(): False},
    )
    actions = plan(
        config([Spender("exchange", A), Spender("neg-risk", B)]),
        state,
        min_allowance=100,
    )
    assert {a.spender_name for a in actions} == {"neg-risk"}
    assert len(actions) == 2


def test_action_renders_the_spender_address():
    action = plan(config(), ApprovalState(), min_allowance=100)[0]
    assert A in action.render()
    assert "exchange" in action.render()


# -- the proxy-wallet refusal -----------------------------------------


def test_proxy_wallet_is_refused_before_any_chain_call():
    """This account is an email/Magic proxy. Its collateral and shares sit
    at the proxy address, so approvals signed by the key would grant rights
    over an empty wallet: gas spent, nothing granted, orders still rejected
    for a reason the output never names."""
    with pytest.raises(ApprovalError, match="proxy-wallet account"):
        refuse_for_proxy_wallet(funder="0x" + "f" * 40, signer="0x" + "e" * 40)


def test_an_eoa_funding_itself_is_not_refused():
    """A plain EOA whose funder is its own address is exactly the case
    approvals exist for."""
    address = "0x" + "e" * 40
    refuse_for_proxy_wallet(funder=address, signer=address)
    refuse_for_proxy_wallet(funder=address.upper().replace("0X", "0x"), signer=address)


def test_no_funder_configured_is_not_refused():
    """Nothing to compare against is not evidence of a proxy."""
    refuse_for_proxy_wallet(funder=None, signer="0x" + "e" * 40)
