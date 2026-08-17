# Verification record — 2026-08-17

Everything in this repo was written on a machine with `*.polymarket.com`
blocked, and said so. This is the record of checking it against the real
venue: what was confirmed, what turned out to be wrong, and what still
could not be checked.

Method matters more than the results, because the results expire. Each
claim below says how it was established, so it can be re-established later.

---

## ⚠️ Which venue this account is on

**The account this bot is meant to trade is on Polymarket US** — the
CFTC-regulated, KYC'd entity — **not on international Polymarket.**

That was established after most of this verification was done, and it
retires a whole section of it. On Polymarket US, positions are held in a
regulated brokerage account rather than a self-custody wallet, so there is
no Polygon signing, no wallet, no contract approvals and no
`signature_type`:

| Section | Applies to this account? |
| --- | --- |
| 1. Endpoints | Yes — but see the caveat below |
| 2. The `price_change` bug | **Yes.** A parsing bug in the book, independent of venue |
| 3. Contract addresses | **No.** International venue only |
| 4. SDK adapter surface | **No.** `polymarket-client` targets the international CLOB |
| 5. Signature type | **No.** No wallet to sign for |
| 6. Approvals | **No.** Nothing to approve |

Sections 3–6 are kept as a record of what was checked and what was found —
including a genuine bug in this repo's assumptions about the international
venue — but **none of them describe how this account trades.** They should
not be used as setup instructions.

**Caveat on section 1:** `gamma-api` and `clob.polymarket.com` were
verified as the international venue's endpoints. Whether they also serve
Polymarket US markets was *not* checked. Phases 1 and 2 read from them, so
this is the open question that decides whether the recorded data is even
about the markets this account can trade.

**What this blocks:** phase 3a (`live-check`) as built posts orders through
the international CLOB via Polygon signing. That path does not exist for a
Polymarket US account, so phase 3a is blocked on establishing what
Polymarket US's order API actually is — a question about that venue, not
about this code. Nothing in this repo should be pointed at a US account
until that is answered.

---

## 1. Endpoints — all correct, and now actually probed

Every URL in `src/pmbot/endpoints.py` answered. Two independent sources
agree with each one:

1. a live request from this machine, and
2. the `PRODUCTION` environment compiled into Polymarket's own Python SDK
   (`polymarket.environments`, package `polymarket-client` 0.6.0), whose
   `clob_url`, `clob_market_ws_url`, `gamma_url` and `data_url` are
   byte-identical to the constants in `endpoints.py`.

| Endpoint | Result |
| --- | --- |
| `https://gamma-api.polymarket.com/markets?slug=…` | 200, markets resolve, `clobTokenIds` present |
| `https://clob.polymarket.com/ok` | 200 `"OK"` |
| `https://clob.polymarket.com/markets/{conditionId}` | 200 |
| `https://clob.polymarket.com/book?token_id=…` | 200 |
| `https://clob.polymarket.com/tick-size?token_id=…` | 200 `{"minimum_tick_size":0.001}` |
| `wss://ws-subscriptions-clob.polymarket.com/ws/market` | connects, accepts `{"assets_ids":[…],"type":"market"}`, streams |

`doctor` was rewritten to probe all of these rather than two of them, and
to do it against a market it resolves live — a hardcoded id that has since
closed looks exactly like a broken endpoint, which is the ambiguity the
command exists to remove. It now also refuses to pass on a WebSocket that
connects but never delivers a frame, since a renamed channel and a healthy
idle socket are otherwise indistinguishable.

### The one endpoint that is genuinely broken

`https://polygon-rpc.com` — the Polygon RPC the docs have long pointed at,
and the default in the approvals config template — answers **HTTP 401**:

```json
{"error": "message: API key disabled, reason: tenant disabled, json-rpc code: -32051, rest code: 403"}
```

