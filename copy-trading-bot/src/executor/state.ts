import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Position } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'out');
const EXEC_PATH = join(OUT_DIR, 'exec-state.json');
export const KILL_SWITCH = join(OUT_DIR, 'STOP');

export interface ExecState {
  /** ISO day (YYYY-MM-DD) the day-counters below belong to. */
  day: string;
  spentTodaySol: number;
  tradesToday: number;
  positions: Record<string, Position>; // keyed by tokenMint
  realizedPnlSol: number;
}

function emptyState(day: string): ExecState {
  return { day, spentTodaySol: 0, tradesToday: 0, positions: {}, realizedPnlSol: 0 };
}

export function loadExecState(today: string): ExecState {
  if (!existsSync(EXEC_PATH)) return emptyState(today);
  try {
    const s = JSON.parse(readFileSync(EXEC_PATH, 'utf8')) as ExecState;
    // Roll the daily counters when the date changes.
    if (s.day !== today) {
      s.day = today;
      s.spentTodaySol = 0;
      s.tradesToday = 0;
    }
    return s;
  } catch {
    return emptyState(today);
  }
}

export function saveExecState(s: ExecState): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(EXEC_PATH, JSON.stringify(s, null, 2));
}

/** The kill switch: `touch out/STOP` halts all execution instantly. */
export function killSwitchEngaged(): boolean {
  return existsSync(KILL_SWITCH);
}
