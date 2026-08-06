import { config, QUOTE_MINTS } from '../config.js';
import type { Swap } from '../types.js';

const LAMPORTS_PER_SOL = 1e9;

interface HeliusTokenAmount {
  userAccount?: string;
  mint: string;
  rawTokenAmount?: { tokenAmount: string; decimals: number };
  tokenAmount?: number;
}

interface HeliusSwapEvent {
  nativeInput?: { account: string; amount: string | number } | null;
  nativeOutput?: { account: string; amount: string | number } | null;
  tokenInputs?: HeliusTokenAmount[];
  tokenOutputs?: HeliusTokenAmount[];
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  source?: string;
  events?: { swap?: HeliusSwapEvent };
}

function tokenUiAmount(t: HeliusTokenAmount): number {
  if (typeof t.tokenAmount === 'number') return t.tokenAmount;
  if (t.rawTokenAmount) {
    const { tokenAmount, decimals } = t.rawTokenAmount;
    return Number(tokenAmount) / 10 ** decimals;
  }
  return 0;
}

/**
 * Turn one Helius parsed SWAP tx into a normalized Swap from `wallet`'s point of
 * view. Returns null if it isn't a clean token<->quote swap for this wallet.
 */
export function normalizeSwap(tx: HeliusTx, wallet: string): Swap | null {
  const s = tx.events?.swap;
  if (!s) return null;

  // Assets the wallet GAVE (inputs) and GOT (outputs).
  type Leg = { mint: string; amount: number; isQuote: boolean; quoteSym?: 'SOL' | 'USDC' };
  const gave: Leg[] = [];
  const got: Leg[] = [];

  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  if (s.nativeInput && Number(s.nativeInput.amount) > 0) {
    gave.push({ mint: SOL_MINT, amount: Number(s.nativeInput.amount) / LAMPORTS_PER_SOL, isQuote: true, quoteSym: 'SOL' });
  }
  if (s.nativeOutput && Number(s.nativeOutput.amount) > 0) {
    got.push({ mint: SOL_MINT, amount: Number(s.nativeOutput.amount) / LAMPORTS_PER_SOL, isQuote: true, quoteSym: 'SOL' });
  }
  for (const t of s.tokenInputs ?? []) {
    if (t.userAccount && t.userAccount !== wallet) continue;
    const q = QUOTE_MINTS[t.mint];
    gave.push({ mint: t.mint, amount: tokenUiAmount(t), isQuote: !!q, quoteSym: q });
  }
  for (const t of s.tokenOutputs ?? []) {
    if (t.userAccount && t.userAccount !== wallet) continue;
    const q = QUOTE_MINTS[t.mint];
    got.push({ mint: t.mint, amount: tokenUiAmount(t), isQuote: !!q, quoteSym: q });
  }

  const quoteGave = gave.find((l) => l.isQuote);
  const quoteGot = got.find((l) => l.isQuote);
  const tokenGave = gave.find((l) => !l.isQuote);
  const tokenGot = got.find((l) => !l.isQuote);

  // BUY: gave quote, got token. SELL: gave token, got quote.
  if (quoteGave && tokenGot && tokenGot.amount > 0) {
    return buildSwap('BUY', tx, tokenGot.mint, tokenGot.amount, quoteGave);
  }
  if (quoteGot && tokenGave && tokenGave.amount > 0) {
    return buildSwap('SELL', tx, tokenGave.mint, tokenGave.amount, quoteGot);
  }
  return null; // token<->token or malformed; skip
}

function buildSwap(
  action: 'BUY' | 'SELL',
  tx: HeliusTx,
  tokenMint: string,
  tokenAmount: number,
  quote: { mint: string; amount: number; quoteSym?: 'SOL' | 'USDC' },
): Swap {
  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    action,
    tokenMint,
    tokenAmount,
    quoteMint: quote.mint,
    quoteSymbol: quote.quoteSym ?? 'SOL',
    quoteAmount: quote.amount,
    source: tx.source,
  };
}

/** Fetch and normalize a wallet's recent swaps from the Helius API. */
export async function fetchSwaps(wallet: string): Promise<Swap[]> {
  if (!config.heliusApiKey) {
    throw new Error(
      'HELIUS_API_KEY is not set. Add it to .env, or run with --demo to use bundled sample data.',
    );
  }

  const swaps: Swap[] = [];
  const cutoff = config.lookbackDays > 0 ? Date.now() / 1000 - config.lookbackDays * 86400 : 0;
  let before: string | undefined;

  while (swaps.length < config.txLimit) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`);
    url.searchParams.set('api-key', config.heliusApiKey);
    url.searchParams.set('type', 'SWAP');
    url.searchParams.set('limit', '100');
    if (before) url.searchParams.set('before', before);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Helius API ${res.status}: ${await res.text()}`);
    }
    const page = (await res.json()) as HeliusTx[];
    if (!page.length) break;

    let reachedCutoff = false;
    for (const tx of page) {
      if (cutoff && tx.timestamp < cutoff) {
        reachedCutoff = true;
        break;
      }
      const swap = normalizeSwap(tx, wallet);
      if (swap) swaps.push(swap);
    }

    if (reachedCutoff) break;
    before = page[page.length - 1].signature;
    if (page.length < 100) break;
  }

  return swaps;
}
