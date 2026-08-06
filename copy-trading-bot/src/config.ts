import { z } from 'zod';

// Load .env if present (no dependency on dotenv — parse manually to stay light).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const schema = z.object({
  HELIUS_API_KEY: z.string().optional().default(''),
  ANALYZE_TX_LIMIT: z.coerce.number().int().positive().default(500),
  ANALYZE_LOOKBACK_DAYS: z.coerce.number().int().min(0).default(30),
  ANALYZE_MIN_TRADE_SOL: z.coerce.number().min(0).default(0.05),
});

const parsed = schema.parse(process.env);

export const config = {
  heliusApiKey: parsed.HELIUS_API_KEY,
  txLimit: parsed.ANALYZE_TX_LIMIT,
  lookbackDays: parsed.ANALYZE_LOOKBACK_DAYS,
  minTradeSol: parsed.ANALYZE_MIN_TRADE_SOL,
};

// Well-known mints used to identify the "quote" side of a swap.
export const QUOTE_MINTS: Record<string, 'SOL' | 'USDC'> = {
  So11111111111111111111111111111111111111112: 'SOL', // wrapped SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
};

// Rough SOL<->USDC bridge so mixed-quote wallets still compare. Override with a
// live price feed later; for ranking, relative values matter more than absolute.
export const USDC_PER_SOL = 150;
