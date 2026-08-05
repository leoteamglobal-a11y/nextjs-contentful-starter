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
