import { config } from '../config.js';
import type { Alert } from '../types.js';
import { killSwitchEngaged, type ExecState } from './state.js';

/** Position size (SOL) before risk clamping, from the configured sizing mode. */
export function rawSize(): number {
  return config.sizingMode === 'proportional'
    ? config.bankrollSol * config.proportionalPct
    : config.fixedSizeSol;
}

export interface Gate {
  ok: boolean;
  sizeSol: number;
  reasons: string[];
}

/**
 * Decide whether — and how big — to copy a NEW entry. Every hard limit lives
 * here, so both dry and live modes are governed by the exact same guardrails.
 */
export function assessEntry(alert: Alert, state: ExecState): Gate {
  const reasons: string[] = [];

  if (killSwitchEngaged()) return { ok: false, sizeSol: 0, reasons: ['kill switch engaged (out/STOP present)'] };
  if (config.executionMode === 'off') return { ok: false, sizeSol: 0, reasons: ['EXECUTION_MODE=off'] };

  // Anti-chase is already enforced upstream, but never trust a single layer:
  // the executor ONLY opens on a fresh entry, never on an add/trim/exit.
  if (alert.kind !== 'NEW_ENTRY') {
    return { ok: false, sizeSol: 0, reasons: [`not a new entry (${alert.kind})`] };
  }

  if (state.positions[alert.swap.tokenMint]) {
    return { ok: false, sizeSol: 0, reasons: ['already holding this token'] };
  }

  let size = rawSize();
  if (size > config.maxTradeSol) {
    size = config.maxTradeSol;
    reasons.push(`capped to MAX_TRADE_SOL (${config.maxTradeSol})`);
  }

  if (state.tradesToday >= config.maxTradesPerDay) {
    return { ok: false, sizeSol: 0, reasons: [`daily trade count reached (${config.maxTradesPerDay})`] };
  }

  if (state.spentTodaySol + size > config.dailyCapSol) {
    return {
      ok: false,
      sizeSol: 0,
      reasons: [`would exceed DAILY_CAP_SOL (${state.spentTodaySol.toFixed(2)}+${size.toFixed(2)} > ${config.dailyCapSol})`],
    };
  }

  return { ok: true, sizeSol: size, reasons };
}
