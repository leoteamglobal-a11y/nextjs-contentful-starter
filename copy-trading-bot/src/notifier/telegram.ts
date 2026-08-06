import { config, USDC_PER_SOL } from '../config.js';
import type { Alert } from '../types.js';

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const ICON: Record<Alert['kind'], string> = {
  NEW_ENTRY: '🟢 NEW ENTRY',
  ADD: '➕ ADD',
  REDUCE: '🟠 TRIM',
  EXIT: '🔴 EXIT',
};

/** Human-readable alert body (also used for the console fallback). */
export function formatAlert(a: Alert): string {
  const s = a.swap;
  const who = a.walletLabel ? `${a.walletLabel} (${short(a.wallet)})` : short(a.wallet);
  const sizeSol = s.quoteSymbol === 'USDC' ? s.quoteAmount / USDC_PER_SOL : s.quoteAmount;
  const token = s.tokenSymbol ?? short(s.tokenMint);

  const lines = [
    `${ICON[a.kind]} — ${who}`,
    `${s.action} ${token}`,
    `size: ${sizeSol.toFixed(2)} ${s.quoteSymbol === 'USDC' ? 'SOL-eq' : 'SOL'}  (${s.quoteAmount.toFixed(2)} ${s.quoteSymbol})`,
    s.source ? `via ${s.source}` : '',
    `tx: https://solscan.io/tx/${s.signature}`,
    a.kind === 'NEW_ENTRY' ? '👉 fresh position — copyable entry, not a chase' : '',
    a.reason ? `note: ${a.reason}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Send an alert. If no Telegram token is configured, fall back to console so the
 * monitor is fully usable (and demoable) without any secrets.
 */
export async function sendAlert(a: Alert): Promise<void> {
  const body = formatAlert(a);

  if (!config.telegramBotToken || !config.telegramChatId) {
    console.log(`\n[alert:console]\n${body}\n`);
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text: body,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error(`[telegram] send failed ${res.status}: ${await res.text()}`);
    console.log(`\n[alert:console-fallback]\n${body}\n`);
  }
}
