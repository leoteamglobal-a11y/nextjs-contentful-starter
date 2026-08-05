// Carga y tipos de configuración.
import { readFileSync } from "node:fs";

export interface SignalConfig {
  /** Entrar cuando APY >= este valor (y no hay posición). */
  enterApyMin: number;
  /** Salir cuando APY cae por debajo de este valor. */
  exitApyMin: number;
  /** Salir si VELVET se movió (abs) más que este % desde la entrada. */
  maxVelvetMovePct: number;
  /** Ancho del rango de liquidez al entrar (± % alrededor del precio). */
  rangeWidthPct: number;
  /** Salir si el precio se sale del rango de la posición. */
  exitOnOutOfRange: boolean;
  /** Stop-loss sobre el movimiento de precio (%). */
  stopLossPct: number;
  /** Take-profit sobre el movimiento de precio (%). */
  takeProfitPct: number;
  // --- increaseLiquidity (opcional): agregar al MISMO NFT en vez de re-mintear ---
  /** APY mínimo para agregar liquidez a la posición abierta (default: enterApyMin). */
  increaseApyMin?: number;
  /** Cuánto USD agregar por vez. Si falta o es 0, nunca agrega. */
  increaseStepUsd?: number;
  /** Tamaño máximo de la posición en USD (tope para los aportes). */
  maxPositionUsd?: number;
  // --- reposicionamiento: al salir de rango, mover a un rango nuevo en un paso ---
  /** Si true, al salir de rango reabre en un rango nuevo en vez de cerrar y esperar. */
  reposition?: boolean;
  /** APY mínimo para reposicionar (default: enterApyMin). */
  repositionApyMin?: number;
}

export interface SimConfig {
  intervalMs: number;
  startPriceUsd: number;
  startApy: number;
  apyDecayPerTick: number;
  priceVolPct: number;
}

export interface Config {
  chain: string;
  rpcUrl: string;
  pool: { id: string; address: string; label: string };
  dryRun: boolean;
  /** Doble traba: ejecución real requiere dryRun=false Y liveConfirmed=true. */
  liveConfirmed: boolean;
  positionSizeUsd: number;
  feed: "simulated" | "onchain";
  signals: SignalConfig;
  sim: SimConfig;
  /** Config del feed on-chain (opcional). */
  onchain?: OnchainConfig;
  /** Config de ejecución live (opcional; requerida si dryRun=false). */
  live?: LiveConfig;
  /** Cadencia del loop en ms (default: sim.intervalMs). */
  pollIntervalMs?: number;
}

export interface LiveConfig {
  /** NonfungiblePositionManager de Slipstream (Base). */
  positionManager: string;
  /** tickSpacing del pool CL (CL1 = 1). */
  tickSpacing: number;
  /** Slippage tolerado en bps (informativo; ver notas del executor). */
  slippageBps: number;
  /** Segundos hasta el deadline de cada tx. Default 600. */
  deadlineSecs?: number;
}

export interface OnchainConfig {
  /** Cada cuánto refrescar APY/TVL desde DefiLlama (ms). Default 60000. */
  apyRefreshMs?: number;
  /** Símbolo del token volátil a seguir (para identificar cuál es en el par). */
  baseSymbol?: string;
}

export function loadConfig(path = "config.json"): Config {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Config;
}
