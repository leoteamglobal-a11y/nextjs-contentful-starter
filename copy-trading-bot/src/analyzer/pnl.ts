import { USDC_PER_SOL } from '../config.js';
import type { Swap, TokenPnL } from '../types.js';

/** Convert any quote amount to SOL-equivalent so tokens compare on one axis. */
function toSol(swap: Swap): number {
  if (swap.quoteSymbol === 'USDC') return swap.quoteAmount / USDC_PER_SOL;
  return swap.quoteAmount; // already SOL
}

interface Lot {
  tokenAmount: number; // remaining token in this buy lot
  costSol: number; // remaining SOL cost attributed to that token
  timestamp: number;
}

/**
 * FIFO realized-PnL for a single token.
 *
 * Each BUY opens a lot (token received, SOL spent). Each SELL consumes the
 * oldest lots first, realizing profit = proceeds − matched cost. Tokens still
 * held after all sells are "open" (unrealized) and excluded from win/loss.
 */
export function computeTokenPnL(tokenMint: string, swaps: Swap[]): TokenPnL {
  const ordered = [...swaps].sort((a, b) => a.timestamp - b.timestamp);
  const lots: Lot[] = [];
  let realizedPnlSol = 0;
  let matchedCostSol = 0;
  let buys = 0;
  let sells = 0;
  let holdSum = 0;
  let holdCount = 0;
  let symbol: string | undefined;

  for (const s of ordered) {
    symbol = s.tokenSymbol ?? symbol;
    const sol = toSol(s);

    if (s.action === 'BUY') {
      buys++;
      lots.push({ tokenAmount: s.tokenAmount, costSol: sol, timestamp: s.timestamp });
      continue;
    }

    // SELL — consume lots FIFO.
    sells++;
    let remaining = s.tokenAmount;
    const proceedsPerToken = s.tokenAmount > 0 ? sol / s.tokenAmount : 0;

    while (remaining > 1e-12 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(remaining, lot.tokenAmount);
      const costPerToken = lot.tokenAmount > 0 ? lot.costSol / lot.tokenAmount : 0;

      const proceeds = take * proceedsPerToken;
      const cost = take * costPerToken;
      realizedPnlSol += proceeds - cost;
      matchedCostSol += cost;

      holdSum += s.timestamp - lot.timestamp;
      holdCount++;

      lot.tokenAmount -= take;
      lot.costSol -= cost;
      remaining -= take;
      if (lot.tokenAmount <= 1e-12) lots.shift();
    }
    // If `remaining` > 0 here, wallet sold token it acquired outside our window
    // (airdrop / pre-window buy). We conservatively ignore that untracked cost.
  }

  const openTokenAmount = lots.reduce((sum, l) => sum + l.tokenAmount, 0);

  return {
    tokenMint,
    tokenSymbol: symbol,
    buys,
    sells,
    realizedPnlSol,
    costBasisSol: matchedCostSol,
    roi: matchedCostSol > 0 ? realizedPnlSol / matchedCostSol : 0,
    openTokenAmount,
    avgHoldSeconds: holdCount > 0 ? holdSum / holdCount : 0,
    isWin: realizedPnlSol > 0,
  };
}

/** Group swaps by token and compute per-token PnL. */
export function computeAllTokenPnL(swaps: Swap[]): TokenPnL[] {
  const byToken = new Map<string, Swap[]>();
  for (const s of swaps) {
    const arr = byToken.get(s.tokenMint) ?? [];
    arr.push(s);
    byToken.set(s.tokenMint, arr);
  }
  return [...byToken.entries()].map(([mint, group]) => computeTokenPnL(mint, group));
}
