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

## Executor (Phase A) — autonomous trading

The executor lets the bot **act on its own** when a copyable entry appears. It is
governed by `EXECUTION_MODE`:

| Mode | What happens |
|---|---|
| `off` | Monitor only — never trades. |
| `dry` *(default)* | **Autonomous paper trading** — decides + "fills" with fake money, tracks realized PnL. Zero risk. |
| `live` | Real swaps via Jupiter with a funded wallet. |

```bash
npm run exec:demo      # offline: watch it buy an entry, skip a chase, close for +PnL
npm run stop           # KILL SWITCH — halt all trading now (creates out/STOP)
npm run resume         # clear the kill switch
```

**Every trade passes the same guardrails** (in dry *and* live), enforced in
`executor/risk.ts`:

- Opens **only on NEW entries** — never adds/chases a runner (the MarsCoin guard).
- `MAX_TRADE_SOL` per trade, `DAILY_CAP_SOL` + `MAX_TRADES_PER_DAY` per day.
- `MAX_SLIPPAGE_BPS` slippage ceiling on the swap.
- Never double-opens a token it already holds.
- **Kill switch**: `out/STOP` halts everything instantly.
- Mirrors the trader's **exit** to close and realize PnL.

### Going live (only when you're ready)

1. Run in `dry` for a while. Watch the paper PnL. Read every decision.
2. Fund a **dedicated** wallet with a small amount you can afford to lose
   (never your main wallet).
3. In `.env`: set `EXECUTION_MODE=live`, `WALLET_PRIVATE_KEY` (base58), `RPC_URL`.
4. Start with tiny `FIXED_SIZE_SOL` and a low `DAILY_CAP_SOL`.
5. Keep `npm run stop` one command away.

> ⚠️ Live mode trades real money automatically. Bugs, slippage, and rug-pulls can
> cause loss. This is not financial advice. You are responsible for the wallet
> you point it at.

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
- [x] **M4** Autonomous executor — paper (dry) + live Jupiter swaps, risk gate, kill switch
- [ ] **M3** Helius webhooks (push instead of poll) + `/add /remove /list` Telegram commands
- [ ] **M5** Live hardening — min-liquidity/honeypot checks, retries, alert-on-fill
- [ ] **M6** 24/7 deploy (Docker/pm2)
