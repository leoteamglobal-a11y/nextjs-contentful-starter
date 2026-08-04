// Motor de señales PURO (sin side-effects): decide entrar / salir / mantener.
// Es la pieza clave y 100% testeable.
import type { SignalConfig } from "./config.js";
import type { Action, PoolState, Position } from "./types.js";

export function decide(state: PoolState, pos: Position, cfg: SignalConfig): Action {
  // --- Sin posición: ¿entramos? ---
  if (!pos.active) {
    if (state.apy >= cfg.enterApyMin) {
      const half = cfg.rangeWidthPct / 100;
      return {
        kind: "enter",
        rangeLow: state.velvetUsd * (1 - half),
        rangeHigh: state.velvetUsd * (1 + half),
      };
    }
    return { kind: "hold" };
  }

  // --- Con posición: ¿salimos? (cualquier regla dispara) ---
  const movePct = (Math.abs(state.velvetUsd - pos.entryVelvetUsd) / pos.entryVelvetUsd) * 100;
  const pnlPct = ((state.velvetUsd - pos.entryVelvetUsd) / pos.entryVelvetUsd) * 100;

  if (state.apy < cfg.exitApyMin) {
    return { kind: "exit", reason: `APY ${state.apy.toFixed(0)}% < mínimo ${cfg.exitApyMin}%` };
  }
  if (cfg.exitOnOutOfRange && (state.velvetUsd < pos.rangeLow || state.velvetUsd > pos.rangeHigh)) {
    return { kind: "exit", reason: "precio fuera de rango" };
  }
  if (movePct >= cfg.maxVelvetMovePct) {
    return { kind: "exit", reason: `VELVET se movió ${movePct.toFixed(1)}% (≥ ${cfg.maxVelvetMovePct}%)` };
  }
  if (pnlPct <= -cfg.stopLossPct) {
    return { kind: "exit", reason: `stop-loss ${pnlPct.toFixed(1)}%` };
  }
  if (pnlPct >= cfg.takeProfitPct) {
    return { kind: "exit", reason: `take-profit +${pnlPct.toFixed(1)}%` };
  }
  return { kind: "hold" };
}
