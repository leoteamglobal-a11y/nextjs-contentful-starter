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

  // Monitor (Phase C)
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  WATCH_POLL_SECONDS: z.coerce.number().int().positive().default(60),
  // Anti-chase: when false (default) we do NOT alert on adds to a position the
  // trader already holds — that's how the "buy MarsCoin at +3,193%" trap slips in.
  ALERT_ON_ADDS: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  ALERT_ON_EXITS: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),

  // === Executor (Phase A) ===
  // off  = never trade (monitor only)
  // dry  = autonomous PAPER trading (decides + "fills" with fake money) [DEFAULT]
  // live = real swaps with real funds (requires WALLET_PRIVATE_KEY + RPC_URL)
  EXECUTION_MODE: z.enum(['off', 'dry', 'live']).optional().default('dry'),
  WALLET_PRIVATE_KEY: z.string().optional().default(''), // base58, LIVE only
  RPC_URL: z.string().optional().default(''), // your Solana RPC, LIVE only

  // Sizing
  SIZING_MODE: z.enum(['fixed', 'proportional']).optional().default('fixed'),
  FIXED_SIZE_SOL: z.coerce.number().positive().default(0.1),
  BANKROLL_SOL: z.coerce.number().positive().default(1), // your total, for proportional + caps
  PROPORTIONAL_PCT: z.coerce.number().min(0).max(1).default(0.02), // 2% of bankroll per trade

  // Hard risk limits — the guardrails
  MAX_TRADE_SOL: z.coerce.number().positive().default(0.25),
  DAILY_CAP_SOL: z.coerce.number().positive().default(1),
  MAX_SLIPPAGE_BPS: z.coerce.number().int().positive().default(100), // 100 = 1%
  MAX_TRADES_PER_DAY: z.coerce.number().int().positive().default(20),
});

const parsed = schema.parse(process.env);

export const config = {
  heliusApiKey: parsed.HELIUS_API_KEY,
  txLimit: parsed.ANALYZE_TX_LIMIT,
  lookbackDays: parsed.ANALYZE_LOOKBACK_DAYS,
  minTradeSol: parsed.ANALYZE_MIN_TRADE_SOL,

  telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
  telegramChatId: parsed.TELEGRAM_CHAT_ID,
  watchPollSeconds: parsed.WATCH_POLL_SECONDS,
  alertOnAdds: parsed.ALERT_ON_ADDS,
  alertOnExits: parsed.ALERT_ON_EXITS,

  executionMode: parsed.EXECUTION_MODE,
  walletPrivateKey: parsed.WALLET_PRIVATE_KEY,
  rpcUrl: parsed.RPC_URL,
  sizingMode: parsed.SIZING_MODE,
  fixedSizeSol: parsed.FIXED_SIZE_SOL,
  bankrollSol: parsed.BANKROLL_SOL,
  proportionalPct: parsed.PROPORTIONAL_PCT,
  maxTradeSol: parsed.MAX_TRADE_SOL,
  dailyCapSol: parsed.DAILY_CAP_SOL,
  maxSlippageBps: parsed.MAX_SLIPPAGE_BPS,
  maxTradesPerDay: parsed.MAX_TRADES_PER_DAY,
};

// Well-known mints used to identify the "quote" side of a swap.
export const QUOTE_MINTS: Record<string, 'SOL' | 'USDC'> = {
  So11111111111111111111111111111111111111112: 'SOL', // wrapped SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
};

// Rough SOL<->USDC bridge so mixed-quote wallets still compare. Override with a
// live price feed later; for ranking, relative values matter more than absolute.
export const USDC_PER_SOL = 150;
