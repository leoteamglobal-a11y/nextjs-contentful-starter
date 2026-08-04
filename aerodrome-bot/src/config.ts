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
}

export function loadConfig(path = "config.json"): Config {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Config;
}
