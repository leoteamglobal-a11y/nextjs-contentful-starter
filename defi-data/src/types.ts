// Tipos de la ingesta.

/** Pool tal como lo devuelve DefiLlama Yields (/pools). Campos que usamos. */
export interface RawPool {
  pool: string; // id único (uuid)
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin?: boolean;
  ilRisk?: string; // "yes" | "no"
  exposure?: string; // "single" | "multi"
  poolMeta?: string | null;
  rewardTokens?: string[] | null;
  underlyingTokens?: string[] | null;
  apyMean30d?: number | null;
  /** Días de historia que DefiLlama tiene del pool (proxy de antigüedad). */
  count?: number | null;
  [k: string]: unknown;
}

/** Fila normalizada que persistimos y consultamos. */
export interface NormalizedRow {
  date: string; // UTC YYYY-MM-DD (día del snapshot)
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  /** apyBase / apy — el % del yield que es REAL (comisiones). El filtro #1. */
  apyBaseShare: number | null;
  /** apyReward / apy — el % que es incentivo/subsidio. */
  incentiveShare: number | null;
  /** yield real estimado: apyBase, o apy - apyReward si falta apyBase. */
  realYield: number | null;
  /** true si >90% del APY viene de incentivos (espejismo). */
  isMirage: boolean;
  /** Días de historia (proxy de antigüedad). null si desconocido. */
  ageDays: number | null;
  stablecoin: boolean;
  ilRisk: string | null;
  exposure: string | null;
  poolMeta: string | null;
}

/** Un punto diario del histórico de un pool (DefiLlama /chart/{id}). */
export interface ChartPoint {
  date: string; // YYYY-MM-DD
  tvlUsd: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
}

/**
 * Resumen de PERSISTENCIA de un pool a lo largo de su historia. Es el payoff de
 * la etapa 2: responde "¿el yield real se sostuvo o el APY se desplomó?".
 */
export interface PersistenceSummary {
  pool: string;
  days: number;
  first: string;
  last: string;
  // Yield real (apyBase) a lo largo del tiempo
  apyBaseMean: number;
  apyBaseMedian: number;
  apyBaseMin: number;
  apyBaseMax: number;
  apyBaseStdev: number;
  incentiveShareMean: number; // promedio de apyReward/apy
  // Persistencia del yield real por encima de un umbral
  baseThreshold: number;
  daysApyBaseAboveThreshold: number;
  shareDaysAboveThreshold: number; // 0..1
  // Colapso del APY total (señal de espejismo)
  apyPeak: number;
  apyLast: number;
  apyDecayPct: number; // (peak - last) / peak * 100
  // TVL / supervivencia
  tvlMeanUsd: number;
  tvlPeakUsd: number;
  tvlLastUsd: number;
  tvlDrawdownPct: number;
  alive: boolean;
}
