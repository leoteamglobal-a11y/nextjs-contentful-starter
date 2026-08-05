// Normalización y ranking PUROS (sin red, sin disco). El corazón testeable.
import type { NormalizedRow, RawPool } from "./types.js";

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Convierte un pool crudo de DefiLlama en una fila normalizada con las métricas de riesgo. */
export function normalizePool(p: RawPool, date: string): NormalizedRow {
  const apy = num(p.apy);
  const apyBase = num(p.apyBase);
  const apyReward = num(p.apyReward);
  const tvlUsd = num(p.tvlUsd) ?? 0;

  const apyBaseShare = apy && apy > 0 && apyBase != null ? apyBase / apy : null;
  const incentiveShare = apy && apy > 0 && apyReward != null ? apyReward / apy : null;
  // yield real: apyBase si existe; si no, apy menos incentivos.
  const realYield = apyBase != null ? apyBase : apy != null ? apy - (apyReward ?? 0) : null;
  const isMirage = incentiveShare != null ? incentiveShare > 0.9 : false;

  return {
    date,
    pool: p.pool,
    chain: p.chain,
    project: p.project,
    symbol: p.symbol,
    tvlUsd,
    apy,
    apyBase,
    apyReward,
    apyBaseShare,
    incentiveShare,
    realYield,
    isMirage,
    ageDays: num(p.count),
    stablecoin: !!p.stablecoin,
    ilRisk: p.ilRisk ?? null,
    exposure: p.exposure ?? null,
    poolMeta: (p.poolMeta as string) ?? null,
  };
}

export interface RankFilters {
  /** TVL mínimo en USD (descarta pools ilíquidos). */
  minTvlUsd?: number;
  /** Exigir que apyBase exista (yield real conocido). */
  requireApyBase?: boolean;
  /** Excluir espejismos (>90% incentivos). */
  excludeMirage?: boolean;
  /** Solo stablecoins. */
  stableOnly?: boolean;
}

/** Rankea por YIELD REAL (no por APY bruto), aplicando filtros de riesgo. */
export function rankByRealYield(rows: NormalizedRow[], f: RankFilters = {}): NormalizedRow[] {
  const minTvl = f.minTvlUsd ?? 0;
  return rows
    .filter((r) => r.tvlUsd >= minTvl)
    .filter((r) => (f.requireApyBase ? r.apyBase != null : true))
    .filter((r) => (f.excludeMirage ? !r.isMirage : true))
    .filter((r) => (f.stableOnly ? r.stablecoin : true))
    .filter((r) => r.realYield != null)
    .sort((a, b) => (b.realYield as number) - (a.realYield as number));
}

/**
 * Screen de CALIDAD (criterios sostenibles, no APY llamativo):
 *   - apyBase ≥ 10%          (yield real alto, no incentivos)
 *   - TVL ≥ $10M             (liquidez seria)
 *   - antigüedad ≥ 1 año     (sobrevivió; proxy = días de historia)
 *   - base predominante      (incentivos ≤ 50% del APY)
 *
 * NOTA: auditorías y calendario de desbloqueos NO están en el snapshot de
 * DefiLlama — requieren las tablas de eventos de la etapa 3. Este screen cubre
 * lo que sí es medible hoy. Es deliberadamente ESTRICTO: puede devolver pocas o
 * cero oportunidades — eso también es información honesta (hay poco yield real
 * alto y sostenible).
 */
export interface QualityThresholds {
  minApyBase?: number;
  minTvlUsd?: number;
  minAgeDays?: number;
  maxIncentiveShare?: number;
}
export function qualityScreen(rows: NormalizedRow[], t: QualityThresholds = {}): NormalizedRow[] {
  const minApyBase = t.minApyBase ?? 10;
  const minTvl = t.minTvlUsd ?? 10_000_000;
  const minAge = t.minAgeDays ?? 365;
  const maxInc = t.maxIncentiveShare ?? 0.5;
  return rows
    .filter((r) => r.apyBase != null && r.apyBase >= minApyBase)
    .filter((r) => r.tvlUsd >= minTvl)
    .filter((r) => r.ageDays != null && r.ageDays >= minAge)
    .filter((r) => (r.incentiveShare == null ? true : r.incentiveShare <= maxInc))
    .sort((a, b) => (b.realYield as number) - (a.realYield as number));
}

/** Los mayores "espejismos": APY alto pero casi todo incentivos. Para ilustrar. */
export function topMirages(rows: NormalizedRow[], minTvlUsd = 0): NormalizedRow[] {
  return rows
    .filter((r) => r.tvlUsd >= minTvlUsd && r.isMirage && r.apy != null)
    .sort((a, b) => (b.apy as number) - (a.apy as number));
}
