import { config } from '../config.js';
import type { Alert, ExecDecision } from '../types.js';
import { assessEntry } from './risk.js';
import { getQuote, executeSwap, SOL_MINT, solToLamports } from './jupiter.js';
import {
  loadExecState,
  saveExecState,
  killSwitchEngaged,
  type ExecState,
} from './state.js';

/** Injectable so the demo/tests run fully offline. */
export type Quoter = (
  inputMint: string,
  outputMint: string,
  lamports: number,
  slippageBps: number,
) => Promise<{ outAmount: string }>;

interface Opts {
  quoter?: Quoter;
  now?: Date;
}

const LAMPORTS_PER_SOL = 1e9;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Open a copy of a fresh entry (paper in dry mode, real swap in live mode). */
async function processEntry(alert: Alert, state: ExecState, quoter: Quoter): Promise<ExecDecision> {
  const { swap } = alert;
  const base: ExecDecision = {
    action: 'SKIP',
    mode: config.executionMode,
    tokenMint: swap.tokenMint,
    tokenSymbol: swap.tokenSymbol,
    sizeSol: 0,
    ok: false,
    reasons: [],
  };

  const gate = assessEntry(alert, state);
  if (!gate.ok) return { ...base, reasons: gate.reasons };

  const lamports = solToLamports(gate.sizeSol);
  let tokenAmount = 0;
  let tx: string | undefined;

  try {
    if (config.executionMode === 'live') {
      const r = await executeSwap(SOL_MINT, swap.tokenMint, lamports, config.maxSlippageBps);
      tokenAmount = Number(r.outAmount);
      tx = r.signature;
    } else {
      const q = await quoter(SOL_MINT, swap.tokenMint, lamports, config.maxSlippageBps);
      tokenAmount = Number(q.outAmount);
    }
  } catch (err) {
    return { ...base, reasons: [`quote/swap failed: ${err instanceof Error ? err.message : err}`] };
  }

  state.positions[swap.tokenMint] = {
    tokenMint: swap.tokenMint,
    tokenSymbol: swap.tokenSymbol,
    sizeSol: gate.sizeSol,
    tokenAmount,
    openedAt: swap.timestamp,
    openTx: tx,
  };
  state.spentTodaySol += gate.sizeSol;
  state.tradesToday += 1;

  return {
    action: 'BUY',
    mode: config.executionMode,
    tokenMint: swap.tokenMint,
    tokenSymbol: swap.tokenSymbol,
    sizeSol: gate.sizeSol,
    ok: true,
    reasons: [config.executionMode === 'dry' ? 'PAPER fill' : 'LIVE swap', ...gate.reasons],
    tx,
  };
}

/** Mirror the trader's exit: close our position and realize PnL. */
async function processExit(alert: Alert, state: ExecState, quoter: Quoter): Promise<ExecDecision> {
  const { swap } = alert;
  const pos = state.positions[swap.tokenMint];
  const base: ExecDecision = {
    action: 'SKIP',
    mode: config.executionMode,
    tokenMint: swap.tokenMint,
    tokenSymbol: swap.tokenSymbol,
    sizeSol: 0,
    ok: false,
    reasons: [],
  };

  if (config.executionMode === 'off') return { ...base, reasons: ['EXECUTION_MODE=off'] };
  if (!pos) return { ...base, reasons: ['no open position for this token'] };
  if (config.executionMode === 'live' && killSwitchEngaged()) {
    return { ...base, reasons: ['kill switch engaged — close manually'] };
  }

  let proceedsSol = 0;
  let tx: string | undefined;
  try {
    if (config.executionMode === 'live') {
      const r = await executeSwap(swap.tokenMint, SOL_MINT, pos.tokenAmount, config.maxSlippageBps);
      proceedsSol = Number(r.outAmount) / LAMPORTS_PER_SOL;
      tx = r.signature;
    } else {
      const q = await quoter(swap.tokenMint, SOL_MINT, pos.tokenAmount, config.maxSlippageBps);
      proceedsSol = Number(q.outAmount) / LAMPORTS_PER_SOL;
    }
  } catch (err) {
    return { ...base, reasons: [`exit quote/swap failed: ${err instanceof Error ? err.message : err}`] };
  }

  const realizedPnlSol = proceedsSol - pos.sizeSol;
  state.realizedPnlSol += realizedPnlSol;
  delete state.positions[swap.tokenMint];

  return {
    action: 'SELL',
    mode: config.executionMode,
    tokenMint: swap.tokenMint,
    tokenSymbol: swap.tokenSymbol,
    sizeSol: pos.sizeSol,
    ok: true,
    reasons: [config.executionMode === 'dry' ? 'PAPER close' : 'LIVE close'],
    tx,
    realizedPnlSol,
  };
}

/** Run one alert through the executor against an in-memory state (mutates it). */
export async function processAlert(alert: Alert, state: ExecState, quoter: Quoter = getQuote): Promise<ExecDecision> {
  if (alert.kind === 'NEW_ENTRY') return processEntry(alert, state, quoter);
  if (alert.kind === 'EXIT') return processExit(alert, state, quoter);
  return {
    action: 'SKIP',
    mode: config.executionMode,
    tokenMint: alert.swap.tokenMint,
    tokenSymbol: alert.swap.tokenSymbol,
    sizeSol: 0,
    ok: false,
    reasons: [`no executor action for ${alert.kind}`],
  };
}

/** Persisted wrapper: load state, act on the alert, save. */
export async function handleAlert(alert: Alert, opts: Opts = {}): Promise<ExecDecision> {
  const today = isoDay(opts.now ?? new Date());
  const state = loadExecState(today);
  const decision = await processAlert(alert, state, opts.quoter ?? getQuote);
  saveExecState(state);
  return decision;
}
