import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config.js';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1e9;

export interface Quote {
  outAmount: string;
  priceImpactPct: string;
  raw: unknown; // full quoteResponse, needed to build the swap
}

/** Ask Jupiter for the best route. Works in any mode (read-only). */
export async function getQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number,
): Promise<Quote> {
  const url = new URL('https://quote-api.jup.ag/v6/quote');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', String(Math.floor(amountLamports)));
  url.searchParams.set('slippageBps', String(slippageBps));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${await res.text()}`);
  const q = (await res.json()) as { outAmount: string; priceImpactPct: string };
  return { outAmount: q.outAmount, priceImpactPct: q.priceImpactPct, raw: q };
}

/**
 * Execute a real swap: quote → build → sign → send → confirm. LIVE ONLY.
 * Requires WALLET_PRIVATE_KEY (base58) and RPC_URL. Returns the tx signature.
 */
export async function executeSwap(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number,
): Promise<{ signature: string; outAmount: string }> {
  if (!config.walletPrivateKey) throw new Error('WALLET_PRIVATE_KEY not set (required for live)');
  if (!config.rpcUrl) throw new Error('RPC_URL not set (required for live)');

  const keypair = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
  const connection = new Connection(config.rpcUrl, 'confirmed');

  const quote = await getQuote(inputMint, outputMint, amountLamports, slippageBps);

  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap ${swapRes.status}: ${await swapRes.text()}`);
  const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(signature, 'confirmed');

  return { signature, outAmount: quote.outAmount };
}

export const solToLamports = (sol: number) => Math.floor(sol * LAMPORTS_PER_SOL);
