import assert from "node:assert/strict";
import { test } from "node:test";
import { priceToTick, snapTick, tickToVelvetUsd, velvetUsdFromSqrt } from "../src/math.js";

const decV = 18; // VELVET
const decU = 6; // USDC

test("priceToTick ↔ tickToVelvetUsd round-trip (VELVET = token0)", () => {
  for (const price of [0.05, 0.41, 1.5, 12.3]) {
    const tick = priceToTick(price, true, decV, decU);
    const back = tickToVelvetUsd(tick, true, decV, decU);
    assert.ok(Math.abs(back - price) / price < 0.001, `price ${price} -> ${back}`);
  }
});

test("priceToTick ↔ tickToVelvetUsd round-trip (VELVET = token1)", () => {
  for (const price of [0.05, 0.41, 1.5, 12.3]) {
    const tick = priceToTick(price, false, decV, decU);
    const back = tickToVelvetUsd(tick, false, decV, decU);
    assert.ok(Math.abs(back - price) / price < 0.001, `price ${price} -> ${back}`);
  }
});

test("orden de ticks según el token de VELVET", () => {
  // token0: precio mayor => tick mayor
  assert.ok(priceToTick(0.3, true, decV, decU) < priceToTick(0.5, true, decV, decU));
  // token1: precio mayor => tick MENOR (invertido)
  assert.ok(priceToTick(0.3, false, decV, decU) > priceToTick(0.5, false, decV, decU));
});

test("snapTick ajusta al múltiplo inferior", () => {
  assert.equal(snapTick(105, 10), 100);
  assert.equal(snapTick(-105, 10), -110);
  assert.equal(snapTick(7, 1), 7);
});

test("velvetUsdFromSqrt: precio 1 con mismos decimales", () => {
  const q96 = 2n ** 96n; // sqrtPriceX96 para precio token1/token0 = 1
  const p = velvetUsdFromSqrt(q96, true, 18, 18);
  assert.ok(Math.abs(p - 1) < 1e-6, `esperaba ~1, dio ${p}`);
});
