import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Book } from './classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'out');
const STATE_PATH = join(OUT_DIR, 'watch-state.json');

export interface WalletState {
  book: Book;
  seenSignatures: string[];
  bootstrapped: boolean;
  lastTs: number;
}

export interface WatchState {
  wallets: Record<string, WalletState>;
}

export function loadState(): WatchState {
  if (!existsSync(STATE_PATH)) return { wallets: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as WatchState;
  } catch {
    return { wallets: {} };
  }
}

export function saveState(state: WatchState): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function walletState(state: WatchState, wallet: string): WalletState {
  if (!state.wallets[wallet]) {
    state.wallets[wallet] = { book: {}, seenSignatures: [], bootstrapped: false, lastTs: 0 };
  }
  return state.wallets[wallet];
}

/** Keep the seen-signature list bounded so state.json doesn't grow forever. */
export function rememberSignature(ws: WalletState, sig: string, cap = 2000): void {
  ws.seenSignatures.push(sig);
  if (ws.seenSignatures.length > cap) ws.seenSignatures.splice(0, ws.seenSignatures.length - cap);
}
