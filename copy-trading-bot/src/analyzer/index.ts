import type { Swap, WalletReport } from '../types.js';
import { fetchSwaps } from '../providers/helius.js';
import { analyzeSwaps } from './metrics.js';

export { analyzeSwaps } from './metrics.js';
export { computeTokenPnL, computeAllTokenPnL } from './pnl.js';

/** Fetch a wallet's swaps from Helius and produce its report. */
export async function analyzeWallet(wallet: string): Promise<WalletReport> {
  const swaps = await fetchSwaps(wallet);
  return analyzeSwaps(wallet, swaps);
}

/** Analyze many wallets, ranked best-first by copyability score. */
export async function analyzeWallets(wallets: string[]): Promise<WalletReport[]> {
  const reports: WalletReport[] = [];
  for (const w of wallets) {
    try {
      reports.push(await analyzeWallet(w));
    } catch (err) {
      reports.push(errorReport(w, err));
    }
  }
  return rank(reports);
}

/** Analyze from already-fetched swaps (used by --demo and by tests). */
export function analyzeFromSwaps(byWallet: Record<string, Swap[]>): WalletReport[] {
  return rank(Object.entries(byWallet).map(([w, swaps]) => analyzeSwaps(w, swaps)));
}

function rank(reports: WalletReport[]): WalletReport[] {
  return reports.sort((a, b) => b.copyabilityScore - a.copyabilityScore);
}

function errorReport(wallet: string, err: unknown): WalletReport {
  return {
    wallet,
    analyzedSwaps: 0,
    windowDays: 0,
    realizedPnlSol: 0,
    totalCostBasisSol: 0,
    roi: 0,
    winRate: 0,
    closedPositions: 0,
    tradesPerDay: 0,
    avgTradeSizeSol: 0,
    avgHoldSeconds: 0,
    distinctTokens: 0,
    worstTokenPnlSol: 0,
    bestTokenPnlSol: 0,
    concentration: 0,
    copyabilityScore: 0,
    perToken: [],
    notes: [`ERROR: ${err instanceof Error ? err.message : String(err)}`],
  };
}
