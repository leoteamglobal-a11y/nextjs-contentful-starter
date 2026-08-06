import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeWallets, analyzeFromSwaps } from './analyzer/index.js';
import { printLeaderboard, toJSON } from './report/table.js';
import type { Swap } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage(): void {
  console.log(`
Wallet Analyzer — rank Solana wallets by copy-trading potential.

Usage:
  npm run analyze -- <wallet> [<wallet> ...]     analyze one or more addresses
  npm run analyze -- --file wallets.txt          one address per line (# = comment)
  npm run analyze:demo                           run on bundled sample data (no API key)

Options:
  --json            print JSON instead of a table
  --out <path>      also save the full JSON report to <path>
  --demo            use bundled sample swaps (offline)
  -h, --help        show this help

Config lives in .env (see .env.example): HELIUS_API_KEY, lookback window, min trade size.
`);
}

function parseWalletFile(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) return usage();

  const demo = argv.includes('--demo');
  const asJson = argv.includes('--json');
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;

  let reports;

  if (demo) {
    const sample = JSON.parse(
      readFileSync(join(__dirname, 'data', 'sample-swaps.json'), 'utf8'),
    ) as Record<string, Swap[]>;
    console.log(`\n[demo mode] Analyzing ${Object.keys(sample).length} sample wallets (offline)…`);
    reports = analyzeFromSwaps(sample);
  } else {
    const fileIdx = argv.indexOf('--file');
    let wallets: string[] = [];
    if (fileIdx !== -1) {
      const p = argv[fileIdx + 1];
      if (!p || !existsSync(p)) {
        console.error(`--file path not found: ${p ?? '(missing)'}`);
        process.exit(1);
      }
      wallets = parseWalletFile(p);
    } else {
      wallets = argv.filter((a) => !a.startsWith('-') && a !== outPath);
    }

    if (wallets.length === 0) {
      usage();
      process.exit(1);
    }

    console.log(`\nAnalyzing ${wallets.length} wallet(s) via Helius…`);
    reports = await analyzeWallets(wallets);
  }

  if (asJson) {
    console.log(toJSON(reports));
  } else {
    printLeaderboard(reports);
    console.log('Tip: pass --json or --out report.json to export for the bot allowlist.');
  }

  if (outPath) {
    writeFileSync(outPath, toJSON(reports));
    console.log(`Saved report → ${outPath}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
