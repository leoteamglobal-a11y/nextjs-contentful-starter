// Ejecución: paper (simulada) vs live (Aerodrome real, TODO).
import type { Action, PoolState, Position } from "./types.js";

export interface Executor {
  enter(state: PoolState, action: Extract<Action, { kind: "enter" }>, sizeUsd: number): Promise<Position>;
  /** Cierra la posición. Devuelve el PnL estimado en USD. */
  exit(pos: Position, state: PoolState, reason: string): Promise<number>;
}

const YEAR_SECS = 365 * 24 * 3600;

/** Ejecutor de papel: no toca la cadena. Estima PnL de forma simplificada. */
export class PaperExecutor implements Executor {
  async enter(state: PoolState, action: Extract<Action, { kind: "enter" }>, sizeUsd: number): Promise<Position> {
    console.log(
      `[PAPER] ENTER $${sizeUsd} rango [${action.rangeLow.toFixed(5)}, ${action.rangeHigh.toFixed(5)}] ` +
        `@ VELVET $${state.velvetUsd.toFixed(5)} APY ${state.apy.toFixed(0)}%`,
    );
    return {
      active: true,
      entryTs: state.ts,
      entryVelvetUsd: state.velvetUsd,
      entryApy: state.apy,
      rangeLow: action.rangeLow,
      rangeHigh: action.rangeHigh,
      sizeUsd,
    };
  }

  async exit(pos: Position, state: PoolState, reason: string): Promise<number> {
    const holdSecs = Math.max(1, (state.ts - pos.entryTs) / 1000);
    // Fees estimados: APY de entrada prorrateado por el tiempo en posición.
    const feesUsd = pos.sizeUsd * (pos.entryApy / 100) * (holdSecs / YEAR_SECS);
    // IL aproximado (grosero): crece con el cuadrado del movimiento de precio.
    // TODO: modelo real de impermanent loss para liquidez concentrada.
    const move = Math.abs(state.velvetUsd - pos.entryVelvetUsd) / pos.entryVelvetUsd;
    const ilUsd = pos.sizeUsd * move * move * 0.5;
    const pnl = feesUsd - ilUsd;
    console.log(
      `[PAPER] EXIT (${reason}) hold ${holdSecs.toFixed(0)}s | ` +
        `fees ~$${feesUsd.toFixed(2)}  IL ~$${ilUsd.toFixed(2)}  =>  PnL ~$${pnl.toFixed(2)}`,
    );
    return pnl;
  }
}

/** Ejecutor real en Aerodrome Slipstream (Base). TODO: implementar con viem. */
export class LiveExecutor implements Executor {
  // Próximo paso: walletClient de viem + NonfungiblePositionManager de Slipstream
  //   enter -> mint(...) o increaseLiquidity(...)
  //   exit  -> decreaseLiquidity(...) + collect(...)
  // Requiere ABI del position manager, tick spacing del pool CL1, y firma con
  // la clave privada. No se pudo probar acá (RPC de Base bloqueado por egress).
  async enter(): Promise<Position> {
    throw new Error("LiveExecutor aún no implementado (falta viem + Aerodrome position manager).");
  }
  async exit(): Promise<number> {
    throw new Error("LiveExecutor aún no implementado.");
  }
}
