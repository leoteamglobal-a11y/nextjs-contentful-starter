// Fuente de estado del pool.
//  - SimulatedFeed: genera estado sintético para probar toda la lógica.
//  - OnchainFeed (TODO): leería precio/tick del pool Slipstream vía viem + RPC de
//    Base, y APY/TVL de DefiLlama. No probado desde este entorno (egress bloqueado).
import type { SimConfig } from "./config.js";
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
