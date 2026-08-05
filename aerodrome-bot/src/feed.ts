// Fuente de estado del pool.
//  - SimulatedFeed: genera estado sintético para probar toda la lógica.
//  - OnchainFeed (TODO): leería precio/tick del pool Slipstream vía viem + RPC de
//    Base, y APY/TVL de DefiLlama. No probado desde este entorno (egress bloqueado).
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { Config, SimConfig } from "./config.js";
import { velvetUsdFromSqrt } from "./math.js";
import type { PoolState } from "./types.js";

export interface PoolFeed {
  next(): Promise<PoolState>;
}

export class SimulatedFeed implements PoolFeed {
  private price: number;
  private apy: number;

  constructor(private cfg: SimConfig) {
    this.price = cfg.startPriceUsd;
    this.apy = cfg.startApy;
  }

  async next(): Promise<PoolState> {
    // Random walk del precio de VELVET.
    const vol = this.cfg.priceVolPct / 100;
    const change = (Math.random() * 2 - 1) * vol;
    this.price = Math.max(0.0001, this.price * (1 + change));

    // El APY decae (los incentivos se diluyen) con algo de ruido.
    this.apy = Math.max(5, this.apy - this.cfg.apyDecayPerTick + (Math.random() * 2 - 1) * 5);

    return {
      ts: Date.now(),
      velvetUsd: this.price,
      apy: this.apy,
      tvlUsd: 1_000_000,
    };
  }
}

// ---------------------------------------------------------------------------
// Feed on-chain: precio/tick del pool Slipstream (viem + RPC Base) + APY/TVL
// desde DefiLlama. No probado desde el entorno de desarrollo (egress bloqueado).
// ---------------------------------------------------------------------------

const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "unlocked", type: "bool" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Factory tipado del cliente (fija la chain para evitar choques de tipos). */
function makeBaseClient(rpcUrl: string) {
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}
type BaseClient = ReturnType<typeof makeBaseClient>;

interface TokenMeta {
  velvetIsToken0: boolean;
  dec0: number;
  dec1: number;
}

export class OnchainFeed implements PoolFeed {
  private client: BaseClient;
  private meta: TokenMeta | null = null;
  private apy = 0;
  private tvlUsd = 0;
  private lastApyFetch = 0;
  private readonly apyRefreshMs: number;
  private readonly baseSymbol: string;

  constructor(private cfg: Config) {
    if (!cfg.pool.address || /^0x0+$/.test(cfg.pool.address)) {
      throw new Error(
        "config.pool.address vacío. Poné la dirección del contrato del pool Slipstream (Basescan/Aerodrome).",
      );
    }
    this.client = makeBaseClient(cfg.rpcUrl);
    this.apyRefreshMs = cfg.onchain?.apyRefreshMs ?? 60_000;
    this.baseSymbol = (cfg.onchain?.baseSymbol ?? "VELVET").toUpperCase();
  }

  /** Lee token0/token1, decimales y símbolos una sola vez. */
  private async initMeta(): Promise<TokenMeta> {
    const pool = this.cfg.pool.address as `0x${string}`;
    const [token0, token1] = (await Promise.all([
      this.client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
      this.client.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
    ])) as [`0x${string}`, `0x${string}`];

    const [dec0, dec1, sym0] = await Promise.all([
      this.client.readContract({ address: token0, abi: ERC20_ABI, functionName: "decimals" }),
      this.client.readContract({ address: token1, abi: ERC20_ABI, functionName: "decimals" }),
      this.client.readContract({ address: token0, abi: ERC20_ABI, functionName: "symbol" }),
    ]);

    const velvetIsToken0 = String(sym0).toUpperCase().includes(this.baseSymbol);
    this.meta = { velvetIsToken0, dec0: Number(dec0), dec1: Number(dec1) };
    return this.meta;
  }

  /** APY/TVL actuales del pool desde DefiLlama (cacheado). */
  private async refreshApy(): Promise<void> {
    const now = Date.now();
    if (now - this.lastApyFetch < this.apyRefreshMs && this.lastApyFetch !== 0) return;
    this.lastApyFetch = now;
    const res = await fetch("https://yields.llama.fi/pools");
    if (!res.ok) throw new Error(`DefiLlama /pools HTTP ${res.status}`);
    const json = (await res.json()) as { data: Array<{ pool: string; apy?: number; tvlUsd?: number }> };
    const p = json.data.find((x) => x.pool === this.cfg.pool.id);
    if (p) {
      this.apy = p.apy ?? this.apy;
      this.tvlUsd = p.tvlUsd ?? this.tvlUsd;
    }
  }

  async next(): Promise<PoolState> {
    const meta = this.meta ?? (await this.initMeta());
    const pool = this.cfg.pool.address as `0x${string}`;

    const slot0 = (await this.client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "slot0",
    })) as readonly [bigint, number, number, number, number, boolean];
    const sqrtPriceX96 = slot0[0];
    const velvetUsd = velvetUsdFromSqrt(sqrtPriceX96, meta.velvetIsToken0, meta.dec0, meta.dec1);

    await this.refreshApy();

    return { ts: Date.now(), velvetUsd, apy: this.apy, tvlUsd: this.tvlUsd };
  }
}
