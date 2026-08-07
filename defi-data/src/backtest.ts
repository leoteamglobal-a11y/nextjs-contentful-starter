// Etapa 4: backtest SIN sesgo de supervivencia. Simula "¿qué habría pasado si
// aplicaba la regla X en los últimos meses?", incluyendo los pools que murieron.
// Demuestra: perseguir APY alto te funde; el screen de calidad compone.
import { deriveYieldMetrics, qualityScreen, rankByRealYield, type QualityThresholds } from "./normalize.js";
import type { ChartPoint, NormalizedRow } from "./types.js";

/** Historia de un pool: metadata estática + serie temporal. */
export interface PoolHistory {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  stablecoin?: boolean;
  points: ChartPoint[]; // ordenados por fecha
}

/** Una estrategia asigna pesos (fracción del capital) a pools, dado el corte transversal. */
export type Strategy = (rows: NormalizedRow[], date: string) => Map<string, number>;

export interface BacktestConfig {
  start: string; // YYYY-MM-DD
  end: string;
  rebalanceEveryDays?: number; // default 30
  capital0?: number; // default 1000
  strategy: Strategy;
  /** Fracción perdida del sleeve cuando un pool muere (default 1 = pérdida total). */
  deathHaircut?: number;
  /** APY del "cash" cuando la estrategia no invierte todo (default 4%). */
  stableFloorApy?: number;
}

export interface BacktestResult {
  finalCapital: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  periods: number;
  series: Array<{ date: string; capital: number }>;
}

