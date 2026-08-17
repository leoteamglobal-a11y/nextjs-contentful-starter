# Polymarket US — a trading bot, built in phases

A trading bot for **Polymarket US** (polymarket.us): resolve a market,
stream its order book over WebSocket, journal everything to disk, replay
those journals through a strategy, and — behind an explicit opt-in — place a
capped live order.

> **This targets Polymarket US, not polymarket.com.** They are different
> exchanges. Polymarket US is CFTC-regulated, KYC'd and USD-settled; there
> is no wallet, no private key and no chain. An account and a balance on one
> venue does not exist on the other, and the APIs have nothing in common.

---

## The migration: what was reused, what was rebuilt

This started life against the international CLOB (polymarket.com: Gamma +
CLOB REST, a public WebSocket, orders signed with an Ethereum key on
Polygon). Moving it to Polymarket US replaced the entire venue.

The interesting result is how little of the *thinking* had to move. Roughly
60% of the code was untouched, and not by luck: the original split put
everything venue-specific behind a narrow boundary, and this migration is
the test of whether that boundary was drawn in the right place. It was —
with one adjustment, described below.

### Reused unchanged

| Module | What it does | Why it survived |
|---|---|---|
| `portfolio.py` | positions, cash, weighted-average cost basis, realised/unrealised P&L | arithmetic on fills. No venue in it. |
| `risk.py` | the veto layer: order size, position, exposure, price band, sticky halt, kill-switch file | operates on intents and a portfolio, both venue-neutral |
| `sim.py` | paper broker and the fill model (trade-tape priority, queue haircut) | consumes canonical book/trade events |
| `strategy/` | the `Strategy` protocol, `Context`, and the maker | sees books and returns intents; never touches a client |
| `replay.py` | the backtest loop and its ordering guarantee | drives the above over journal records |
| `intents.py` | `PlaceQuote` / `CancelQuote` / `CancelAll` | a price, a size and a side mean the same thing everywhere |
| `journal.py` | append-only JSONL, daily rotation, truncation-tolerant replay | a log is a log |
| `book.py` | in-memory order book, best bid/ask, spread, mid, crossed detection | pure state machine over canonical messages |

Old journals still replay. Old backtests still run. Every one of the
original tests in these modules still passes, unmodified.

### Rebuilt

| Module | Before | After |
|---|---|---|
| `endpoints.py` | `gamma-api` + `clob.polymarket.com` + a Polygonscan link | `gateway.polymarket.us` (public) + `api.polymarket.us` (auth), paths kept separate from URLs for signing |
| `auth.py` | *did not exist* — phase 1 deliberately held no credentials | **new.** Ed25519 signing of `timestamp + METHOD + path` |
| `config.py` | refused to read a private key | reads an API key pair; still cannot enable trading from the environment |
| `discovery.py` | slug → `conditionId` → one CLOB token id per outcome, paired by label | slug **is** the instrument; sides are directions, not assets |
| `plan.py` | N markets → 2N token ids | N markets → N slugs, chunked at the venue's 100-per-subscription cap |
| `feed.py` | public `market` channel, no auth, snapshot + increments | authenticated handshake, full snapshots, and **normalisation** (below) |
| `live/client.py` | `py-clob-client`, wallet, `signature_type`, funder, L1→L2 key derivation | the official `polymarket_us` SDK and four order intents |
| `live/checks.py` | connect → derive credentials → post → cancel | adds a free `preview` step before the first real order |
| `cli.py` | `doctor`, `market`, `watch`, `report`, `backtest`, `live-check`, `approvals` | same, minus `approvals`, plus `search` |

### Deleted outright

`live/approvals.py` (344 lines) and its 12 tests. On the international venue
a fresh wallet had to grant the exchange standing permission to move its
USDC (ERC-20 `approve`) and its outcome shares (ERC-1155
`setApprovalForAll`) before a single order could rest — an on-chain
transaction to an address that had to be exactly right, because approving
the wrong one is not a failed transaction, it is a working one that hands a
stranger your balance.

Polymarket US settles USD on a regulated exchange. There is no wallet, no
chain, no approval, and no `web3` dependency. That entire failure mode is
gone, and with it the most dangerous file in the repo.

Also gone: `signature_type` (0/1/2 for EOA vs Magic vs browser proxy —
wrong value meant every order silently rejected), the `funder` address, gas,
and POL/MATIC balance management.

