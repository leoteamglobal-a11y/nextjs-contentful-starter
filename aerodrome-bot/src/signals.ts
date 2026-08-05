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

  // Fuera de rango: tomar ganancia / cortar pérdida / reposicionar / o salir.
  const outOfRange = state.velvetUsd < pos.rangeLow || state.velvetUsd > pos.rangeHigh;
  if (cfg.exitOnOutOfRange && outOfRange) {
    if (pnlPct >= cfg.takeProfitPct) {
      return { kind: "exit", reason: `take-profit +${pnlPct.toFixed(1)}%` };
    }
    if (pnlPct <= -cfg.stopLossPct) {
      return { kind: "exit", reason: `stop-loss ${pnlPct.toFixed(1)}%` };
    }
    if (cfg.reposition && state.apy >= (cfg.repositionApyMin ?? cfg.enterApyMin)) {
      const half = cfg.rangeWidthPct / 100;
      return {
        kind: "reposition",
        rangeLow: state.velvetUsd * (1 - half),
        rangeHigh: state.velvetUsd * (1 + half),
      };
    }
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

  // En rango y sin gatillos de salida: si el APY sigue atractivo y hay margen,
  // AGREGAR liquidez al mismo NFT (increaseLiquidity) en vez de no hacer nada.
  if (cfg.maxPositionUsd && cfg.increaseStepUsd && pos.sizeUsd < cfg.maxPositionUsd) {
    const minApy = cfg.increaseApyMin ?? cfg.enterApyMin;
    if (state.apy >= minApy) {
      const addUsd = Math.min(cfg.increaseStepUsd, cfg.maxPositionUsd - pos.sizeUsd);
      if (addUsd > 0) return { kind: "increase", addUsd };
    }
  }

  return { kind: "hold" };
}