// --- utilidades de fecha ---
function parse(d: string): number {
  return Date.parse(d + "T00:00:00Z");
}
function addDays(d: string, days: number): string {
  return new Date(parse(d) + days * 86_400_000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.max(0, (parse(b) - parse(a)) / 86_400_000);
}

/** Último punto con fecha ≤ `date`. */
export function pointAsOf(points: ChartPoint[], date: string): ChartPoint | null {
  let best: ChartPoint | null = null;
  for (const p of points) {
    if (parse(p.date) <= parse(date)) best = p;
    else break;
  }
  return best;
}

/** Fecha de "muerte" del pool: primer día en que el TVL colapsa. */
export function poolDeathDate(points: ChartPoint[], deadTvlUsd = 50_000, deadFraction = 0.05): string | null {
  const peak = Math.max(0, ...points.map((p) => p.tvlUsd ?? 0));
  for (const p of points) {
    const tvl = p.tvlUsd ?? 0;
    if (tvl < deadTvlUsd || (peak > 0 && tvl < peak * deadFraction)) return p.date;
  }
  return null;
}

/** Construye una fila normalizada (corte transversal) a partir de un punto. */
function rowFromHistory(h: PoolHistory, pt: ChartPoint, date: string, ageDays: number): NormalizedRow {
  const m = deriveYieldMetrics(pt.apy, pt.apyBase, pt.apyReward);
  return {
    date,
    pool: h.pool,
    chain: h.chain,
    project: h.project,
    symbol: h.symbol,
    tvlUsd: pt.tvlUsd ?? 0,
    apy: pt.apy,
    apyBase: pt.apyBase,
    apyReward: pt.apyReward,
    apyBaseShare: m.apyBaseShare,
    incentiveShare: m.incentiveShare,
    realYield: m.realYield,
    isMirage: m.isMirage,
    ageDays,
    stablecoin: !!h.stablecoin,
    ilRisk: null,
    exposure: null,
    poolMeta: null,
  };
}

export function runBacktest(universe: PoolHistory[], cfg: BacktestConfig): BacktestResult {
  const step = cfg.rebalanceEveryDays ?? 30;
  const capital0 = cfg.capital0 ?? 1000;
  const haircut = cfg.deathHaircut ?? 1;
  const cashApy = cfg.stableFloorApy ?? 4;

  // Precomputar fecha de muerte por pool.
  const deathByPool = new Map<string, string | null>();
  for (const h of universe) deathByPool.set(h.pool, poolDeathDate(h.points));

  // Fechas de rebalanceo.
  const dates: string[] = [];
  for (let d = cfg.start; parse(d) <= parse(cfg.end); d = addDays(d, step)) dates.push(d);
  if (dates[dates.length - 1] !== cfg.end) dates.push(cfg.end);

  let capital = capital0;
  const series: Array<{ date: string; capital: number }> = [{ date: cfg.start, capital }];

  for (let i = 0; i < dates.length - 1; i++) {
    const d0 = dates[i];
    const d1 = dates[i + 1];
    const periodDays = daysBetween(d0, d1);

    // Corte transversal en d0: pools con datos y no muertos aún.
    const rows: NormalizedRow[] = [];
    const asOfPoint = new Map<string, ChartPoint>();
    for (const h of universe) {
      const death = deathByPool.get(h.pool);
      if (death && parse(death) <= parse(d0)) continue; // ya muerto: no invertible
      const pt = pointAsOf(h.points, d0);
      if (!pt) continue;
      const ageDays = daysBetween(h.points[0].date, d0);
      rows.push(rowFromHistory(h, pt, d0, ageDays));
      asOfPoint.set(h.pool, pt);
    }

    const weights = cfg.strategy(rows, d0);
    const invested = [...weights.values()].reduce((a, b) => a + Math.max(0, b), 0);
    const cashFrac = Math.max(0, 1 - invested);

    // Retorno del período por sleeve.
    let growth = cashFrac * (1 + (cashApy / 100) * (periodDays / 365));
    for (const [pool, w] of weights) {
      if (w <= 0) continue;
      const death = deathByPool.get(pool);
      const diesThisPeriod = death && parse(death) > parse(d0) && parse(death) <= parse(d1);
      if (diesThisPeriod) {
        growth += w * (1 - haircut); // pérdida del sleeve
        continue;
      }
      const pt = asOfPoint.get(pool);
      const apyBase = pt?.apyBase ?? 0; // yield REAL (lo que de verdad cobrás)
      const r = (apyBase / 100) * (periodDays / 365);
      growth += w * (1 + r);
    }

    capital *= growth;
    series.push({ date: d1, capital });
  }

  // Métricas.
  let peak = capital0;
  let maxDd = 0;
  for (const s of series) {
    peak = Math.max(peak, s.capital);
    maxDd = Math.max(maxDd, (peak - s.capital) / peak);
  }
  const totalDays = Math.max(1, daysBetween(cfg.start, cfg.end));
  const cagr = Math.pow(capital / capital0, 365 / totalDays) - 1;

  return {
    finalCapital: capital,
    totalReturnPct: (capital / capital0 - 1) * 100,
    cagrPct: cagr * 100,
    maxDrawdownPct: maxDd * 100,
    periods: series.length - 1,
    series,
  };
}

// --- Estrategias listas ---

/** Persigue el APY total más alto (equal weight top N). El error clásico. */
export function chaseTopApy(n = 3): Strategy {
  return (rows) => {
    const top = rows
      .filter((r) => r.apy != null)
      .sort((a, b) => (b.apy as number) - (a.apy as number))
      .slice(0, n);
    const w = new Map<string, number>();
    for (const r of top) w.set(r.pool, 1 / Math.max(1, top.length));
    return w;
  };
}

/** Screen de calidad: solo yield real, TVL, base predominante. Equal weight top N. */
export function qualityStrategy(n = 3, thresholds: QualityThresholds = {}): Strategy {
  return (rows) => {
    const picks = qualityScreen(rows, { minTvlUsd: 10_000_000, ...thresholds }).slice(0, n);
    const w = new Map<string, number>();
    for (const r of picks) w.set(r.pool, 1 / Math.max(1, picks.length));
    return w; // si no hay picks, todo queda en cash
  };
}

/** Ranking por yield real sin filtros duros (comparación intermedia). */
export function topRealYield(n = 3, minTvlUsd = 1_000_000): Strategy {
  return (rows) => {
    const picks = rankByRealYield(rows, { minTvlUsd, requireApyBase: true, excludeMirage: true }).slice(0, n);
    const w = new Map<string, number>();
    for (const r of picks) w.set(r.pool, 1 / Math.max(1, picks.length));
    return w;
  };
}
