// Ejecución: paper (simulada) vs live (Aerodrome Slipstream real).
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  maxUint128,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { Config } from "./config.js";
import { priceToTick, snapTick } from "./math.js";
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

// ---------------------------------------------------------------------------
// Live — Aerodrome Slipstream (Base)
//
// ⚠️  UNTESTED contra la red real (egress bloqueado en desarrollo). Antes de
//     usar con montos serios, VALIDÁ con una posición mínima y verificá en un
//     explorador: dirección del position manager, tickSpacing, matemática de
//     ticks, y las cantidades. La clave privada se lee SOLO de env PRIVATE_KEY.
// ---------------------------------------------------------------------------

const POOL_READ_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const PM_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "tickSpacing", type: "int24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "sqrtPriceX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "decreaseLiquidity",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

function makePublic(rpcUrl: string) {
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}
function makeWallet(rpcUrl: string, account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({ account, chain: base, transport: http(rpcUrl) });
}
type Pub = ReturnType<typeof makePublic>;
type Wal = ReturnType<typeof makeWallet>;

interface LiveMeta {
  token0: `0x${string}`;
  token1: `0x${string}`;
  dec0: number;
  dec1: number;
  velvetIsToken0: boolean;
}

export class LiveExecutor implements Executor {
  private pub: Pub;
  private wallet: Wal;
  private account: ReturnType<typeof privateKeyToAccount>;
  private meta: LiveMeta | null = null;
  private readonly pm: `0x${string}`;
  private readonly pool: `0x${string}`;
  private readonly tickSpacing: number;
  private readonly slippageBps: number;
  private readonly deadlineSecs: number;
  private readonly baseSymbol: string;

  constructor(private cfg: Config) {
    if (!cfg.live) throw new Error("falta la sección [live] en el config.");
    const pk = process.env.PRIVATE_KEY;
    if (!pk) throw new Error("falta PRIVATE_KEY en el entorno (nunca en el archivo de config).");
    this.account = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
    this.pub = makePublic(cfg.rpcUrl);
    this.wallet = makeWallet(cfg.rpcUrl, this.account);
    this.pm = cfg.live.positionManager as `0x${string}`;
    this.pool = cfg.pool.address as `0x${string}`;
    this.tickSpacing = cfg.live.tickSpacing;
    this.slippageBps = cfg.live.slippageBps;
    this.deadlineSecs = cfg.live.deadlineSecs ?? 600;
    this.baseSymbol = (cfg.onchain?.baseSymbol ?? "VELVET").toUpperCase();
    console.warn(`[LIVE] wallet ${this.account.address} | pool ${this.pool} | pm ${this.pm}`);
    console.warn("[LIVE] ⚠️ código no probado contra la red — empezá con un monto mínimo.");
  }

  private async initMeta(): Promise<LiveMeta> {
    const [token0, token1] = (await Promise.all([
      this.pub.readContract({ address: this.pool, abi: POOL_READ_ABI, functionName: "token0" }),
      this.pub.readContract({ address: this.pool, abi: POOL_READ_ABI, functionName: "token1" }),
    ])) as [`0x${string}`, `0x${string}`];
    const [dec0, dec1, sym0] = await Promise.all([
      this.pub.readContract({ address: token0, abi: ERC20_ABI, functionName: "decimals" }),
      this.pub.readContract({ address: token1, abi: ERC20_ABI, functionName: "decimals" }),
      this.pub.readContract({ address: token0, abi: ERC20_ABI, functionName: "symbol" }),
    ]);
    const velvetIsToken0 = String(sym0).toUpperCase().includes(this.baseSymbol);
    this.meta = { token0, token1, dec0: Number(dec0), dec1: Number(dec1), velvetIsToken0 };
    return this.meta;
  }

