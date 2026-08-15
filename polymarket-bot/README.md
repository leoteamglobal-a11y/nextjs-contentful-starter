# pmbot — phase 1: read-only Polymarket market data

A market-data client for Polymarket: resolve a market, stream its order book
over WebSocket, and journal everything to disk for later analysis.

**It cannot trade.** There is no signing code, no private key handling, and
no order endpoint in this package. That is the point of phase 1 — you find
out whether you have an edge before any money is exposed to a bug.

## Why this shape

Most Polymarket bot tutorials stop after "here is how to POST one order from
Python". That is the easy 10%. The parts that decide whether a bot survives
contact with a live venue are the ones they skip: streaming instead of
polling, surviving disconnects, and recording enough to reconstruct what the
bot believed when it made a bad decision. This phase builds those first.

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

# Resolve a market URL to its conditionId and per-outcome token ids.
python -m pmbot.cli market https://polymarket.com/event/<slug>

# Stream the book, print top-of-book, write a journal.
python -m pmbot.cli watch <url-or-slug> --seconds 300

# Summarise what a journal captured.
python -m pmbot.cli report journal/feed-<slug>-<date>.jsonl
```

Journals land in `./journal/` as one JSONL file per stream per UTC day, and
are gitignored.

## Tests

```bash
python -m pytest -q     # 33 tests, no network required
```

The suite runs entirely against recorded fixtures in `tests/fixtures/`. This
is deliberate: an exchange is the one dependency you cannot spin up locally,
so every piece of parsing and book-keeping logic is pure and testable
offline. Covered: snapshot/increment application, level removal on zero size,
crossed-book detection, malformed-level tolerance, outcome pairing under
reordering, batched vs single WebSocket frames, and journal recovery from a
truncated final line.

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

## What comes next

| Phase | Adds | Money at risk |
|---|---|---|
| **1. Observe** *(this)* | discovery, feed, book, journal | none |
| 2. Paper trade | `strategy/`, fill simulation, replay backtest over phase-1 journals | none |
| 3. Live, capped | `auth`, `execution`, `risk`, `redeem` | hard-capped, small |
| 4. Scale | only if phase 3 shows a real edge over weeks | your call |

Do not skip phase 2. It is the step that tells you whether the strategy is
worth funding, and it costs nothing but time.

When you get to phase 3, two rules earn their keep: `risk.py` gets veto power
over every order `execution.py` sends, and the kill switch is a file on disk
the bot checks before each order — not a config value you have to redeploy to
change.

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
