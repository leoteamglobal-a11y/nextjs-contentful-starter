// Tipos de dominio del bot de señales para el pool.

/** Estado del pool en un instante. */
export interface PoolState {
  ts: number;
  /** Precio de VELVET en USD (referencia para rango y movimiento). */
  velvetUsd: number;
  /** APY reportado del pool, en %. */
  apy: number;
  /** TVL del pool en USD. */
  tvlUsd: number;
}

/** Posición de liquidez abierta (o vacía). */
export interface Position {
  active: boolean;
  entryTs: number;
  entryVelvetUsd: number;
  entryApy: number;
  /** Límites del rango de liquidez concentrada (en precio USD de VELVET). */
  rangeLow: number;
  rangeHigh: number;
  sizeUsd: number;
  /** Live: id del NFT de la posición y liquidez (para cerrar). */
  tokenId?: bigint;
  liquidity?: bigint;
  /** Timestamp del último cobro de fees (para no duplicar en el paper). */
  lastFeeCollectTs?: number;
  /** Fees ya cobrados en esta posición (paper, USD). */
  collectedFeesUsd?: number;
}

export const EMPTY_POSITION: Position = {
  active: false,
  entryTs: 0,
  entryVelvetUsd: 0,
  entryApy: 0,
  rangeLow: 0,
  rangeHigh: 0,
  sizeUsd: 0,
};

/** Decisión del motor de señales. */
export type Action =
  | { kind: "enter"; rangeLow: number; rangeHigh: number }
  | { kind: "increase"; addUsd: number }
  | { kind: "reposition"; rangeLow: number; rangeHigh: number }
  | { kind: "collect" }
  | { kind: "exit"; reason: string }
  | { kind: "hold" };
