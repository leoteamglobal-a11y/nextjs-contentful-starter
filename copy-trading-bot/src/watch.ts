import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { tick, processWallet, type WatchTarget } from './watcher/index.js';
import type { WatchState } from './watcher/state.js';
import type { Swap } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTargets(): WatchTarget[] {
  const path = join(__dirname, '..', 'watchlist.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { targets: WatchTarget[] };
  return raw.targets ?? [];
}

async function runDemo(): Promise<void> {
  const demo = JSON.parse(
    readFileSync(join(__dirname, 'data', 'demo-live-swaps.json'), 'utf8'),
  ) as { bootstrap: Swap[]; tick: Swap[] };

  console.log('\n[demo] Simulating a monitor cycle for @reboot (offline)…\n');
  const state: WatchState = { wallets: {} };
  const target: WatchTarget = { wallet: 'H1XD6MKNWhJDaNBgsJxNWCMEb7yTTMeqCod1jfYhh9iq', label: '@reboot' };

  // 1) Bootstrap tick — seeds the book (MarsCoin already held), no alerts.
  await processWallet(target, state, async () => demo.bootstrap);
  console.log('[demo] Bootstrapped. MarsCoin seeded as an already-held +3,193% runner.');
  console.log('[demo] Next tick brings: a NEW entry, an ADD to MarsCoin, and an EXIT.\n');

  // 2) Live tick — bootstrap + new events; only fresh ones are classified.
  const sent = await processWallet(target, state, async () => [...demo.bootstrap, ...demo.tick]);

  console.log(`\n[demo] ${sent.length} alert(s) sent. The ADD to MarsCoin was suppressed by anti-chase ✅`);
  console.log('[demo] Set ALERT_ON_ADDS=true in .env if you ever want add alerts too.\n');
}

async function loop(targets: WatchTarget[]): Promise<void> {
  console.log(`Watching ${targets.length} wallet(s), polling every ${config.watchPollSeconds}s. Ctrl+C to stop.`);
  const run = async () => {
    try {
      const sent = await tick(targets);
      if (sent.length) console.log(`[watch] ${sent.length} alert(s) this tick.`);
    } catch (err) {
      console.error('[watch] tick error:', err instanceof Error ? err.message : err);
    }
  };
  await run();
  setInterval(run, config.watchPollSeconds * 1000);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--demo')) return runDemo();

  const targets = loadTargets();
  if (targets.length === 0) {
    console.error('watchlist.json has no targets. Add at least one wallet.');
    process.exit(1);
  }

  if (!config.heliusApiKey) {
    console.error('HELIUS_API_KEY is not set. Add it to .env, or try `npm run watch:demo`.');
    process.exit(1);
  }

  if (argv.includes('--once')) {
    const sent = await tick(targets);
    console.log(`\nDone. ${sent.length} alert(s) sent this run.`);
    return;
  }

  await loop(targets);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
