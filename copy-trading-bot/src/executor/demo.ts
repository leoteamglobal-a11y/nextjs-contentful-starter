import { config } from '../config.js';
import type { Alert, Swap } from '../types.js';
import { SOL_MINT } from './jupiter.js';
import { processAlert, type Quoter } from './index.js';
import type { ExecState } from './state.js';
import { formatDecision } from './report.js';

// Offline stub: BUY (SOL->token) returns raw tokens; SELL (token->SOL) returns
// lamports of proceeds. Tuned so the round-trip shows a realized profit.
const stubQuoter: Quoter = async (inputMint, _outputMint, lamports) => {
  if (inputMint === SOL_MINT) return { outAmount: String(lamports * 10_000) }; // tokens for our SOL
  return { outAmount: String(Math.floor(0.16 * 1e9)) }; // sell proceeds = 0.16 SOL
};

const swap = (over: Partial<Swap>): Swap => ({
  signature: 'demo',
  timestamp: 1722900000,
  action: 'BUY',
  tokenMint: 'SDOGmint',
  tokenSymbol: 'Sleepy Dog',
  tokenAmount: 2027444,
  quoteMint: SOL_MINT,
  quoteSymbol: 'SOL',
  quoteAmount: 1.0,
  source: 'JUPITER',
  ...over,
});

const alert = (kind: Alert['kind'], over: Partial<Swap> = {}): Alert => ({
  kind,
  wallet: 'H1XD6MKNWhJDaNBgsJxNWCMEb7yTTMeqCod1jfYhh9iq',
  walletLabel: '@reboot',
  swap: swap({ action: kind === 'EXIT' ? 'SELL' : 'BUY', ...over }),
  suppressed: false,
});

async function main(): Promise<void> {
  console.log(`\n[exec demo] EXECUTION_MODE=${config.executionMode} — autonomous PAPER trading, no funds at risk.\n`);
  const state: ExecState = { day: '2026-08-06', spentTodaySol: 0, tradesToday: 0, positions: {}, realizedPnlSol: 0 };

  const steps: Array<[string, Alert]> = [
    ['@reboot opens Sleepy Dog (fresh entry)', alert('NEW_ENTRY')],
    ['@reboot opens Sleepy Dog AGAIN (already held)', alert('NEW_ENTRY')],
    ['@reboot adds to a MarsCoin runner (+3,193%)', alert('ADD', { tokenMint: 'MarsCoinMint', tokenSymbol: 'MarsCoin' })],
    ['@reboot exits Sleepy Dog', alert('EXIT')],
  ];

  for (const [label, a] of steps) {
    const d = await processAlert(a, state, stubQuoter);
    console.log(`• ${label}\n  ${formatDecision(d)}\n`);
  }

  console.log(`Paper realized PnL: ${state.realizedPnlSol >= 0 ? '+' : ''}${state.realizedPnlSol.toFixed(3)} SOL`);
  console.log(`Open paper positions: ${Object.keys(state.positions).length}`);
  console.log('\nFlip EXECUTION_MODE=live (with a funded wallet) only once this looks right.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
