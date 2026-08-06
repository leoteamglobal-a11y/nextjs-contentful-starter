import { config, USDC_PER_SOL } from '../config.js';
import type { Swap, TokenPnL, WalletReport } from '../types.js';
import { computeAllTokenPnL } from './pnl.js';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Copyability score (0–100). A wallet is a good copy target when it is
 * profitable AND its behavior is realistically mirrorable in real time.
 *
 *   Profit (0–40) · WinRate (0–25) · Frequency (0–20) · Hold (0–15)
 *   minus a concentration/risk penalty (0–20).
 */
function copyabilityScore(r: Omit<WalletReport, 'copyabilityScore' | 'notes'>, notes: string[]): number {
  // Profit — ROI mapped so +200% realized ROI maxes the band.
  const profit = r.roi <= 0 ? 0 : clamp((r.roi / 2) * 40, 0, 40);
  if (r.roi <= 0) notes.push('Realized ROI is not positive over the window.');

  // Win rate.
  const win = clamp(r.winRate * 25, 0, 25);

  // Frequency — reward the copyable sweet spot (~0.5–15 trades/day).
  let freq: number;
  const t = r.tradesPerDay;
  if (t < 0.2) {
    freq = 4;
    notes.push('Very low trade frequency — hard to build a track record.');
  } else if (t <= 15) {
    freq = 20;
  } else if (t <= 40) {
    freq = 12;
    notes.push('High frequency — you will need low-latency execution to keep up.');
  } else {
    freq = 4;
    notes.push('Extreme frequency (likely a bot/sniper) — realistically not copyable.');
  }

  // Hold time — penalize sub-minute snipes; reward minutes-to-days holds.
  const h = r.avgHoldSeconds;
  let hold: number;
  if (h < 60) {
    hold = 3;
    notes.push('Sub-minute average hold — sniper behavior, copies will arrive late.');
  } else if (h <= 3 * 86400) {
    hold = 15;
  } else {
    hold = 9;
  }

  // Risk — penalize when one token dominates the losses (fragile edge).
  let penalty = 0;
  if (r.realizedPnlSol > 0 && r.worstTokenPnlSol < 0) {
    const ratio = Math.abs(r.worstTokenPnlSol) / (r.realizedPnlSol + Math.abs(r.worstTokenPnlSol));
    penalty += clamp(ratio * 12, 0, 12);
    if (ratio > 0.5) notes.push('A single token drives most of the losses — concentrated risk.');
  }

  // Concentration — the @reboot blind spot: a wallet with ~all its capital in one
  // token (even a winning one) is fragile, and its visible book is uncopyable
  // (you'd be chasing a runner). Herfindahl 1.0 = fully all-in.
  if (r.concentration >= 0.5) {
    penalty += clamp((r.concentration - 0.5) * 2 * 15, 0, 15);
    notes.push(
      `High concentration (${Math.round(r.concentration * 100)}% Herfindahl) — capital is not diversified; copy new entries only, never the current book.`,
    );
  }

  return Math.round(clamp(profit + win + freq + hold - penalty, 0, 100));
}

/** Build the full profitability + copyability report for one wallet. */
export function analyzeSwaps(wallet: string, rawSwaps: Swap[]): WalletReport {
  const notes: string[] = [];

  // Filter dust trades below the configured minimum quote size.
  const solValue = (s: Swap) => (s.quoteSymbol === 'USDC' ? s.quoteAmount / USDC_PER_SOL : s.quoteAmount);
  const swaps = rawSwaps.filter((s) => solValue(s) >= config.minTradeSol);

  const perToken: TokenPnL[] = computeAllTokenPnL(swaps);
  const closed = perToken.filter((t) => t.sells > 0 && t.costBasisSol > 0);

  const realizedPnlSol = perToken.reduce((s, t) => s + t.realizedPnlSol, 0);
  const totalCostBasisSol = perToken.reduce((s, t) => s + t.costBasisSol, 0);
  const wins = closed.filter((t) => t.isWin).length;

  const timestamps = swaps.map((s) => s.timestamp);
  const spanDays =
    timestamps.length > 1
      ? Math.max(1 / 24, (Math.max(...timestamps) - Math.min(...timestamps)) / 86400)
      : 1;

  const buySizes = swaps.filter((s) => s.action === 'BUY').map(solValue);
  const avgTradeSizeSol = buySizes.length ? buySizes.reduce((a, b) => a + b, 0) / buySizes.length : 0;

  const holdVals = closed.map((t) => t.avgHoldSeconds).filter((h) => h > 0);
  const avgHoldSeconds = holdVals.length ? holdVals.reduce((a, b) => a + b, 0) / holdVals.length : 0;

  const pnls = perToken.map((t) => t.realizedPnlSol);
  const worstTokenPnlSol = pnls.length ? Math.min(...pnls) : 0;
  const bestTokenPnlSol = pnls.length ? Math.max(...pnls) : 0;

  // Concentration = Herfindahl index of buy capital across tokens (0..1).
  const buyByToken = new Map<string, number>();
  for (const s of swaps) {
    if (s.action !== 'BUY') continue;
    buyByToken.set(s.tokenMint, (buyByToken.get(s.tokenMint) ?? 0) + solValue(s));
  }
  const totalBuy = [...buyByToken.values()].reduce((a, b) => a + b, 0);
  const concentration = totalBuy > 0 ? [...buyByToken.values()].reduce((h, v) => h + (v / totalBuy) ** 2, 0) : 0;

  const base = {
    wallet,
    analyzedSwaps: swaps.length,
    windowDays: config.lookbackDays || Math.round(spanDays),
    realizedPnlSol,
    totalCostBasisSol,
    roi: totalCostBasisSol > 0 ? realizedPnlSol / totalCostBasisSol : 0,
    winRate: closed.length ? wins / closed.length : 0,
    closedPositions: closed.length,
    tradesPerDay: swaps.length / spanDays,
    avgTradeSizeSol,
    avgHoldSeconds,
    distinctTokens: perToken.length,
    worstTokenPnlSol,
    bestTokenPnlSol,
    concentration,
    perToken: perToken.sort((a, b) => b.realizedPnlSol - a.realizedPnlSol),
  };

  if (swaps.length === 0) notes.push('No qualifying swaps found in the window.');

  const score = copyabilityScore(base, notes);

  return { ...base, copyabilityScore: score, notes };
}
