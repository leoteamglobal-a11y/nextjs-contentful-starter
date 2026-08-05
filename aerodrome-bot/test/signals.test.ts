import assert from "node:assert/strict";
import { test } from "node:test";
import type { SignalConfig } from "../src/config.js";
import { decide } from "../src/signals.js";
import { EMPTY_POSITION, type PoolState, type Position } from "../src/types.js";

const cfg: SignalConfig = {
  enterApyMin: 80,
  exitApyMin: 30,
  maxVelvetMovePct: 25,
  rangeWidthPct: 15,
  exitOnOutOfRange: true,
  stopLossPct: 20,
  takeProfitPct: 30,
};

const st = (velvetUsd: number, apy: number): PoolState => ({ ts: 0, velvetUsd, apy, tvlUsd: 0 });
const pos = (over: Partial<Position> = {}): Position => ({
  active: true,
  entryTs: 0,
  entryVelvetUsd: 1,
  entryApy: 100,
  rangeLow: 0.85,
  rangeHigh: 1.15,
  sizeUsd: 100,
  ...over,
});

test("entra si APY alto y sin posición", () => {
  assert.equal(decide(st(1, 100), { ...EMPTY_POSITION }, cfg).kind, "enter");
});

test("no entra si APY bajo", () => {
  assert.equal(decide(st(1, 50), { ...EMPTY_POSITION }, cfg).kind, "hold");
});

test("sale si APY cae bajo el mínimo", () => {
  assert.equal(decide(st(1, 20), pos(), cfg).kind, "exit");
});

test("sale si el precio sale del rango", () => {
  assert.equal(decide(st(1.2, 100), pos(), cfg).kind, "exit");
});

test("sale por stop-loss (rango amplio)", () => {
  assert.equal(decide(st(0.79, 100), pos({ rangeLow: 0.5, rangeHigh: 2 }), cfg).kind, "exit");
});

test("mantiene dentro de rango y sin gatillos", () => {
  assert.equal(decide(st(1.02, 100), pos({ rangeLow: 0.5, rangeHigh: 2 }), cfg).kind, "hold");
});

const cfgInc: SignalConfig = { ...cfg, increaseApyMin: 90, increaseStepUsd: 50, maxPositionUsd: 200 };

test("agrega liquidez si APY alto, en rango y con margen", () => {
  const a = decide(st(1.02, 120), pos({ rangeLow: 0.5, rangeHigh: 2, sizeUsd: 100 }), cfgInc);
  assert.equal(a.kind, "increase");
  if (a.kind === "increase") assert.equal(a.addUsd, 50);
});

test("no agrega si ya está en el tope de tamaño", () => {
  const a = decide(st(1.02, 120), pos({ rangeLow: 0.5, rangeHigh: 2, sizeUsd: 200 }), cfgInc);
  assert.equal(a.kind, "hold");
});

test("no agrega si el APY no alcanza el umbral de aporte", () => {
  const a = decide(st(1.02, 85), pos({ rangeLow: 0.5, rangeHigh: 2, sizeUsd: 100 }), cfgInc);
  assert.equal(a.kind, "hold");
});

test("el aporte no supera el tope (se recorta)", () => {
  const a = decide(st(1.02, 120), pos({ rangeLow: 0.5, rangeHigh: 2, sizeUsd: 180 }), cfgInc);
  assert.equal(a.kind, "increase");
  if (a.kind === "increase") assert.equal(a.addUsd, 20); // 200 - 180
});

test("sin config de increase, se mantiene", () => {
  const a = decide(st(1.02, 120), pos({ rangeLow: 0.5, rangeHigh: 2, sizeUsd: 100 }), cfg);
  assert.equal(a.kind, "hold");
});

const cfgRepo: SignalConfig = { ...cfg, reposition: true, repositionApyMin: 80 };

test("reposiciona si sale de rango y el APY sigue alto", () => {
  const a = decide(st(1.2, 100), pos({ rangeLow: 0.85, rangeHigh: 1.15 }), cfgRepo);
  assert.equal(a.kind, "reposition");
  if (a.kind === "reposition") {
    // rango nuevo centrado en el precio actual (±rangeWidthPct)
    assert.ok(a.rangeLow < 1.2 && a.rangeHigh > 1.2);
  }
});

test("NO reposiciona si el APY es bajo (sale)", () => {
  const a = decide(st(1.3, 25), pos({ rangeLow: 0.85, rangeHigh: 1.15 }), cfgRepo);
  assert.equal(a.kind, "exit"); // APY < exitApyMin gana
});

test("fuera de rango con TP alcanzado => toma ganancia (no reposiciona)", () => {
  // pnl +35% (>= TP 30) aunque reposition esté on
  const a = decide(st(1.35, 100), pos({ rangeLow: 0.85, rangeHigh: 1.15 }), cfgRepo);
  assert.equal(a.kind, "exit");
});

test("fuera de rango con reposition off => sale", () => {
  const a = decide(st(1.2, 100), pos({ rangeLow: 0.85, rangeHigh: 1.15 }), cfg);
  assert.equal(a.kind, "exit");
});

const cfgCollect: SignalConfig = { ...cfg, collectFeesEverySecs: 3600 };

test("cobra fees si pasó el intervalo", () => {
  const p = pos({ rangeLow: 0.5, rangeHigh: 2, entryTs: 0, lastFeeCollectTs: 0 });
  const a = decide({ ts: 4000 * 1000, velvetUsd: 1.0, apy: 100, tvlUsd: 0 }, p, cfgCollect);
  assert.equal(a.kind, "collect");
});

test("no cobra antes del intervalo", () => {
  const p = pos({ rangeLow: 0.5, rangeHigh: 2, entryTs: 0, lastFeeCollectTs: 0 });
  const a = decide({ ts: 1000 * 1000, velvetUsd: 1.0, apy: 100, tvlUsd: 0 }, p, cfgCollect);
  assert.equal(a.kind, "hold");
});

test("sin config de collect, no cobra", () => {
  const p = pos({ rangeLow: 0.5, rangeHigh: 2, entryTs: 0, lastFeeCollectTs: 0 });
  const a = decide({ ts: 999999 * 1000, velvetUsd: 1.0, apy: 100, tvlUsd: 0 }, p, cfg);
  assert.equal(a.kind, "hold");
});
