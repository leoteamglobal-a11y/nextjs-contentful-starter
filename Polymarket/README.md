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
| `strategy/` | the `Strategy` protocol, `Context`, and the maker | sees books and returns intents; never touches a client |
| `replay.py` | the backtest loop and its ordering guarantee | drives the above over journal records |
| `intents.py` | `PlaceQuote` / `CancelQuote` / `CancelAll` | a price, a size and a side mean the same thing everywhere |
| `journal.py` | append-only JSONL, daily rotation, truncation-tolerant replay | a log is a log |
| `book.py` | in-memory order book, best bid/ask, spread, mid, crossed detection | pure state machine over canonical messages |

Old journals still replay. Old backtests still run. Every one of the
original tests in these modules still passes, unmodified.

### Reused with one additive change

`sim.py` — the paper broker and its fill model — kept all of its logic and
gained an optional `fee_model` hook, defaulting to the previous `fee_bps`
behaviour so nothing that existed before changed.

It needed one because Polymarket US does not charge a rate on notional. Its
fee is `Θ × contracts × p × (1 - p)`, which is a different *shape*, not a
different number: no value of `fee_bps` matches it at more than one price.
See [Fees](#fees--the-exact-schedule).

### Rebuilt

| Module | Before | After |
|---|---|---|
| `endpoints.py` | `gamma-api` + `clob.polymarket.com` + a Polygonscan link | `gateway.polymarket.us` (public) + `api.polymarket.us` (auth), paths kept separate from URLs for signing |
| `config.py` | refused to read a private key | reads an API key pair; still cannot enable trading from the environment |
| `discovery.py` | slug → `conditionId` → one CLOB token id per outcome, paired by label | slug **is** the instrument; sides are directions, not assets |
| `plan.py` | N markets → 2N token ids | N markets → N slugs, chunked at the venue's 100-per-subscription cap |
| `feed.py` | public `market` channel, no auth, snapshot + increments | authenticated handshake, full snapshots, and **normalisation** (below) |
| `live/client.py` | `py-clob-client`, wallet, `signature_type`, funder, L1→L2 key derivation | the official `polymarket_us` SDK and four order intents |
| `live/checks.py` | connect → derive credentials → post → cancel | adds a free `preview` step before the first real order |
| `cli.py` | `doctor`, `market`, `watch`, `report`, `backtest`, `live-check`, `approvals` | same, minus `approvals`, plus `search` and `run` |

### Added

| Module | What it is |
|---|---|
| `auth.py` | Ed25519 request signing — phase 1 deliberately held no credentials before |
| `fees.py` | the venue fee schedule, exactly, pinned to the published table |
| `live/private.py` | the private stream: real orders, fills, positions, balance |
| `live/broker.py` | `LiveBroker` — `PaperBroker`'s interface, real money behind it |
| `live/collateral.py` | this venue's fully-collateralised buying-power rules |
| `live/runner.py` | the live loop: `replay.run_replay` with the simulator removed |

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

## Windows: one-click launchers

`windows/` holds `.bat` launchers so the tool can be used without a
terminal. They exist because the alternative — pasting five lines including
a secret into a fresh PowerShell every time — is both tedious and the most
likely way for that secret to end up somewhere it should not be.

| File | What it does |
|---|---|
| `instalar.bat` | Creates the virtualenv and installs dependencies. Run once. |
| `clave.ejemplo.bat` | Template. Copy to `clave.bat` and fill in your key. |
| `grabar.bat` | Starts a recording. Edit the `MERCADOS` line to change markets. |
| `consola.bat` | Opens a console with everything set, for `pmbot ...` commands. |

`windows/clave.bat` is gitignored; the template is not. Each launcher checks
its preconditions in order and stops at the first missing one with an
instruction — a launcher that fails with a Python traceback is no use to
someone who does not program.

`pmbot.bat` in the project root makes `pmbot doctor` work in any console
opened there: cmd searches the current directory before the PATH, and the
wrapper sets `PYTHONPATH` itself so it does not depend on the window being
prepared first.

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
python -m pytest -q     # 304 tests, no network required
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

For phase 3b: every row of the published fee table and all five worked
examples, that a flat bps rate provably cannot represent the schedule, that
the maker rebate increases cash, collateral arithmetic against the venue's
own margin example, every broker guard (buying power, no accidental shorts,
notional caps, rate limiting, round-down sizing), that a failed cancel keeps
the order locally rather than losing track of it, that a venue snapshot
replaces local state rather than merging, that a trade print is not mistaken
for one of our fills, that quoting stops the moment either socket drops, and
that orders are cancelled on halt, blindness and exit alike.

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

**Treat a marginally profitable backtest as a losing one.**

## Fees — the exact schedule

Effective exchange-wide from 12 AM ET, Wednesday 1 July 2026. Source:
[docs.polymarket.us/fees](https://docs.polymarket.us/fees). Implemented in
`fees.py` and pinned to the published table by `tests/test_fees.py`.

```
Fee = Θ × C × p × (1 - p)
```

| | Θ (theta) | Max, at p = $0.50, per 100 contracts |
|---|---|---|
| **Taker** | `+0.06` | pays **$1.50** |
| **Maker** | `-0.0125` | receives **$0.31** |

`C` is contracts and `p` the decimal price. Both sides are charged off the
same `p(1-p)` factor, so fees are symmetric around $0.50 and collapse
towards the extremes.

### The three things that actually matter

**1. This is not a rate on notional, and no `fee_bps` can express it.**

A conventional fee model charges `notional × rate` — proportional to
`p × C`. This venue charges proportional to `p × (1 - p) × C`. Divide one
by the other and the implied bps rate is `Θ × (1 - p)`: a function of
price, not a constant.

| Price | Implied maker rate | Off by |
|---|---|---|
| $0.50 | −62.5 bps | — |
| $0.75 | −31.2 bps | 2× |
| $0.90 | −12.5 bps | 5× |

Anchor a flat rate at the midpoint and it is five times too large at
$0.90 — which is exactly where a sports maker spends its time. So
`PaperBroker` grew an optional `fee_model` hook and the backtest uses the
real formula by default. `--fee-bps` still exists, for reproducing older
results, and prints a warning saying it is not how the venue charges.

**2. The maker rebate is income, not a cost.** Θ is negative for makers.
A resting quote that gets taken is *paid* ~$0.31 per 100 contracts at the
midpoint, credited at the moment of the fill. For a strategy whose entire
edge is a cent or two of spread, that is not a rounding detail — in the
synthetic run above it is a sixth of the total P&L. `backtest` prints it on
its own line as `maker rebate +X (earned, not paid)` so it cannot be misread
as a loss.

**3. Fees are cheapest at the extremes.** `p(1-p)` peaks at $0.50 and
collapses at both ends: a taker pays $1.50 per 100 contracts at the
midpoint and $0.06 at $0.01 — a 25× difference. That inverts the flat-bps
intuition. Quoting long-shot and near-certain markets is cheap; coin flips
are where the fee eats the spread.

### Rounding

Fees round to the cent with **banker's rounding** (half to even), per fill.
This has to be done in exact decimal arithmetic, not floats. At $0.05 the
exact taker fee on 100 contracts is $0.2850, which banker's-rounds down to
the $0.28 the venue's table lists; in binary floating point the same
expression is `0.28500000000000003` and rounds up to $0.29. One cent on one
fill is nothing; the same half-cent bias in the same direction across every
fill of a backtest is not.

When an aggressive order sweeps several resting orders, the venue caps the
total commission at the banker's rounding of the cumulative exact fee, and
the adjustment can only ever reduce a fill's charge. Maker rebates are
computed per fill, independently. `fees.py` models the per-fill case, which
is the one a maker meets; the sweep adjustment only makes takers cheaper.

### Are any categories fee-free?

**No.** The published schedule has no category exemptions — no fee-free
sports, crypto or politics tier. The only ways a fee reaches zero are:

- **The order never trades.** Cancelled, expired or rejected orders are
  never charged. Fees attach to executions, not to orders.
- **It rounds to zero.** On a small enough trade, or at a price close
  enough to $0.00 or $1.00, the rounded fee is $0.00. One contract at
  $0.50 is charged nothing on either side.

### Taker rebate tiers

Volume rebates apply to **taker** fees only, paid weekly, tiered on the
prior calendar month's notional taker volume:

| Prior month taker volume | Taker fee rebated |
|---|---|
| $250,000 – $999,999 | 10% |
| $1,000,000 – $9,999,999 | 25% |
| $10,000,000+ | 50% |

Polymarket will also place you by verifiable trailing-30-day volume on
another prediction market. None of this is reachable on a $70 account —
`fees.taker_rebate_rate()` encodes it so the number is not mistaken for
zero at scale.

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

1. **Check the tick.** `market <slug>` prints it. Often 0.001.
2. **Check trading hours.** Unlike a 24/7 crypto venue, this one has
   scheduled maintenance and per-market hours.
3. **Check your clock.** Timestamps more than 30 seconds out of sync are
   rejected exactly like a bad key, with an error that says nothing useful.

No wallet funding, no gas token, and no approvals: your KYC'd USD balance is
the whole story.

## Phase 3b — the strategy, live

```bash
pip install -r requirements-live.txt

pmbot run <slug> --live --seconds 300 --max-fills 2 \
    --size 1 --max-inventory 5 --max-loss 5 \
    --kill-switch /tmp/stop
```

There is **no dry run**. A dry run of a live strategy is exactly what
`backtest` already is, and offering one here would give a false sense of
having tested this path. `run` without `--live` prints the three steps that
should come first and exits.

### What is shared with phase 2, and what is not

`LiveBroker` presents the same surface as `PaperBroker` — `portfolio`,
`resting`, `apply()`, `cancel_all()`, `resting_notional_by_token()`,
`orders_for()`. The strategy and the risk layer are not modified, not
subclassed and not configured differently; they cannot tell which broker
they have. `tests/test_live_runner.py` asserts exactly that by driving one
strategy object through both.

```
backtest:  book update -> match resting -> strategy -> risk -> broker
live:      book update ->                  strategy -> risk -> broker
                              ^
                 fills arrive here instead, from the venue
```

The one structural difference is the fill model, and live there isn't one.
`sim.py`'s inference — trade-tape priority, queue haircut, and a page of
caveats about how every remaining error is optimistic — is switched off
entirely. The exchange reports what filled, on `/v1/ws/private`, and
`LiveBroker.on_private` applies it. No model, no queue factor, no optimism.

### Three guards that exist only live

The agnostic `RiskManager` runs first and is unchanged. These sit after it,
because each encodes something a venue-neutral risk layer cannot know:

| Guard | Why the agnostic layer can't do it |
|---|---|
| **Buying power** | `risk.py` measures exposure as `\|shares\| × mark`. Fully-collateralised shorts break that: a short at $0.40 locks $1.00 of margin, consuming **$0.60** of buying power, not $0.40 — 1.5× what the agnostic figure says. See `collateral.py`. Buying power is read from the venue, never computed. |
| **No accidental shorts** | Sells are clamped to the position actually held (below). |
| **Rate** | 20 req/s per key, shared with everything. A maker requoting on every book update will exceed that in a fast market. |

Each refusal is counted and reported alongside the risk vetoes.

### Long-side only, and why

Phase 3b sends `BUY_LONG` and `SELL_LONG` only, and clamps a sell to the
contracts actually held. It never opens a short.

The API exposes `BUY_SHORT` / `SELL_SHORT`, and market data carries a
`shortQuote` that is the complement of the long quote — on a live market
`longPx` was $0.0010 against `shortPx` $0.999, summing to 1. Whether a short
order's `price` field is quoted in long or short terms could not be
established from the documentation, and the two readings differ by `1 - p`.
That mistake does not fail loudly; it fills at a wildly wrong price.

So the bot stays on the side where the convention is unambiguous. This is
not a limitation of the strategy — a maker accumulates inventory on the bid
and works it off on the ask, which is entirely expressible long-only. The
restriction lifts in `LiveBroker.intent_for()` once one small `live-check`
order has confirmed the convention.

### Going blind

The failure this is built around is not a crash — it is a socket dropping
while orders are resting.

A backtest models a reconnect as "forget the book, forget your orders",
which is safe when the orders are imaginary. Live, orders you have forgotten
are still working at the exchange, quoting a price you chose against a book
you can no longer see. That is precisely what gets picked off.

So on **any** disconnect, market or private, the runner cancels everything
and stops quoting until both streams are back and it has reconciled against
the venue over REST. It keeps tracking the book while blind; it just does
not act on it. Quoting less is always available, quoting blind is not.

The safety-path cancels are forced — they go to the venue even when local
state says nothing is resting, because "I think I have no orders" is exactly
the belief worth not trusting when halting or exiting.

### The rails

| Rail | Reason |
|---|---|
| `--live` required, no dry run | `backtest` is the dry run |
| `LIVE_MAX_ORDER_NOTIONAL` / `LIVE_MAX_RESTING_NOTIONAL` are constants | raising a ceiling requires a diff |
| Orders journalled before they are sent | a process that dies mid-request still leaves a record of what was in flight |
| `--max-fills` | the cheapest way to bound a first live run |
| `--seconds` | walk away without leaving it running |
| `--kill-switch <file>` | stopping must never require a redeploy |
| Sticky loss halt | a limit you recover from automatically is not a limit |
| Forced `cancel_all` on halt, blindness and exit | a crash must never leave an order resting |
| Reconcile on start and every reconnect | accumulated state across a gap is a guess |
| Startup cancels pre-existing orders | it will not quote alongside orders it did not place |

Note what the runner does *not* do on exit: it cancels orders but does not
flatten positions. Closing a position costs money and crosses a spread, and
that decision is yours. If the run ends holding inventory it says so, loudly,
with the slug and the size.

### P&L is gross of fees

`LiveBroker` applies venue-reported fills to the portfolio with a zero fee,
because executions do not carry one — taker fees and maker rebates land in
the balance ledger instead. So `realized`/`unrealized` in `run` output are
gross, and the authoritative number is `buying power` and the app. That is
the honest split: modelling the fee locally would mean two sources of truth
for cash, and the venue's is the one that counts.

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
| **3b. Strategy live** ✅ | `LiveBroker`, private stream, collateral guards | hard-capped, small |
| 4. Scale | only if 3b shows a real edge over weeks | your call |

Phase 3b reused phases 1 and 2 whole: the same `Strategy`, the same
`RiskManager`, the same intents, the same ordering. Only the broker changed.

Do not run it until 3a passes and a backtest on **real** recorded data —
not the synthetic journal — says there is an edge worth defending. The
order of operations is `live-check --live`, then `watch` for long enough to
have real data, then `backtest`, then `run --live --seconds 300
--max-fills 2`.

What is deliberately still missing: nothing consumes `SUBSCRIPTION_TYPE_RFQ`,
combos are unimplemented, and `run` handles a single strategy across all its
markets rather than one per market.

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
