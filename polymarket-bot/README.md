# pmbot — a Polymarket trading bot, built in phases

A market-data client for Polymarket: resolve a market, stream its order book
over WebSocket, and journal everything to disk for later analysis.

Phase 2 adds paper trading on top: a strategy interface, a fill simulator, a
risk veto layer and a backtest that replays those journals.

**It cannot trade.** There is no signing code, no private key handling, and
no order endpoint in this package. That is the point — you find out whether
you have an edge before any money is exposed to a bug.

## Why this shape

Most Polymarket bot tutorials stop after "here is how to POST one order from
Python". That is the easy 10%. The parts that decide whether a bot survives
contact with a live venue are the ones they skip: streaming instead of
polling, surviving disconnects, and recording enough to reconstruct what the
bot believed when it made a bad decision. Those come first here.

Three specific things it does differently:

- **Pairs outcomes to tokens by label, never by array index.** Tutorials dig
  YES out of position `[0]` and hope. Both Gamma and the CLOB label every
  token with its outcome name, so `market.outcome_token("Yes")` is exact.
  `test_outcome_lookup_survives_reordering` pins this down.
- **Throws the book away on reconnect.** Increments missed while
  disconnected are unrecoverable. Resuming the old state would leave you
  quoting against a book that silently drifted from reality, so the feed
  emits a synthetic `_reconnected` event and the consumer resets to wait for
  a fresh snapshot.
- **Journals the raw message before parsing it.** A parser bug should cost
  you a re-run, not the data.

## Install

```bash
cd polymarket-bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH=src
```

## Use

```bash
# Can this machine actually reach the venue?
python -m pmbot.cli doctor

# Resolve market URLs to their conditionIds and per-outcome token ids.
python -m pmbot.cli market https://polymarket.com/event/<slug>

# Stream the book, print top-of-book, write a journal.
python -m pmbot.cli watch <url-or-slug> --seconds 300

# Several markets at once — one connection, one journal.
python -m pmbot.cli watch <slug-a> <slug-b> <slug-c> --name overnight

# Summarise what a journal captured, broken down per market.
python -m pmbot.cli report journal/overnight-<date>.jsonl

# Replay a journal through a paper-trading strategy (phase 2, see below).
python -m pmbot.cli backtest journal/overnight-<date>.jsonl
```

Journals land in `./journal/` as one JSONL file per stream per UTC day, and
are gitignored.

## Watching several markets

Pass as many markets as you like. They are **multiplexed onto one WebSocket
connection**, because the CLOB market channel accepts a list of asset ids in
a single subscription — one socket to reconnect, one ordering of events, one
journal to replay. Opening a connection per market would buy nothing and
multiply the failure modes.

```
2 market(s), 4 token(s), 1 connection
  btc-up-or-down/Up     bid 0.49   ask 0.51   mid 0.5
  btc-up-or-down/Down   bid 0.49   ask 0.51   mid 0.5
  madrid-barca/Yes      bid 0.61   ask 0.63   mid 0.62
  madrid-barca/No       bid 0.37   ask 0.39   mid 0.38
```

Every row is labelled `slug/outcome`, which matters as soon as two markets
both have a "Yes". Duplicate token ids across references are subscribed once.
A market that fails to resolve is reported and skipped rather than aborting
the run — a typo'd slug is a bad reason to lose an overnight recording.

## Tests

```bash
python -m pytest -q     # 106 tests, no network required
```

The suite runs entirely against recorded fixtures in `tests/fixtures/`. This
is deliberate: an exchange is the one dependency you cannot spin up locally,
so every piece of parsing and book-keeping logic is pure and testable
offline. Covered: snapshot/increment application, level removal on zero size,
crossed-book detection, malformed-level tolerance, outcome pairing under
reordering, multi-market planning and label collisions, book reset on
reconnect, batched vs single WebSocket frames, journal recovery from a
truncated final line, cost-basis and realised/unrealised P&L including
flipping through zero, every risk veto and the sticky halt, maker quoting
and inventory skew, trade-tape fills by price priority, and the absence of
lookahead in the replay loop.

## Status of the endpoints

`src/pmbot/endpoints.py` holds every URL. They were written **without live
verification** — the environment this was authored in had outbound access to
`*.polymarket.com` blocked by network policy, so nothing here has been run
against the real venue. `doctor` is the first thing to run on a machine with
real network access; if an endpoint has moved, it is a one-file fix.

Note also that the SDK most tutorials use, `py-clob-client`, is **archived**.
The current one is [`polymarket-client`](https://github.com/Polymarket/py-sdk)
(`pip install polymarket-client`). Phase 1 talks to the public REST and
WebSocket endpoints directly and needs neither.

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

There are two paths, and they are not equally important:

- **Trade prints** (`last_trade_price`). A trade at price *p* means anyone
  bidding at or above *p* should have been hit first, so a resting bid at
  ≥ *p* fills — at its own price, since the taker crosses to it. **This is
  how a maker actually gets filled.**
- **Book crossing.** The best ask drops below your resting bid, i.e. the
  market jumped clean through you. Real, but rare.

This distinction was not obvious up front, and it broke the first version:
with book-only data a maker quoting outside the spread needs a single-tick
jump larger than the spread to fill, which essentially never happens — so
the first backtest reported **zero fills over 2000 updates**. Market making
looked impossible when it was merely unmeasured. If your journal has no
trade prints, `backtest` says so rather than reporting a confident zero.

Everything still unmodelled points the same way — optimistic:

| Unmodelled | Costs you, live |
|---|---|
| Latency | quotes arrive after the price has moved |
| Queue position | `queue_factor` haircuts fills; 1.0 assumes you are always first |
| Cancel races | here a cancel always wins; live it can lose to a fill |
| Sub-snapshot moves | trades that happen and revert between snapshots |

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

## What comes next

| Phase | Adds | Money at risk |
|---|---|---|
| **1. Observe** ✅ | discovery, feed, book, journal | none |
| **2. Paper trade** ✅ | strategy, fill sim, risk veto, backtest | none |
| 3. Live, capped | `auth`, real `execution`, `redeem` | hard-capped, small |
| 4. Scale | only if phase 3 shows a real edge over weeks | your call |

Phase 3 reuses phases 1 and 2 whole: the same `Strategy`, the same
`RiskManager`, the same intents. Only the broker changes — `PaperBroker`
becomes one that signs and posts. That swap is the entire remaining surface
where money can be lost, which is exactly how much of it you want to be.

## A word on strategy

The "Bitcoin up or down in 5 minutes" markets that make these bots look
lucrative are a **latency race**, not a prediction problem. Winning there
means seeing the spot price move and repricing before the resting quotes do,
which is an infrastructure game against colocated competitors. From Python on
an ordinary VPS you are the liquidity, not the one taking it.

Market making on slower markets — sports, politics with distant resolution —
is where a retail-scale bot has a defensible reason to exist: you earn the
spread for providing liquidity, and the edge decays in hours rather than
milliseconds.