It is no longer a usable open endpoint. Polymarket's SDK ships
`https://polygon.drpc.org` instead, so that is the new default in
`endpoints.POLYGON_RPC` and in the approvals template. Only `approvals`
uses an RPC; every read path is unaffected, so `doctor` reports this as a
note rather than a failure.

---

## 2. A real bug the network access exposed

The live `price_change` message does not have the shape the book code
assumed, and the mismatch was silent.

**Assumed** (`book.py`, from the docs' description):

```json
{"event_type": "price_change", "asset_id": "…", "changes": [{"price": "…", "size": "…", "side": "BUY"}]}
```

**Actual**, captured from the feed:

```json
{"event_type": "price_change", "market": "0x…", "timestamp": "…",
 "price_changes": [
   {"asset_id": "332…709", "price": "0.01", "size": "16623.83", "side": "SELL", "best_bid": "0", "best_ask": "0.001"},
   {"asset_id": "114…499", "price": "0.99", "size": "16623.83", "side": "BUY",  "best_bid": "0", "best_ask": "0.001"}]}
```

Two differences, both fatal:

- the entries live under **`price_changes`**, not `changes`; and
- the frame is scoped to a **market**, not a token. There is no top-level
  `asset_id`; each entry names its own, and one frame routinely carries
  both sides of the market.

`BookSet.handle` routed on the top-level `asset_id`, found none, and
returned `None`. Every incremental update was therefore dropped: the books
showed the opening snapshot and then never moved. In a 75-second capture
across 12 tokens the feed sent **16 snapshots and 452 price changes**, so
roughly 97% of all book state was being discarded — silently, because a
book that never updates looks identical to a quiet market.

Fixed in `book.py`: entries are read from either key, matched to the token
each one names, and `handle()` returns *every* book a frame touched rather
than one. `replay.py` and the `watch` loop iterate that list; the replay
loop matches all touched books before the strategy sees any of them, so a
frame moving both outcomes cannot fill the second one against a quote
placed in response to the first.

The legacy flat shape still replays, so journals recorded before this are
not lost. Tests: `test_price_change_frame_updates_every_token_it_names`,
`test_price_change_does_not_leak_across_tokens`,
`test_legacy_flat_price_change_still_replays`.

### Confirmed correct

`last_trade_price` events are real and do carry a top-level `asset_id`,
`price`, `size` and `side`, so `replay._as_trade` — and the whole
trade-print fill path the backtest depends on — needed no change.

---

## 3. Contract addresses — NOT APPLICABLE to this account

> International venue only. Recorded because the work was done and the
> findings are real; this account holds no wallet and approves nothing.

**Source:** <https://docs.polymarket.com/resources/contracts>, retrieved
2026-08-17, which states it is "the single source of truth for all contract
addresses". All are Polygon mainnet, chain id 137.

**Cross-check:** every address below also appears, byte-identical, in the
`PRODUCTION` environment compiled into `polymarket-client` 0.6.0
(`polymarket/environments.py`). That is a second Polymarket-published
artifact produced by a different pipeline than the docs site, so a typo in
one would not reproduce in the other.

| Contract | Address | SDK field |
| --- | --- | --- |
| **pUSD — CollateralToken** (proxy) | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` | `collateral_token` |
| **Conditional Tokens (CTF)** | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | `conditional_tokens` |
| **CTF Exchange** | `0xE111180000d2663C0091e4f400237545B87B996B` | `standard_exchange` |
| **Neg Risk CTF Exchange** | `0xe2222d279d744050d28e00520010520000310F59` | `neg_risk_exchange` |
| Neg Risk Adapter (CLOB v1, deprecated) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | `neg_risk_adapter` |
| CtfCollateralAdapter | `0xAdA100Db00Ca00073811820692005400218FcE1f` | `collateral_adapter` |
| NegRiskCtfCollateralAdapter | `0xadA2005600Dec949baf300f4C6120000bDB6eAab` | `neg_risk_collateral_adapter` |
| CollateralOnramp (USDC.e → pUSD) | `0x93070a847efEf7F70739046A929D47a521F5B8ee` | — |
| CollateralOfframp (pUSD → USDC.e) | `0x2957922Eb93258b93368531d39fAcCA3B4dC5854` | — |
| Polymarket Proxy Factory | `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` | `wallet_derivation.proxy_factory` |
| Gnosis Safe Factory | `0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b` | `wallet_derivation.safe_factory` |
| Deposit Wallet Factory | `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07` | `wallet_derivation.deposit_wallet_factory` |
| UMA CTF Adapter | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` | — |

USDC.e (bridged USDC on Polygon, `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`)
appears in the docs only as the input to `CollateralOnramp.wrap()`, not as
a Polymarket contract.

### ⚠️ The collateral is pUSD, not USDC

This is the finding most likely to waste a day. **Polymarket no longer
settles trades in USDC directly.** It settles in **pUSD**, its own ERC-20
wrapper (6 decimals, backed 1:1 by USDC, enforced on-chain):

- USDC.e → pUSD via `CollateralOnramp.wrap(asset, to, amount)`; you approve
  the **Onramp**, not the pUSD token.
- pUSD → USDC.e via `CollateralOfframp.unwrap(...)`.

An approval of USDC to the exchange grants a permission nothing uses. The
transaction succeeds, and every order is still rejected. The approvals
config field is now named `collateral` rather than `usdc` for exactly this
reason.

### ⚠️ These are v2 contracts

`CTF Exchange` and `Neg Risk CTF Exchange` are the **v2** deployments
(audited March 2026 by Quantstamp and Cantina). Any older address found in
a blog post, tutorial, or model's memory is a v1 address. The docs still
list the v1 Neg Risk Adapter, explicitly marked deprecated.

### What could NOT be verified: none of this on-chain

**No address below was confirmed against Polygon.** The plan was to
`eth_getCode` each one and read `symbol()`/`decimals()` off the token
contracts. It could not be run:

- `polygon-rpc.com` answers HTTP 401 (see above), and
- every other public Polygon node (`polygon.drpc.org`, `llamarpc`, `ankr`,
  `publicnode`, `1rpc`, `blastapi`) and `polygonscan.com` itself are
  blocked by this environment's egress policy, which permits
  `*.polymarket.com` and `polygon-rpc.com` only.

So these addresses rest on two Polymarket-published sources agreeing, not
on chain state. **That is why they are still not hardcoded as defaults in
`approvals.py`.** Anyone who ever needs them should `eth_getCode` each one
and read `symbol()`/`decimals()` off the token contracts from a machine
with a working RPC, first. `approvals.py` already refuses to send to an
address with no code deployed, which is the same check at the last
possible moment.

---

## 4. The SDK adapter — rewritten (international venue)

> `polymarket-client` is the international venue's SDK. The rewrite below
> is a real correction to real breakage, but it does not give this account
> a live path — see the venue note at the top.

`live/client.py` targeted `py_clob_client_v2`, a package guessed at from a
README. The package is real, but it is superseded, and the adapter's API
surface was wrong in nearly every particular.

**The current official SDK is `polymarket-client`** (imported as
`polymarket`), documented at
<https://docs.polymarket.com/getting-started/python>. It supersedes
`py-clob-client`, `py-clob-client-v2`, `py-builder-relayer-client` and
`py-builder-signing-sdk`; the docs' own migration guide instructs
uninstalling them.

Checked against `polymarket-client` 0.6.0 by introspection and by running
the read calls live:

| adapter assumed | actual |
| --- | --- |
| `import py_clob_client_v2` | `from polymarket import SecureClient` |
| `ClobClient(host=, chain_id=, key=)` | `SecureClient.create(private_key=, wallet=)` |
| `create_or_derive_api_key()` | performed inside `create()` |
| `set_api_creds(creds)` | gone; read `client.credentials` |
| `signature_type=` parameter | derived from the wallet — see below |
| `get_ok()` | no such method (plain REST `/ok`) |
| `get_tick_size(token)` | `get_order_book(token_id=).tick_size` |
| `get_orders()` | `list_open_orders()` → paginator |
| `create_and_post_order(OrderArgs)` | `place_limit_order(token_id=, price=, size=, side=, post_only=)` |
| `cancel(order_id)` | `cancel_order(order_id=)` |
| `get_address()` | `.wallet` / `.signer` properties |
| `cancel_all()` | correct — the only call that survived |

Note that every method is **keyword-only**, so the old positional calls
would have failed even where a name happened to match.

Live-verified reads: `get_order_book` returns tick size (`0.001`), minimum
order size (`5`), `neg_risk`, `last_trade_price`, and bid/ask levels as
`Decimal`. Writes remain unexercised — that is what `live-check --live` is
for.

### Two things this changed in the plumbing check

- **Tick size and minimum order size are read, not assumed.** They arrive
  together on the order book, and the venue reports `min_order_size` of 5
  shares. The old code assumed a $1.05 notional floor was the only
  minimum, which would have had orders rejected for a reason nothing named.
- **Rejections are reported by their own fields.** `place_limit_order`
  returns either an `AcceptedOrder` (`order_id`, `status`) or a
  `RejectedOrder` (`code`, `message`); printing the object buried the
  reason.

---

## 5. Signature type — NOT APPLICABLE to this account

> No wallet, no signing, no signature type. Kept as a record of what the
> international SDK actually does, since the old code guessed wrongly.

There is **no `signature_type` parameter** in the current SDK. It is
inferred: the SDK derives each known wallet layout from the signing key and
sees which one matches the `wallet` address passed to `create()`
(`polymarket._internal.wallet.classify_wallet_type`).

| wallet | type | signature_type |
| --- | --- | --- |
| the signing key's own address | `EOA` | 0 |
| **email / Magic proxy** | **`POLY_PROXY`** | **1** |
| browser wallet proxy (Gnosis Safe) | `GNOSIS_SAFE` | 2 |
| deposit wallet | `DEPOSIT_WALLET` | 3 |

This confirms signature type **1** for this account, and shows the old
comment in `client.py` was wrong about type 2 — it is a Gnosis Safe, not a
generic "browser proxy". Type 3 did not exist when that comment was
written.

Derivation is strictly safer than a configured integer: a wallet that
derives from no known layout is rejected up front with `UserInputError`,
rather than producing orders the venue rejects for reasons it will not
explain.

### On the international venue

`PMBOT_FUNDER` sets the `wallet` the key acts for. Omitting it for a proxy
account makes the SDK fall back to the deposit-wallet flow and sign for a
different account entirely. `LiveClient` reports the classification the SDK
arrived at, so the account being signed for is visible before an order is
sent rather than inferred afterwards.

---

## 6. Approvals — NOT APPLICABLE to this account

There is nothing to approve: a Polymarket US account holds no tokens you
control the keys to.

Independently of that, `python -m pmbot.cli approvals` now **refuses to
run** when the funder differs from the signing address — the proxy-wallet
case on the international venue — for two reasons, either sufficient:

1. Polymarket grants a proxy's approvals itself when the account is
   created.
2. More importantly, the approvals would not work anyway. The collateral
   and shares belong to the **proxy** address; an `approve` signed by the
   key grants rights over the key's own wallet, which holds nothing. The
   transactions succeed, the gas is spent, nothing is granted, and every
   order stays rejected for a reason no output mentions.

The command is kept for the EOA path, which phase 3b may want.

---

## Re-running any of this

```bash
python -m pmbot.cli doctor    # every endpoint on the read path, live
python -m pytest -q           # 148 tests, no network
```

The on-chain address check is not worth re-running for this account: it
belongs to sections 3-6, which do not apply. The open question worth
answering next is whether Gamma and the CLOB serve Polymarket US markets
at all.
