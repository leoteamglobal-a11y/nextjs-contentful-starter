import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountsForLiquidity,
  applySlippageDown,
  computeCLAmounts,
  priceToTick,
  snapTick,
  tickToVelvetUsd,
  velvetUsdFromSqrt,
} from "../src/math.js";

/** sqrtPriceX96 para un precio de VELVET dado (VELVET=token0). */
function sqrtX96(velvetUsd: number, dec0: number, dec1: number): bigint {
  const priceRaw = velvetUsd * 10 ** (dec1 - dec0); // token1/token0 base
  return BigInt(Math.round(Math.sqrt(priceRaw) * 2 ** 96));
}

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

test("applySlippageDown resta el % correcto", () => {
  assert.equal(applySlippageDown(10_000n, 100), 9_900n); // 1%
  assert.equal(applySlippageDown(1_000_000n, 50), 995_000n); // 0.5%
});

test("computeCLAmounts: el valor USD reconstruido ≈ sizeUsd", () => {
  const dec0 = 18, dec1 = 6, velvetUsd = 0.41, sizeUsd = 100;
  const priceTick = priceToTick(velvetUsd, true, dec0, dec1);
  const tickLower = priceTick - 500;
  const tickUpper = priceTick + 500;
  const sqrtCur = sqrtX96(velvetUsd, dec0, dec1);
  const { amount0Desired, amount1Desired } = computeCLAmounts({
    sqrtPriceCurrentX96: sqrtCur, tickLower, tickUpper, sizeUsd,
    dec0, dec1, velvetIsToken0: true, velvetUsd,
  });
  const velvetUsdVal = (Number(amount0Desired) / 10 ** dec0) * velvetUsd; // token0=VELVET
  const usdcVal = Number(amount1Desired) / 10 ** dec1; // token1=USDC
  const total = velvetUsdVal + usdcVal;
  assert.ok(Math.abs(total - sizeUsd) / sizeUsd < 0.02, `total ${total} vs ${sizeUsd}`);
});

test("computeCLAmounts: precio en el borde inferior => casi todo token0", () => {
  const dec0 = 18, dec1 = 6, velvetUsd = 0.41;
  const priceTick = priceToTick(velvetUsd, true, dec0, dec1);
  // rango arranca en el precio actual => spCur == spLower => amount1 ~ 0
  const { amount1Desired } = computeCLAmounts({
    sqrtPriceCurrentX96: sqrtX96(velvetUsd, dec0, dec1),
    tickLower: priceTick, tickUpper: priceTick + 1000, sizeUsd: 100,
    dec0, dec1, velvetIsToken0: true, velvetUsd,
  });
  assert.equal(amount1Desired, 0n);
});

test("amountsForLiquidity devuelve no-negativos", () => {
  const dec0 = 18, dec1 = 6, velvetUsd = 0.41;
  const t = priceToTick(velvetUsd, true, dec0, dec1);
  const { amount0, amount1 } = amountsForLiquidity({
    sqrtPriceCurrentX96: sqrtX96(velvetUsd, dec0, dec1),
    tickLower: t - 500, tickUpper: t + 500, liquidity: 10n ** 15n,
  });
  assert.ok(amount0 >= 0n && amount1 >= 0n);
  assert.ok(amount0 > 0n || amount1 > 0n);
});
