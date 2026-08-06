// Shared domain types for the wallet analyzer.

/**
 * A single normalized swap performed by a wallet.
 *
 * We express every swap relative to a "quote" asset (SOL or USDC) so PnL is
 * comparable across tokens. A BUY spends `quoteAmount` of the quote asset to
 * receive `tokenAmount` of `tokenMint`. A SELL does the reverse.
 */
export interface Swap {
  signature: string;
  timestamp: number; // unix seconds
  action: 'BUY' | 'SELL';
  tokenMint: string;
  tokenSymbol?: string;
  tokenAmount: number; // amount of the traded token
  quoteMint: string; // SOL or USDC mint
  quoteSymbol: 'SOL' | 'USDC' | string;
  quoteAmount: number; // amount of quote asset moved (always positive)
  source?: string; // DEX / program that routed the swap
}

/** Realized-PnL result for one token the wallet traded. */
export interface TokenPnL {
  tokenMint: string;
  tokenSymbol?: string;
  buys: number;
  sells: number;
  realizedPnlSol: number; // profit/loss in SOL-equivalent quote terms
  costBasisSol: number; // total quote spent that has been matched to sells
  roi: number; // realizedPnlSol / costBasisSol
  openTokenAmount: number; // still-held token (unrealized, ignored in win rate)
  avgHoldSeconds: number; // avg time between matched buy and sell
  isWin: boolean; // realizedPnlSol > 0
}

/** How a freshly-detected swap relates to the trader's existing book. */
export type AlertKind = 'NEW_ENTRY' | 'ADD' | 'REDUCE' | 'EXIT';

/** A classified, alert-worthy event from a watched wallet. */
export interface Alert {
  kind: AlertKind;
  wallet: string;
  walletLabel?: string;
  swap: Swap;
  /** Anti-chase: true when we suppress this alert (e.g. an ADD to a runner). */
  suppressed: boolean;
  reason?: string;
}

/** Full profitability + copyability profile for one wallet. */
export interface WalletReport {
  wallet: string;
  analyzedSwaps: number;
  windowDays: number;

  // profitability
  realizedPnlSol: number;
  totalCostBasisSol: number;
  roi: number; // overall realized ROI
  winRate: number; // fraction of closed token positions that were profitable
  closedPositions: number;

  // behavior — drives whether a wallet is *copyable* in real time
  tradesPerDay: number;
  avgTradeSizeSol: number;
  avgHoldSeconds: number;
  distinctTokens: number;

  // risk
  worstTokenPnlSol: number; // largest single-token loss
  bestTokenPnlSol: number;
  concentration: number; // 0–1 Herfindahl index of cost basis across tokens (1 = all-in one token)

  // composite 0–100 score (higher = better copy candidate)
  copyabilityScore: number;

  perToken: TokenPnL[];
  notes: string[];
}
