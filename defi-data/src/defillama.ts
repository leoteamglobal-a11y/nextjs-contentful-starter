// Fuente: DefiLlama Yields. Snapshot actual de todos los pools.
import type { RawPool } from "./types.js";

const POOLS_URL = "https://yields.llama.fi/pools";

/** Baja el snapshot actual de pools de DefiLlama. */
export async function fetchPools(): Promise<RawPool[]> {
  const res = await fetch(POOLS_URL);
  if (!res.ok) throw new Error(`DefiLlama /pools HTTP ${res.status}`);
  const json = (await res.json()) as { status?: string; data?: RawPool[] };
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("respuesta inesperada de DefiLlama (sin data[])");
  }
  return json.data;
}

/**
 * Histórico de un pool (apy/apyBase/apyReward/tvl por día). Para el backfill de
 * la etapa 2. Endpoint: /chart/{poolId}.
 */
export async function fetchPoolChart(poolId: string): Promise<unknown> {
  const res = await fetch(`https://yields.llama.fi/chart/${poolId}`);
  if (!res.ok) throw new Error(`DefiLlama /chart HTTP ${res.status}`);
  return res.json();
}
