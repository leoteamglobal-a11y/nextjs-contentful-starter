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
