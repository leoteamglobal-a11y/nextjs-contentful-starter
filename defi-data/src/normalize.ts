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

/** Los mayores "espejismos": APY alto pero casi todo incentivos. Para ilustrar. */
export function topMirages(rows: NormalizedRow[], minTvlUsd = 0): NormalizedRow[] {
  return rows
    .filter((r) => r.tvlUsd >= minTvlUsd && r.isMirage && r.apy != null)
    .sort((a, b) => (b.apy as number) - (a.apy as number));
}
