import { fetchSwaps } from '../providers/helius.js';
import { sendAlert } from '../notifier/telegram.js';
import type { Alert, Swap } from '../types.js';
import { classify, seedBook } from './classify.js';
import { loadState, saveState, walletState, rememberSignature, type WatchState } from './state.js';

export interface WatchTarget {
  wallet: string;
  label?: string;
}

/**
 * Process one wallet's latest swaps against persisted state and emit alerts for
 * genuinely new, non-suppressed events. Returns the alerts that were sent.
 *
 * First run per wallet = "bootstrap": we seed the book from history and mark
 * everything seen WITHOUT alerting, so the monitor doesn't spam old trades.
 */
export async function processWallet(
  target: WatchTarget,
  state: WatchState,
  fetcher: (w: string) => Promise<Swap[]> = fetchSwaps,
): Promise<Alert[]> {
  const ws = walletState(state, target.wallet);
  const swaps = await fetcher(target.wallet);

  if (!ws.bootstrapped) {
    ws.book = seedBook(swaps);
    for (const s of swaps) rememberSignature(ws, s.signature);
    ws.lastTs = swaps.reduce((m, s) => Math.max(m, s.timestamp), 0);
    ws.bootstrapped = true;
    return [];
  }

  const seen = new Set(ws.seenSignatures);
  const fresh = swaps
    .filter((s) => !seen.has(s.signature))
    .sort((a, b) => a.timestamp - b.timestamp);

  const sent: Alert[] = [];
  for (const s of fresh) {
    const alert = classify(s, ws.book, target.wallet, target.label);
    rememberSignature(ws, s.signature);
    ws.lastTs = Math.max(ws.lastTs, s.timestamp);
    if (alert.suppressed) continue;
    await sendAlert(alert);
    sent.push(alert);
  }
  return sent;
}

/** Run one monitoring tick across all targets, persisting state at the end. */
export async function tick(
  targets: WatchTarget[],
  fetcher?: (w: string) => Promise<Swap[]>,
): Promise<Alert[]> {
  const state = loadState();
  const all: Alert[] = [];
  for (const t of targets) {
    try {
      all.push(...(await processWallet(t, state, fetcher)));
    } catch (err) {
      console.error(`[watch] ${t.label ?? t.wallet}: ${err instanceof Error ? err.message : err}`);
    }
  }
  saveState(state);
  return all;
}
