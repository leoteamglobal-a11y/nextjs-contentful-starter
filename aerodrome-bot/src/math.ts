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
