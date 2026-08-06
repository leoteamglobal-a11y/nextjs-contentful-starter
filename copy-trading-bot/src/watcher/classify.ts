import { config } from '../config.js';
import type { Alert, AlertKind, Swap } from '../types.js';

/**
 * Per-wallet running book: net token amount currently held, keyed by mint.
 * We only need signs/amounts to tell a fresh entry from an add or an exit.
 */
export type Book = Record<string, number>;

const EPS = 1e-9;

/**
 * Classify one swap against the trader's current book and decide whether it is
 * alert-worthy. This is the anti-chase heart of Phase C:
 *
 *   NEW_ENTRY — trader opens a token they didn't hold  → ALERT (copyable)
 *   ADD       — trader buys more of a runner they hold → suppressed by default
 *   EXIT      — trader fully closes a position         → ALERT (mirror the exit)
 *   REDUCE    — trader trims but still holds           → suppressed by default
 *
 * Suppressing ADDs is exactly what stops you from copying a MarsCoin already up
 * +3,193%: by the time it has pumped, any further buy is an ADD, not an entry.
 */
export function classify(swap: Swap, book: Book, wallet: string, walletLabel?: string): Alert {
  const held = book[swap.tokenMint] ?? 0;
  let kind: AlertKind;

  if (swap.action === 'BUY') {
    kind = held > EPS ? 'ADD' : 'NEW_ENTRY';
    book[swap.tokenMint] = held + swap.tokenAmount;
  } else {
    const after = held - swap.tokenAmount;
    kind = after <= EPS ? 'EXIT' : 'REDUCE';
    book[swap.tokenMint] = Math.max(0, after);
  }

  const suppressed =
    (kind === 'ADD' && !config.alertOnAdds) ||
    (kind === 'REDUCE') ||
    (kind === 'EXIT' && !config.alertOnExits);

  const reason =
    kind === 'ADD'
      ? 'add to an existing position (possible late/chase entry)'
      : kind === 'REDUCE'
        ? 'partial trim'
        : undefined;

  return { kind, wallet, walletLabel, swap, suppressed, reason };
}

/**
 * Seed a book from a wallet's full history WITHOUT emitting alerts — used on the
 * first run so we don't fire a burst of historical events. Returns the book.
 */
export function seedBook(swaps: Swap[]): Book {
  const book: Book = {};
  for (const s of [...swaps].sort((a, b) => a.timestamp - b.timestamp)) {
    const held = book[s.tokenMint] ?? 0;
    book[s.tokenMint] = s.action === 'BUY' ? held + s.tokenAmount : Math.max(0, held - s.tokenAmount);
  }
  return book;
}
