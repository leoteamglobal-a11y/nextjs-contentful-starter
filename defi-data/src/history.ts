// Análisis PURO del histórico de un pool: normaliza el chart y calcula métricas
// de persistencia. Es donde los datos se vuelven ventaja (etapa 2).
import type { ChartPoint, PersistenceSummary } from "./types.js";

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

interface RawChart {
  data?: Array<{
    timestamp?: string;
    tvlUsd?: number | null;
    apy?: number | null;
    apyBase?: number | null;
    apyReward?: number | null;
  }>;
}

/** Convierte la respuesta cruda de /chart/{id} en puntos diarios normalizados. */
export function normalizeChart(raw: unknown): ChartPoint[] {
  const data = (raw as RawChart)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => ({
      date: typeof d.timestamp === "string" ? d.timestamp.slice(0, 10) : "",
      tvlUsd: num(d.tvlUsd),
      apy: num(d.apy),
      apyBase: num(d.apyBase),
      apyReward: num(d.apyReward),
    }))
    .filter((p) => p.date.length === 10)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Métricas de persistencia sobre el histórico de un pool. */
export function summarizeHistory(
  pool: string,
  points: ChartPoint[],
  opts: { baseThreshold?: number } = {},
): PersistenceSummary {
  const thr = opts.baseThreshold ?? 10;
  const base = points.map((p) => p.apyBase).filter((x): x is number => x != null);
  const tvl = points.map((p) => p.tvlUsd).filter((x): x is number => x != null);
  const apy = points.map((p) => p.apy).filter((x): x is number => x != null);
  const incShares = points
    .map((p) => (p.apy && p.apy > 0 && p.apyReward != null ? p.apyReward / p.apy : null))
    .filter((x): x is number => x != null);

  const tvlPeak = tvl.length ? Math.max(...tvl) : 0;
  const tvlLast = tvl.length ? tvl[tvl.length - 1] : 0;
  const apyPeak = apy.length ? Math.max(...apy) : 0;
  const apyLast = apy.length ? apy[apy.length - 1] : 0;
  const daysAbove = base.filter((b) => b >= thr).length;

  return {
    pool,
    days: points.length,
    first: points[0]?.date ?? "",
    last: points[points.length - 1]?.date ?? "",
    apyBaseMean: mean(base),
    apyBaseMedian: median(base),
    apyBaseMin: base.length ? Math.min(...base) : 0,
    apyBaseMax: base.length ? Math.max(...base) : 0,
    apyBaseStdev: stdev(base),
    incentiveShareMean: mean(incShares),
    baseThreshold: thr,
    daysApyBaseAboveThreshold: daysAbove,
    shareDaysAboveThreshold: base.length ? daysAbove / base.length : 0,
    apyPeak,
    apyLast,
    apyDecayPct: apyPeak > 0 ? ((apyPeak - apyLast) / apyPeak) * 100 : 0,
    tvlMeanUsd: mean(tvl),
    tvlPeakUsd: tvlPeak,
    tvlLastUsd: tvlLast,
    tvlDrawdownPct: tvlPeak > 0 ? ((tvlPeak - tvlLast) / tvlPeak) * 100 : 0,
    alive: tvlLast > 100_000 && (tvlPeak === 0 || tvlLast / tvlPeak > 0.1),
  };
}
