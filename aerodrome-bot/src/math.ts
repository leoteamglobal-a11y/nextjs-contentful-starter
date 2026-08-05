// Matemática de precios/ticks (pura, testeable). Es la parte más riesgosa del
// bot, así que vive aislada y con tests (test/math.test.ts).

/** Precio humano token1/token0 a partir de sqrtPriceX96. Aproximado (usa Number). */
export function token1PerToken0(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // token1/token0 en unidades base
  return ratio * 10 ** (dec0 - dec1);
}

/** Precio de VELVET en el quote (≈USD) a partir de sqrtPriceX96. */
export function velvetUsdFromSqrt(
  sqrtPriceX96: bigint,
  velvetIsToken0: boolean,
  dec0: number,
  dec1: number,
): number {
  const p1p0 = token1PerToken0(sqrtPriceX96, dec0, dec1);
  return velvetIsToken0 ? p1p0 : 1 / p1p0;
}

/** Convierte un precio de VELVET (USD) al tick correspondiente. */
export function priceToTick(velvetUsd: number, velvetIsToken0: boolean, decV: number, decU: number): number {
  // raw = precio token1/token0 en unidades base = 1.0001^tick
  const raw = velvetIsToken0 ? velvetUsd * 10 ** (decU - decV) : 10 ** (decV - decU) / velvetUsd;
  return Math.round(Math.log(raw) / Math.log(1.0001));
}

/** Inversa de priceToTick: precio de VELVET (USD) a partir de un tick. */
export function tickToVelvetUsd(tick: number, velvetIsToken0: boolean, decV: number, decU: number): number {
  const raw = 1.0001 ** tick;
  return velvetIsToken0 ? raw * 10 ** (decV - decU) : 10 ** (decV - decU) / raw;
}

/** Ajusta un tick al múltiplo inferior de tickSpacing. */
export function snapTick(tick: number, spacing: number): number {
  return Math.floor(tick / spacing) * spacing;
}

/**
 * Cantidades óptimas de token0/token1 para abrir una posición de liquidez
 * concentrada de ~`sizeUsd`, según dónde cae el precio actual en el rango
 * [tickLower, tickUpper]. Usa la matemática de Uniswap V3 (sqrt de precios).
 *
 * Devuelve las cantidades DESEADAS en unidades base (bigint). Nota: usa `Number`
 * internamente (aproximado); el contrato recalcula la liquidez exacta. Para
 * tokens de 18 decimales hay pérdida de precisión en los dígitos bajos, pero la
 * magnitud y el ratio son correctos.
 */
export function computeCLAmounts(p: {
  sqrtPriceCurrentX96: bigint;
  tickLower: number;
  tickUpper: number;
  sizeUsd: number;
  dec0: number;
  dec1: number;
  velvetIsToken0: boolean;
  velvetUsd: number;
}): { amount0Desired: bigint; amount1Desired: bigint } {
  const spCur = Number(p.sqrtPriceCurrentX96) / 2 ** 96; // sqrt(price_raw token1/token0 base)
  const spLower = 1.0001 ** (p.tickLower / 2);
  const spUpper = 1.0001 ** (p.tickUpper / 2);
  const spC = Math.min(Math.max(spCur, spLower), spUpper); // clamp al rango

  // Cantidades por unidad de liquidez (unidades base).
  const a0PerL = spUpper > spC ? (spUpper - spC) / (spC * spUpper) : 0; // 1/spC - 1/spUpper
  const a1PerL = spC - spLower;

  // Valor en USD por unidad de liquidez.
  const usd0 = p.velvetIsToken0 ? p.velvetUsd : 1;
  const usd1 = p.velvetIsToken0 ? 1 : p.velvetUsd;
  const valuePerL = (a0PerL / 10 ** p.dec0) * usd0 + (a1PerL / 10 ** p.dec1) * usd1;
  if (!(valuePerL > 0)) {
    throw new Error("no pude dimensionar la posición (valuePerL <= 0)");
  }

  const L = p.sizeUsd / valuePerL;
  const amount0Desired = BigInt(Math.max(0, Math.round(a0PerL * L)));
  const amount1Desired = BigInt(Math.max(0, Math.round(a1PerL * L)));
  return { amount0Desired, amount1Desired };
}

/** Aplica slippage (bps) a una cantidad base, hacia abajo (para amountMin). */
export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Cantidades esperadas (base) al retirar `liquidity` al precio actual. */
export function amountsForLiquidity(p: {
  sqrtPriceCurrentX96: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}): { amount0: bigint; amount1: bigint } {
  const spCur = Number(p.sqrtPriceCurrentX96) / 2 ** 96;
  const spLower = 1.0001 ** (p.tickLower / 2);
  const spUpper = 1.0001 ** (p.tickUpper / 2);
  const spC = Math.min(Math.max(spCur, spLower), spUpper);
  const L = Number(p.liquidity);
  const a0 = spUpper > spC ? (L * (spUpper - spC)) / (spC * spUpper) : 0;
  const a1 = L * (spC - spLower);
  return {
    amount0: BigInt(Math.max(0, Math.round(a0))),
    amount1: BigInt(Math.max(0, Math.round(a1))),
  };
}
