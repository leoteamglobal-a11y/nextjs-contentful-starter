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
 * Usa TickMath EXACTO (getSqrtRatioAtTick, enteros) y las fórmulas enteras de
 * LiquidityAmounts, igual que el contrato. La liquidez `L` se dimensiona por USD
 * (esa parte usa `Number`, no crítica); las cantidades para esa `L` son exactas.
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
  const sqrtLower = getSqrtRatioAtTick(p.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(p.tickUpper);
  const cur = p.sqrtPriceCurrentX96;

  const usd0 = p.velvetIsToken0 ? p.velvetUsd : 1;
  const usd1 = p.velvetIsToken0 ? 1 : p.velvetUsd;

  // Dimensionar L: cantidades para una L nominal, su valor USD, y escalar.
  const LNOM = 10n ** 18n;
  const nom = liquidityToAmounts(cur, sqrtLower, sqrtUpper, LNOM);
  const valNom = (Number(nom.amount0) / 10 ** p.dec0) * usd0 + (Number(nom.amount1) / 10 ** p.dec1) * usd1;
  if (!(valNom > 0)) {
    throw new Error("no pude dimensionar la posición (valor nominal <= 0)");
  }
  const scale = p.sizeUsd / valNom;
  const liquidity = BigInt(Math.max(0, Math.round(Number(LNOM) * scale)));

  const fin = liquidityToAmounts(cur, sqrtLower, sqrtUpper, liquidity);
  return { amount0Desired: fin.amount0, amount1Desired: fin.amount1 };
}

/** Aplica slippage (bps) a una cantidad base, hacia abajo (para amountMin). */
export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Cantidades esperadas (base) al retirar `liquidity` al precio actual (exacto). */
export function amountsForLiquidity(p: {
  sqrtPriceCurrentX96: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}): { amount0: bigint; amount1: bigint } {
  return liquidityToAmounts(
    p.sqrtPriceCurrentX96,
    getSqrtRatioAtTick(p.tickLower),
    getSqrtRatioAtTick(p.tickUpper),
    p.liquidity,
  );
}

// ---------------------------------------------------------------------------
// TickMath / LiquidityAmounts — enteros exactos (port de Uniswap V3)
// ---------------------------------------------------------------------------

const Q96 = 2n ** 96n;
export const MAX_TICK = 887272;
const MAX_UINT256 = 2n ** 256n - 1n;

/** amount0 para liquidez L entre sqrtA y sqrtB (base units, exacto). */
function getAmount0(sqrtA: bigint, sqrtB: bigint, L: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return ((L << 96n) * (sqrtB - sqrtA)) / sqrtB / sqrtA;
}

/** amount1 para liquidez L entre sqrtA y sqrtB (base units, exacto). */
function getAmount1(sqrtA: bigint, sqrtB: bigint, L: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (L * (sqrtB - sqrtA)) / Q96;
}

/** Cantidades (base) para liquidez L según dónde cae `cur` en [lower, upper]. */
function liquidityToAmounts(
  cur: bigint,
  lower: bigint,
  upper: bigint,
  L: bigint,
): { amount0: bigint; amount1: bigint } {
  let amount0 = 0n;
  let amount1 = 0n;
  if (cur <= lower) {
    amount0 = getAmount0(lower, upper, L);
  } else if (cur >= upper) {
    amount1 = getAmount1(lower, upper, L);
  } else {
    amount0 = getAmount0(cur, upper, L);
    amount1 = getAmount1(lower, cur, L);
  }
  return { amount0, amount1 };
}

/**
 * sqrtPriceX96 (Q64.96) para un tick — algoritmo entero exacto de Uniswap V3
 * TickMath.getSqrtRatioAtTick. Idéntico al on-chain.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = tick < 0 ? -tick : tick;
  if (absTick > MAX_TICK) throw new Error(`tick fuera de rango: ${tick}`);

  let ratio =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if (absTick & 0x2) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if (absTick & 0x4) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if (absTick & 0x8) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if (absTick & 0x10) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if (absTick & 0x20) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if (absTick & 0x40) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if (absTick & 0x80) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if (absTick & 0x100) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if (absTick & 0x200) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if (absTick & 0x400) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if (absTick & 0x800) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if (absTick & 0x1000) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if (absTick & 0x2000) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if (absTick & 0x4000) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if (absTick & 0x8000) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if (absTick & 0x10000) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if (absTick & 0x20000) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if (absTick & 0x40000) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if (absTick & 0x80000) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  // De Q128.128 a Q64.96, redondeando hacia arriba.
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}
