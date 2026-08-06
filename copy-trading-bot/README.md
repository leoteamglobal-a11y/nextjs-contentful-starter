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

- [x] **M1** Wallet Analyzer (this module)
- [ ] **M2** Telegram notifier — alert on new swaps from top-scored wallets
- [ ] **M3** Multi-wallet watcher (Helius webhooks) + `/add /remove /list`
- [ ] **M4** Executor in **dry-run** (Jupiter quotes, no send) + position manager
- [ ] **M5** Live execution with risk controls + kill switch
- [ ] **M6** 24/7 deploy (Docker/pm2)
