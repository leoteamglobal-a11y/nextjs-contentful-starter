// Etapa 3: tablas de eventos (append-only) + detección de pools "muertos".
// Los eventos dan el contexto que el snapshot no tiene: hacks, unlocks, depegs,
// auditorías, y muertes de pools (clave para el backtest sin sesgo de supervivencia).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NormalizedRow } from "./types.js";

export type EventType = "hack" | "unlock" | "depeg" | "audit" | "death" | "incentive_change";

export interface DefiEvent {
  date: string; // YYYY-MM-DD
  type: EventType;
  scope: "protocol" | "pool" | "token";
  ref: string; // slug de protocolo / id de pool / símbolo|dirección de token
  detail?: string;
  amountUsd?: number | null;
  source?: string;
}

// --- Store append-only (log de eventos) ---

export function eventsPath(dir = "data"): string {
  return join(dir, "events", "events.jsonl");
}

/** Agrega eventos al log (append-only; nunca reescribe la historia). */
export function appendEvents(events: DefiEvent[], dir = "data"): void {
  if (events.length === 0) return;
  const file = eventsPath(dir);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

export function readEvents(dir = "data"): DefiEvent[] {
  const file = eventsPath(dir);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as DefiEvent);
}

// --- Detección de pools muertos (survivorship bias) ---

export interface DeathOptions {
  /** TVL mínimo que tenía el pool antes para considerar su muerte relevante. */
  minPrevTvlUsd?: number;
  /** TVL absoluto por debajo del cual se considera muerto. */
  deadTvlUsd?: number;
  /** O fracción del TVL previo por debajo de la cual se considera muerto. */
  deadFraction?: number;
}

/**
 * Compara dos snapshots (previo → actual) y genera eventos `death` para los
 * pools que tenían TVL relevante y desaparecieron o colapsaron. PURO.
 */
export function detectDeaths(
  prev: NormalizedRow[],
  curr: NormalizedRow[],
  currDate: string,
  opts: DeathOptions = {},
): DefiEvent[] {
  const minPrev = opts.minPrevTvlUsd ?? 1_000_000;
  const deadTvl = opts.deadTvlUsd ?? 50_000;
  const deadFrac = opts.deadFraction ?? 0.05;

  const currById = new Map(curr.map((r) => [r.pool, r]));
  const deaths: DefiEvent[] = [];

  for (const p of prev) {
    if (p.tvlUsd < minPrev) continue;
    const now = currById.get(p.pool);
    const nowTvl = now ? now.tvlUsd : 0;
    const collapsed = nowTvl < deadTvl || nowTvl < p.tvlUsd * deadFrac;
    if (collapsed) {
      deaths.push({
        date: currDate,
        type: "death",
        scope: "pool",
        ref: p.pool,
        detail: `${p.symbol} (${p.project}/${p.chain}) TVL $${fmt(p.tvlUsd)} → $${fmt(nowTvl)}${now ? "" : " (desapareció)"}`,
        amountUsd: p.tvlUsd,
        source: "snapshot-diff",
      });
    }
  }
  return deaths;
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}