  private async ensureAllowance(token: `0x${string}`, amount: bigint): Promise<void> {
    const current = (await this.pub.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, this.pm],
    })) as bigint;
    if (current >= amount) return;
    const { request } = await this.pub.simulateContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.pm, maxUint128],
      account: this.account,
    });
    const hash = await this.wallet.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash });
    console.log(`[LIVE] approve ${token} ok (${hash})`);
  }

  async enter(state: PoolState, action: Extract<Action, { kind: "enter" }>, sizeUsd: number): Promise<Position> {
    const meta = this.meta ?? (await this.initMeta());
    const { velvetIsToken0, dec0, dec1, token0, token1 } = meta;
    const decV = velvetIsToken0 ? dec0 : dec1;
    const decU = velvetIsToken0 ? dec1 : dec0;

    // Rango -> ticks (ordenados y snapeados al tickSpacing).
    const tA = snapTick(priceToTick(action.rangeLow, velvetIsToken0, decV, decU), this.tickSpacing);
    const tB = snapTick(priceToTick(action.rangeHigh, velvetIsToken0, decV, decU), this.tickSpacing);
    const tickLower = Math.min(tA, tB);
    const tickUpper = Math.max(tA, tB);

    // Cantidades: mitad USD por lado (el manager toma la proporción del rango).
    const half = sizeUsd / 2;
    const usdcBase = parseUnits(half.toFixed(decU), decU);
    const velvetBase = parseUnits((half / state.velvetUsd).toFixed(decV), decV);
    const [amount0Desired, amount1Desired] = velvetIsToken0 ? [velvetBase, usdcBase] : [usdcBase, velvetBase];

    await this.ensureAllowance(token0, amount0Desired);
    await this.ensureAllowance(token1, amount1Desired);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + this.deadlineSecs);
    const params = {
      token0,
      token1,
      tickSpacing: this.tickSpacing,
      tickLower,
      tickUpper,
      amount0Desired,
      amount1Desired,
      // NOTA: mins en 0 => sin protección de slippage en el mint. Aceptable solo
      // para pruebas con montos mínimos. TODO: calcular mins reales del rango.
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: this.account.address,
      deadline,
      sqrtPriceX96: 0n,
    };

    const { request, result } = await this.pub.simulateContract({
      address: this.pm,
      abi: PM_ABI,
      functionName: "mint",
      args: [params],
      account: this.account,
    });
    const [tokenId, liquidity] = result as readonly [bigint, bigint, bigint, bigint];
    const hash = await this.wallet.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash });

    console.log(
      `[LIVE] ENTER tokenId ${tokenId} liq ${liquidity} ticks [${tickLower},${tickUpper}] ` +
        `~$${sizeUsd} | tx ${hash}`,
    );
    return {
      active: true,
      entryTs: state.ts,
      entryVelvetUsd: state.velvetUsd,
      entryApy: state.apy,
      rangeLow: action.rangeLow,
      rangeHigh: action.rangeHigh,
      sizeUsd,
      tokenId,
      liquidity,
    };
  }

  async exit(pos: Position, state: PoolState, reason: string): Promise<number> {
    const meta = this.meta ?? (await this.initMeta());
    if (pos.tokenId === undefined || pos.liquidity === undefined) {
      throw new Error("posición live sin tokenId/liquidity");
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + this.deadlineSecs);

    // 1) Retirar toda la liquidez.
    const dec = await this.pub.simulateContract({
      address: this.pm,
      abi: PM_ABI,
      functionName: "decreaseLiquidity",
      args: [{ tokenId: pos.tokenId, liquidity: pos.liquidity, amount0Min: 0n, amount1Min: 0n, deadline }],
      account: this.account,
    });
    const decHash = await this.wallet.writeContract(dec.request);
    await this.pub.waitForTransactionReceipt({ hash: decHash });

    // 2) Cobrar principal + fees.
    const col = await this.pub.simulateContract({
      address: this.pm,
      abi: PM_ABI,
      functionName: "collect",
      args: [
        { tokenId: pos.tokenId, recipient: this.account.address, amount0Max: maxUint128, amount1Max: maxUint128 },
      ],
      account: this.account,
    });
    const [amount0, amount1] = col.result as readonly [bigint, bigint];
    const colHash = await this.wallet.writeContract(col.request);
    await this.pub.waitForTransactionReceipt({ hash: colHash });

    // Estimar USD recibido.
    const amt0 = Number(formatUnits(amount0, meta.dec0));
    const amt1 = Number(formatUnits(amount1, meta.dec1));
    const usdcOut = meta.velvetIsToken0 ? amt1 : amt0;
    const velvetOut = meta.velvetIsToken0 ? amt0 : amt1;
    const proceeds = usdcOut + velvetOut * state.velvetUsd;
    const pnl = proceeds - pos.sizeUsd;

    console.log(
      `[LIVE] EXIT (${reason}) tokenId ${pos.tokenId} -> ~$${proceeds.toFixed(2)} ` +
        `(PnL ~$${pnl.toFixed(2)}) | tx ${colHash}`,
    );
    return pnl;
  }
}
