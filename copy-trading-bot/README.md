# Copy Trading Bot — Wallet Analyzer

On-chain **Solana wallet analyzer** that ranks wallets by how good a *copy-trading
target* they are. It reads a wallet's real swap history from the blockchain,
reconstructs realized PnL with a FIFO engine, and scores each wallet on
profitability **and** copyability (can you realistically mirror it in real time?).

This is **Phase C → A** of the copy trading bot:

- **Phase C (this module + notifier):** read public on-chain data, analyze and
  rank wallets, alert. Never touches your funds.
- **Phase A (next):** an executor that mirrors selected wallets' swaps via
  Jupiter, with risk controls. Only built once Phase C is validated.

> ⚠️ **Not financial advice.** Copy trading memecoins carries risk of total loss
> (slippage, front-running, rug-pulls). Start with capital you can afford to lose.
> This tool uses **only public blockchain data** — it does not connect to fomo or
> any private API.

---

## Why this exists

fomo's leaderboard is behind login and does not publish trader wallet addresses,
so there is no public feed to copy from directly. Instead, this analyzer works on
**any** Solana wallet address — whether you pulled it from fomo manually, or from
public "smart money" sources like GMGN, Kolscan, or Birdeye — and tells you which
ones are actually worth copying.

## Install

```bash
cd copy-trading-bot
npm install
cp .env.example .env      # then add your HELIUS_API_KEY
```

Get a free Helius key at <https://dashboard.helius.dev>.

## Usage

```bash
# Try it with no API key — bundled sample wallets:
npm run analyze:demo

# Analyze real addresses:
npm run analyze -- 5vJRz...abc 7xKp2...def

# Or from a file (one address per line):
npm run analyze -- --file wallets.example.txt

# Export JSON for the bot's allowlist:
npm run analyze -- --file wallets.txt --out out/report.json
```

## Monitor (Phase C) — real-time alerts

The watcher polls the wallets in `watchlist.json` and sends a Telegram alert when
one opens a **new position** or **exits** — the copyable moments. It deliberately
**does not** alert on adds to a position the trader already holds (that's how you
end up chasing a coin already up +3,000%).

```bash
npm run watch:demo     # offline simulation — see the anti-chase in action
npm run watch:once     # one polling pass, then exit (needs HELIUS_API_KEY)
npm run watch          # poll continuously (every WATCH_POLL_SECONDS)
```

Telegram is optional — with no `TELEGRAM_BOT_TOKEN` set, alerts print to the
console, so the monitor is fully usable without any secrets.

### Anti-chase logic

| Event | Meaning | Alert? |
|---|---|---|
| **NEW_ENTRY** | trader opens a token they didn't hold | ✅ yes — copyable entry |
| **EXIT** | trader fully closes a position | ✅ yes — mirror the exit |
| **ADD** | trader buys more of a runner they hold | ⛔ suppressed (likely a late chase) |
| **REDUCE** | trader trims but still holds | ⛔ suppressed |

`watchlist.json` ships with one verified target, **@reboot**
(`H1XD…h9iq` — 62.8% win rate, $264,640 realized on fomoscan), flagged
"copy new entries only" because its book was 99.6% concentrated in one runner.

### Sample output

```
#  wallet     score         PnL(SOL)  ROI     win    trades/d  size(SOL)  hold   tokens
1  Alph…sAAA  76 🟢 strong  +5.70     126.7%  66.7%  3.0       1.50       1.2d   3
2  L0ss…dCCC  35 🟠 weak    -1.90     -63.3%  0.0%   4.0       1.50       18.9h  2
3  Sn1p…sBBB  33 🔴 avoid   +0.09     4.1%    100%   192.0     0.55       0m     2
```

## What it measures

| Metric | Meaning |
|---|---|
| **Realized PnL (SOL)** | Profit/loss from closed positions, FIFO-matched, in SOL-equivalent |
| **ROI** | Realized PnL ÷ matched cost basis |
| **Win rate** | Share of closed token positions that were profitable |
| **Trades/day** | Activity — too few = no track record, too many = not copyable |
| **Avg size (SOL)** | Typical position — used later for proportional sizing |
| **Avg hold** | Scalper vs swing; sub-minute holds are hard to mirror in time |
| **Copyability score** | 0–100 composite (see below) |

### Copyability score (0–100)

```
Profit (0–40)  ROI-driven, capped at +200% realized ROI
WinRate (0–25)
Frequency (0–20)  peaks in the ~0.5–15 trades/day sweet spot
Hold (0–15)  rewards minutes-to-days, penalizes sub-minute snipes
− Risk penalty (0–20)  when a single token drives most of the losses
```

Tiers: 🟢 ≥75 strong · 🟡 ≥55 decent · 🟠 ≥35 weak · 🔴 <35 avoid.
The weights live in `src/analyzer/metrics.ts` and are meant to be tuned.

## How it works

```
wallet ──▶ Helius (parsed SWAP txs) ──▶ normalize ──▶ FIFO PnL ──▶ metrics ──▶ ranked table/JSON
```

- `providers/helius.ts` — fetch + normalize swaps to a `Swap` (token ↔ SOL/USDC)
- `analyzer/pnl.ts` — FIFO realized-PnL per token
- `analyzer/metrics.ts` — aggregate metrics + copyability score
- `report/table.ts` — console table + JSON export
- `cli.ts` — entrypoint (`--file`, `--demo`, `--json`, `--out`)

## Limitations (honest notes)

- PnL is measured in **SOL-equivalent**; USDC is bridged at a fixed rate
  (`USDC_PER_SOL` in `config.ts`). Swap in a live price feed for USD-accurate PnL.
- Token↔token swaps and tokens acquired before the lookback window are skipped in
  cost-basis matching (conservative).
- Only `type=SWAP` transactions are analyzed (not LP, staking, transfers).

## Roadmap

- [x] **M1** Wallet Analyzer (with concentration-risk scoring)
- [x] **M2** Monitor — watcher + Telegram notifier + anti-chase filter
- [ ] **M3** Helius webhooks (push instead of poll) + `/add /remove /list` Telegram commands
- [ ] **M4** Executor in **dry-run** (Jupiter quotes, no send) + position manager
- [ ] **M5** Live execution with risk controls + kill switch
- [ ] **M6** 24/7 deploy (Docker/pm2)