### The two decisions that made the reuse possible

**1. Normalise at the feed, not at the strategy.**

The venue's wire format is protobuf-derived JSON: camelCase envelopes,
prices as `{"value": "0.555", "currency": "USD"}`, sizes as strings,
RFC-3339 timestamps with nanosecond precision, and the sell side called
`offers`. `feed.normalize()` translates all of that into the small canonical
shape the package already used — `event_type`, `asset_id`, float `price` and
`size` — before anything else sees a message.

That single function is why the fill simulator, the risk layer, the replay
engine and the strategies needed no changes at all. It is also the seam a
third venue would be adapted at, and it is the most heavily tested code in
the file, because it is the one place where a schema change can quietly
corrupt every downstream number.

**2. The slug is the instrument key.**

Downstream code says `token_id`. On this venue that field carries a **market
slug**. Renaming it would have touched `portfolio.py`, `risk.py`, `sim.py`,
`strategy/` and `replay.py` — five modules that have no venue-specific logic
in them — to no functional end, since the key is an opaque string either
way. The name stayed; the meaning is documented here and at each boundary.

### What genuinely changed in the model

| | polymarket.com | Polymarket US |
|---|---|---|
| Instrument | two ERC-1155 token ids per market (YES, NO) | **one** per market, addressed by slug |
| Going short | buy the complementary token | sell the long instrument (`ORDER_INTENT_SELL_LONG`) |
| Auth | Ethereum key → L1 signature → L2 HMAC creds | API key id + Ed25519 secret |
| Market data feed | public, anonymous | **authenticated** |
| Book updates | snapshot + `price_change` increments | full snapshot every message |
| Order key | `token_id` | `marketSlug` + `intent` + `type` + `price` + `quantity` + `tif` |
| Settlement | USDC on Polygon | USD, exchange-settled |
| Pre-trade | token approvals, gas | KYC (already done in the app) |
| Tick size | 0.01 typically | per-market `orderPriceMinTickSize`, often **0.001** |
| Fees | maker rebates, taker fees | see [docs.polymarket.us/fees](https://docs.polymarket.us/fees) |

Two of these have teeth:

- **The feed is authenticated.** The old design's proudest property — phase
  1 *cannot* lose money because it holds no credentials — does not survive.
  Recording a book now requires the same key that can trade. The guard rail
  that replaces it is narrower and honest: credentials are read, but the
  only code that can send an order lives in `live/` and asks first.
- **The tick is often 0.001, not 0.01.** A maker quoting on a 0.01 grid on a
  0.001-tick market is leaving nine ticks of queue position on the table.
  `market` prints the real tick; `backtest --tick` takes it.

---

## Why this shape

Most prediction-market bot tutorials stop after "here is how to POST one
order from Python". That is the easy 10%. The parts that decide whether a
bot survives contact with a live venue are the ones they skip: streaming
instead of polling, surviving disconnects, and recording enough to
reconstruct what the bot believed when it made a bad decision.

Three things it does differently:

- **Normalises the venue's format at one seam.** Everything above `feed.py`
  speaks one message shape, which is why a whole-venue migration touched
  none of the trading logic.
- **Throws the book away on reconnect.** What you missed while disconnected
  may have included a state change, and quoting against a stale book is the
  failure this exists to prevent.
- **Journals the message before parsing it.** A parser bug should cost you a
  re-run, not the data.

## Install

```bash
cd Polymarket
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH=src
```

Get an API key: create an account in the Polymarket US app, complete
identity verification, then go to
[polymarket.us/developer](https://polymarket.us/developer). The secret is
shown **once**.

```bash
export POLYMARKET_KEY_ID=...
export POLYMARKET_SECRET_KEY=...
```

`search`, `market`, `report` and `backtest` work without them. `watch` and
`live-check` do not.

## Use

```bash
# Can this machine reach the venue, and is the key valid?
python -m pmbot.cli doctor

# Find a slug. Slugs here are venue-generated (aec-nfl-lac-ten-2025-11-02),
# not readable like on polymarket.com — so this is usually step one.
python -m pmbot.cli search "world series"

# Market details: sides, tick size, minimum quantity, tradability.
python -m pmbot.cli market <url-or-slug>

# Stream the book, print top-of-book, write a journal. Needs credentials.
python -m pmbot.cli watch <slug> --seconds 300

# Several markets at once — one connection, one journal.
python -m pmbot.cli watch <slug-a> <slug-b> <slug-c> --name overnight

# Summarise what a journal captured.
python -m pmbot.cli report journal/overnight-<date>.jsonl

# Replay a journal through a paper-trading strategy.
python -m pmbot.cli backtest journal/overnight-<date>.jsonl --tick 0.001
```

Journals land in `./journal/` as one JSONL file per stream per UTC day, and
are gitignored.

## Watching several markets

Markets are **multiplexed onto one WebSocket connection** — one socket to
reconnect, one ordering of events, one journal to replay. The venue caps a
subscription at 100 markets, so `plan.py` chunks beyond that; it is still
one connection.

```
3 market(s), 3 instrument(s), 1 connection, 1 subscription(s)
  tec-mlb-champ-2026-09-27-ath (World Series Champion)  bid 0.21  ask 0.22  mid 0.215
```

Each market is one instrument, so there is no longer a row per outcome. A
market that fails to resolve is reported and skipped rather than aborting
the run — a typo'd slug is a bad reason to lose an overnight recording.

An authentication failure on the handshake is **not** retried. A key does
not become valid by being retried, and a bot that spins on 401 forever looks
alive in the logs while recording nothing.

## Tests

```bash
python -m pytest -q     # 176 tests, no network required
```

Every test runs offline against fixtures and hand-built payloads: an
exchange is the one dependency you cannot spin up locally, so all parsing
and book-keeping is pure and testable without one.

Covered, beyond the original suite: Ed25519 signing (including that the
signature covers the path and **not** the query string — the mistake that
costs an afternoon), venue-format normalisation for books, trades, BBO,
heartbeats and errors, that normalised messages feed the *existing* book and
replay engines unchanged, that BBO is never passed off as a book snapshot,
subscription chunking at the venue's 100-market cap, halted-vs-empty market
distinction, order intent mapping, decimal-string price encoding, tick
snapping, and that auth rejections stop rather than retry.

## Endpoint verification

Unlike the previous version of this file, these endpoints **were verified
against the live API** — the market list, market-by-slug, order book and BBO
responses were fetched and parsed, and the WebSocket handshake was confirmed
to reach the venue and reject an invalid key with HTTP 401. `doctor` re-runs
the reachability half on your machine.

Not verified, because it needs your credentials and real money: placing,
listing and cancelling an order. That is exactly what `live-check` is for.

## Phase 2 — paper trading

```bash
# No real data yet? Generate a synthetic journal to exercise the machinery.
python tools/synth_journal.py --out /tmp/synth.jsonl --updates 3000
python -m pmbot.cli backtest /tmp/synth.jsonl --half-spread 0.02 --size 25
```

The replay loop, and the order of its steps, is the whole design:

```
book update -> match resting orders -> strategy reacts -> risk vetoes -> broker applies
```

Matching happens **before** the strategy sees the update. Reversing those two
lets a strategy act on a price and then be filled at it — lookahead bias, and
the reason so many paper P&Ls do not survive a real venue.

### How fills are inferred, and why it matters

- **Trade prints.** A trade at price *p* means anyone bidding at or above
  *p* should have been hit first, so a resting bid at ≥ *p* fills — at its
  own price, since the taker crosses to it. **This is how a maker actually
  gets filled**, which is why `watch` subscribes to the trade tape alongside
  the book by default.
- **Book crossing.** The best ask drops below your resting bid. Real, but
  rare.

This broke the first version: with book-only data a maker quoting outside
the spread needs a single-tick jump larger than the spread to fill, which
essentially never happens — the first backtest reported **zero fills over
2000 updates**. Market making looked impossible when it was merely
unmeasured. If your journal has no trade prints, `backtest` says so rather
than reporting a confident zero.

Everything still unmodelled points the same way — optimistic:

| Unmodelled | Costs you, live |
|---|---|
| Latency | quotes arrive after the price has moved |
| Queue position | `queue_factor` haircuts fills; 1.0 assumes you are always first |
| Cancel races | here a cancel always wins; live it can lose to a fill |
| Sub-snapshot moves | trades that happen and revert between snapshots |
| Fees | `--fee-bps` defaults to 0; the venue's real schedule is not 0 |

**Treat a marginally profitable backtest as a losing one.**

And note what `tools/synth_journal.py` is not: a random walk with a constant
spread and direction-less trades is precisely the world where naive market
making prints money, because there is no adverse selection in it. It exists
to prove the code runs, never to decide whether a strategy works.

### Risk has veto power from day one

Every intent passes through `risk.py` before reaching any broker, in
backtests as much as live. A risk layer written the day you go live is one
that has never been exercised; this one has already vetoed thousands of
orders before it ever sees money. It caps order size, position, exposure and
price band, halts on drawdown — **stickily**, because a limit you recover
from automatically is not a limit — and reads a kill switch from a file on
disk, so stopping the bot never requires a redeploy.

This module was not touched by the migration.

## Phase 3a — the plumbing test

```bash
# Dry run: prints what it would do, uses no credentials, sends nothing.
python -m pmbot.cli live-check <slug>

# The real thing.
pip install -r requirements-live.txt
python -m pmbot.cli live-check <slug> --live
```

This is **not the bot running**. It is a checklist that proves the live path
works, one step at a time:

```
connect + authenticate -> venue reachable -> read tick size -> read the book
-> preview the order -> post it -> see it listed -> cancel it -> see it gone
```

The default run **costs nothing at all** — there is no gas on this venue, so
an unfilled, cancelled order is free. The order sits ~10 cents below the
touch specifically so it cannot fill.

The rails, and why each exists:

| Rail | Reason |
|---|---|
| `--live` required, dry run default | posting real orders should never be the accidental path |
| `PLUMBING_MAX_NOTIONAL` is a constant, not a flag | raising the ceiling requires a diff, which requires a thought |
| Order previewed before it is sent | the venue will tell you an order is malformed for free |
| Order journalled *before* it is sent | a process that dies mid-request still leaves a record of what was in flight |
| `cancel_all()` in a `finally` | a crash must never leave an order resting |
| Typed confirmation prompt | the last chance to notice you are pointed at the wrong market |
| Secrets never rendered | `redacted()` prints a length, never the key |

### Before the first live run

1. **Check the fee schedule.** In market making the difference between 0 and
   20bps decides whether the strategy exists at all —
   [docs.polymarket.us/fees](https://docs.polymarket.us/fees).
2. **Check the tick.** `market <slug>` prints it. Often 0.001.
3. **Check trading hours.** Unlike a 24/7 crypto venue, this one has
   scheduled maintenance and per-market hours.
4. **Check your clock.** Timestamps more than 30 seconds out of sync are
   rejected exactly like a bad key, with an error that says nothing useful.

No wallet funding, no gas token, and no approvals: your KYC'd USD balance is
the whole story.

### On $70

$70 is the right size for this and the wrong size for trading. Even a great
10% monthly return is $7 — less than the time spent reading the logs. Treat
it as a validation budget: it buys proof that auth, ordering, fills,
cancellation and settlement all work, which cannot be bought any other way
and is worth far more than $7 before scaling.

## What comes next

| Phase | Adds | Money at risk |
|---|---|---|
| **1. Observe** ✅ | discovery, feed, book, journal | none |
| **2. Paper trade** ✅ | strategy, fill sim, risk veto, backtest | none |
| **3a. Plumbing test** ✅ | live auth, one order, cancel | a capped, cancelled order |
| 3b. Strategy live | `LiveBroker` behind the existing `RiskManager` | hard-capped, small |
| 4. Scale | only if 3b shows a real edge over weeks | your call |

Phase 3b reuses phases 1 and 2 whole: the same `Strategy`, the same
`RiskManager`, the same intents. Only the broker changes — `PaperBroker`
becomes one that posts through `LiveClient`. That swap is the entire
remaining surface where money can be lost, which is exactly how small you
want it to be.

The private WebSocket (`/v1/ws/private`) is the natural companion: order,
position and balance updates pushed rather than polled, which is both
correct and how you stay inside 20 req/s. `endpoints.py` has the URL;
nothing consumes it yet.

It should not be built until 3a passes and a backtest on **real** recorded
data says there is an edge worth defending.

## A word on strategy

The fast crypto markets that make these bots look lucrative are a **latency
race**, not a prediction problem. Winning there means repricing before the
resting quotes do, which is an infrastructure game against colocated
competitors. From Python on an ordinary VPS you are the liquidity, not the
one taking it.

Market making on slower markets — sports with distant resolution, futures
like a season champion — is where a retail-scale bot has a defensible reason
to exist: you earn the spread for providing liquidity, and the edge decays in
hours rather than milliseconds. Polymarket US is heavily sports-weighted,
which suits that better than the old venue did.
