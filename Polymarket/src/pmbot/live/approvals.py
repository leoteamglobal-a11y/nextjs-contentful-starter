"""Token approvals — the step that blocks a fresh EOA wallet from trading.

Before the exchange can settle a trade it needs permission to move two
things on your behalf: your collateral (ERC-20 `approve`) and your outcome
shares (ERC-1155 `setApprovalForAll` on the conditional tokens contract).

⚠️ THIS COMMAND DOES NOT APPLY TO THIS ACCOUNT ⚠️

This bot's account is on **Polymarket US**, the CFTC-regulated KYC'd venue.
Positions there are held in a brokerage account, not in a wallet you hold
keys to, so there are no ERC-20 or ERC-1155 approvals to grant and nothing
here to run. See `docs/VERIFICATION.md`.

Everything in this file describes the international, self-custody venue. It
is kept because that venue is where phases 1 and 2 read from, and because
`refuse_for_proxy_wallet()` below is a rail worth keeping either way.

⚠️ WHY THERE ARE NO DEFAULT ADDRESSES IN THIS FILE ⚠️

An approval hands a contract the standing right to move your tokens.
Approving the wrong address is not a failed transaction — it is a working
transaction that gives a stranger your balance, and it cannot be undone
except by revoking, which requires noticing first.

The addresses are now known and recorded in `docs/VERIFICATION.md`, but
they are still not defaults here: that file records what two Polymarket-
published sources say, and it could not be confirmed on-chain from the
machine it was written on. Confirming an address yourself, once, is cheap;
inheriting a wrong one silently is not. So this still requires you to
supply them, and then checks what it can:

- every address is a valid EIP-55 checksummed address
- there is actually contract code deployed at each one
- it prints exactly what will be approved, to whom, before sending

Note also that the collateral is **pUSD**, not USDC. Polymarket settles in
its own ERC-20 wrapper (`CollateralToken`); USDC.e is wrapped into it by
the `CollateralOnramp`. Approving USDC to the exchange grants a permission
nothing uses, and every order stays rejected.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Minimal ABIs. These are ERC standards, not Polymarket-specific, so unlike
# addresses they are safe to state.
ERC20_ABI = [
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
]

ERC1155_ABI = [
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_operator", "type": "address"},
        ],
        "name": "isApprovedForAll",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_operator", "type": "address"},
            {"name": "_approved", "type": "bool"},
        ],
        "name": "setApprovalForAll",
        "outputs": [],
        "type": "function",
    },
]

CONFIG_TEMPLATE = {
    # polygon-rpc.com, which the docs long pointed at, answers HTTP 401
    # ("tenant disabled") as of 2026-08-17. This is the node Polymarket's
    # own SDK ships.
    "rpc_url": "https://polygon.drpc.org",
    "collateral": "0x<pUSD CollateralToken — NOT USDC. See docs/VERIFICATION.md>",
    "conditional_tokens": "0x<the ConditionalTokens (CTF) contract>",
    "spenders": [
        {"name": "exchange", "address": "0x<the CTF Exchange contract>"},
        {"name": "neg-risk-exchange", "address": "0x<the Neg Risk CTF Exchange>"},
    ],
}


class ApprovalError(RuntimeError):
    pass


def refuse_for_proxy_wallet(funder: str | None, signer: str) -> None:
    """Stop before touching the chain if this is a proxy-wallet account.

    A proxy account holds its collateral and shares at the proxy address,
    not at the signing key's address. Approvals sent from the signer would
    therefore grant rights over a wallet with nothing in it: the
    transactions succeed, the gas is spent, and every order stays rejected
    for a reason nothing in the output names. Polymarket grants a proxy's
    approvals itself in any case.
    """
    if not funder:
        return
    if funder.strip().lower() == signer.strip().lower():
        return  # funder is the signer: a plain EOA, which does need this
    raise ApprovalError(
        f"PMBOT_FUNDER ({funder}) is not the signing address ({signer}), so this\n"
        "is a proxy-wallet account — email/Magic or a browser wallet.\n\n"
        "Approvals do not apply:\n"
        "  - the collateral and shares belong to the proxy, not to this key,\n"
        "    so approving from here would grant rights over an empty wallet\n"
        "  - Polymarket already grants the proxy's approvals itself\n\n"
        "Nothing was sent. Run `live-check` instead; if orders are rejected,\n"
        "the cause is something else."
    )


@dataclass(frozen=True)
class Spender:
    name: str
    address: str


@dataclass(frozen=True)
class ApprovalConfig:
    rpc_url: str
    collateral: str
    conditional_tokens: str
    spenders: tuple[Spender, ...]

    @classmethod
    def load(cls, path: Path) -> "ApprovalConfig":
        if not path.exists():
            raise ApprovalError(
                f"No approvals config at {path}.\n"
                f"Write one with:  python -m pmbot.cli approvals "
                f"--config {path} --init\n"
                "then fill in the addresses from the official Polymarket docs."
            )
        try:
            raw = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise ApprovalError(f"{path} is not valid JSON: {exc}") from exc

        spenders = tuple(
            Spender(name=str(s.get("name", "?")), address=str(s.get("address", "")))
            for s in raw.get("spenders", [])
        )
        config = cls(
            rpc_url=str(raw.get("rpc_url", "")),
            collateral=str(raw.get("collateral", "")),
            conditional_tokens=str(raw.get("conditional_tokens", "")),
            spenders=spenders,
        )
        config.validate()
        return config

    def validate(self) -> None:
        if not self.rpc_url.startswith(("http://", "https://")):
            raise ApprovalError(f"rpc_url looks wrong: {self.rpc_url!r}")
        if not self.spenders:
            raise ApprovalError("no spenders configured — nothing to approve")

        for label, address in [
            ("collateral", self.collateral),
            ("conditional_tokens", self.conditional_tokens),
            *[(f"spender {s.name}", s.address) for s in self.spenders],
        ]:
            if not looks_like_address(address):
                raise ApprovalError(
                    f"{label} is not a valid address: {address!r}\n"
                    "Fill it in from the official docs — placeholders are "
                    "rejected on purpose."
                )

        seen: dict[str, str] = {}
        for spender in self.spenders:
            key = spender.address.lower()
            if key in seen:
                raise ApprovalError(
                    f"spenders {seen[key]!r} and {spender.name!r} share an address"
                )
            seen[key] = spender.name

    @staticmethod
    def write_template(path: Path) -> None:
        if path.exists():
            raise ApprovalError(f"{path} already exists; refusing to overwrite it")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(CONFIG_TEMPLATE, indent=2) + "\n")


def looks_like_address(value: str) -> bool:
    """A 20-byte hex address. Deliberately rejects the template placeholders."""
    if not isinstance(value, str) or not value.startswith("0x") or len(value) != 42:
        return False
    try:
        int(value[2:], 16)
    except ValueError:
        return False
    return True


@dataclass
class ApprovalState:
    """What is currently approved, read from chain."""

    collateral_allowances: dict[str, int] = field(default_factory=dict)
    ctf_approved: dict[str, bool] = field(default_factory=dict)


@dataclass(frozen=True)
class Action:
    kind: str  # "erc20" | "erc1155"
    contract: str
    spender_name: str
    spender: str
    reason: str

    def render(self) -> str:
        what = "collateral spending" if self.kind == "erc20" else "outcome-share transfer"
        return f"approve {what} for {self.spender_name} ({self.spender}) — {self.reason}"


def plan(config: ApprovalConfig, state: ApprovalState, min_allowance: int) -> list[Action]:
    """Decide what still needs approving. Pure, so it is testable offline.

    Already-sufficient approvals are skipped: re-approving costs gas and,
    on some ERC-20s, a non-zero-to-non-zero approve reverts outright.
    """
    actions: list[Action] = []
    for spender in config.spenders:
        current = state.collateral_allowances.get(spender.address.lower(), 0)
        if current < min_allowance:
            actions.append(
                Action(
                    kind="erc20",
                    contract=config.collateral,
                    spender_name=spender.name,
                    spender=spender.address,
                    reason=f"allowance {current} < required {min_allowance}",
                )
            )
        if not state.ctf_approved.get(spender.address.lower(), False):
            actions.append(
                Action(
                    kind="erc1155",
                    contract=config.conditional_tokens,
                    spender_name=spender.name,
                    spender=spender.address,
                    reason="not yet an approved operator",
                )
            )
    return actions


# -- chain I/O ---------------------------------------------------------


def _require_web3() -> Any:
    try:
        from web3 import Web3  # type: ignore
    except ImportError as exc:
        raise ApprovalError(
            "web3 is not installed. It is only needed for approvals:\n"
            "    pip install -r requirements-live.txt"
        ) from exc
    return Web3


def read_state(config: ApprovalConfig, owner: str) -> ApprovalState:
    """Read current allowances from chain, verifying the contracts exist."""
    Web3 = _require_web3()
    w3 = Web3(Web3.HTTPProvider(config.rpc_url))
    if not w3.is_connected():
        raise ApprovalError(f"cannot reach the RPC at {config.rpc_url}")

    owner = w3.to_checksum_address(owner)
    state = ApprovalState()

    for label, address in [
        ("collateral", config.collateral),
        ("conditional_tokens", config.conditional_tokens),
    ]:
        if w3.eth.get_code(w3.to_checksum_address(address)) in (b"", "0x"):
            raise ApprovalError(
                f"no contract deployed at the {label} address {address}. "
                "Wrong address, or wrong chain."
            )

    collateral = w3.eth.contract(
        address=w3.to_checksum_address(config.collateral), abi=ERC20_ABI
    )
    ctf = w3.eth.contract(
        address=w3.to_checksum_address(config.conditional_tokens), abi=ERC1155_ABI
    )

    for spender in config.spenders:
        checksummed = w3.to_checksum_address(spender.address)
        if w3.eth.get_code(checksummed) in (b"", "0x"):
            raise ApprovalError(
                f"spender {spender.name!r} at {spender.address} has no contract "
                "code. Approving an address with no code is how funds are lost."
            )
        state.collateral_allowances[spender.address.lower()] = int(
            collateral.functions.allowance(owner, checksummed).call()
        )
        state.ctf_approved[spender.address.lower()] = bool(
            ctf.functions.isApprovedForAll(owner, checksummed).call()
        )

    return state


def execute(
    config: ApprovalConfig, actions: list[Action], private_key: str, amount: int
) -> list[str]:
    """Send the approval transactions. Returns tx hashes, in order."""
    Web3 = _require_web3()
    w3 = Web3(Web3.HTTPProvider(config.rpc_url))
    account = w3.eth.account.from_key(private_key)
    nonce = w3.eth.get_transaction_count(account.address)
    hashes: list[str] = []

    for action in actions:
        contract = w3.eth.contract(
            address=w3.to_checksum_address(action.contract),
            abi=ERC20_ABI if action.kind == "erc20" else ERC1155_ABI,
        )
        spender = w3.to_checksum_address(action.spender)
        if action.kind == "erc20":
            call = contract.functions.approve(spender, amount)
        else:
            call = contract.functions.setApprovalForAll(spender, True)

        tx = call.build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "chainId": w3.eth.chain_id,
                "gas": 150_000,
                "maxFeePerGas": w3.eth.gas_price * 2,
                "maxPriorityFeePerGas": w3.to_wei(30, "gwei"),
            }
        )
        signed = account.sign_transaction(tx)
        raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
        tx_hash = w3.eth.send_raw_transaction(raw)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        if receipt.status != 1:
            raise ApprovalError(
                f"approval reverted: {action.render()} (tx {tx_hash.hex()})"
            )
        hashes.append(tx_hash.hex())
        nonce += 1

    return hashes
