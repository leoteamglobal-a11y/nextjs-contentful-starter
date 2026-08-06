import type { WalletReport } from '../types.js';

const short = (addr: string) => (addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const sol = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

function holdHuman(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function tier(score: number): string {
  if (score >= 75) return '🟢 strong';
  if (score >= 55) return '🟡 decent';
  if (score >= 35) return '🟠 weak';
  return '🔴 avoid';
}

/** Render the ranked leaderboard as a console table. */
export function printLeaderboard(reports: WalletReport[]): void {
  const rows = reports.map((r, i) => ({
    '#': String(i + 1),
    wallet: short(r.wallet),
    score: `${r.copyabilityScore} ${tier(r.copyabilityScore)}`,
    'PnL(SOL)': sol(r.realizedPnlSol),
    ROI: pct(r.roi),
    win: pct(r.winRate),
    'trades/d': r.tradesPerDay.toFixed(1),
    'size(SOL)': r.avgTradeSizeSol.toFixed(2),
    hold: holdHuman(r.avgHoldSeconds),
    tokens: String(r.distinctTokens),
  }));

  if (rows.length === 0) {
    console.log('No wallets to show.');
    return;
  }

  const cols = Object.keys(rows[0]);
  const width: Record<string, number> = {};
  for (const c of cols) width[c] = Math.max(c.length, ...rows.map((row) => String(row[c as keyof typeof row]).length));

  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(width[cols[i]])).join('  ');
  console.log('\n' + line(cols));
  console.log(cols.map((c) => '─'.repeat(width[c])).join('  '));
  for (const row of rows) console.log(line(cols.map((c) => String(row[c as keyof typeof row]))));

  // Per-wallet notes and top/bottom tokens.
  for (const r of reports) {
    if (r.notes.length || r.perToken.length) {
      console.log(`\n▸ ${short(r.wallet)}  (score ${r.copyabilityScore})`);
      const top = r.perToken.slice(0, 3);
      for (const t of top) {
        console.log(`   ${t.tokenSymbol ?? short(t.tokenMint)}: ${sol(t.realizedPnlSol)} SOL  (roi ${pct(t.roi)}, ${t.buys}b/${t.sells}s)`);
      }
      for (const n of r.notes) console.log(`   • ${n}`);
    }
  }
  console.log('');
}

/** Pretty-printable JSON for saving / feeding the executor's allowlist. */
export function toJSON(reports: WalletReport[]): string {
  return JSON.stringify(reports, null, 2);
}
