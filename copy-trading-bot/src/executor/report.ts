import type { ExecDecision } from '../types.js';

const ICON: Record<ExecDecision['action'], string> = {
  BUY: '🟢 BUY',
  SELL: '🔴 SELL',
  SKIP: '⚪ SKIP',
};

/** One-line summary of what the executor did (or why it didn't). */
export function formatDecision(d: ExecDecision): string {
  const token = d.tokenSymbol ?? d.tokenMint.slice(0, 8);
  const tag = d.mode === 'live' ? 'LIVE' : d.mode === 'dry' ? 'paper' : 'off';

  if (d.action === 'SKIP') return `${ICON.SKIP} [${tag}] ${token} — ${d.reasons.join('; ')}`;

  const parts = [`${ICON[d.action]} [${tag}] ${token}`, `${d.sizeSol.toFixed(3)} SOL`];
  if (d.realizedPnlSol !== undefined) {
    parts.push(`realized ${d.realizedPnlSol >= 0 ? '+' : ''}${d.realizedPnlSol.toFixed(3)} SOL`);
  }
  if (d.tx) parts.push(`tx ${d.tx.slice(0, 8)}…`);
  if (d.reasons.length) parts.push(`(${d.reasons.join('; ')})`);
  return parts.join(' · ');
}
