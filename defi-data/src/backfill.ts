// Backfill histórico (etapa 2).
//   npm run backfill -- --pools <id1,id2>              baja el chart de esos pools
//   npm run backfill -- --from-snapshot 2026-01-15     top pools por TVL del snapshot
//   npm run backfill -- --pools velvet,weth --fixture-dir fixtures/charts   (offline)
//
// Opciones: --limit N (default 25), --sleep MS (default 400), --data-dir, --threshold N
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchPoolChart } from "./defillama.js";
import { normalizeChart, summarizeHistory } from "./history.js";
import { readNormalizedSnapshot, writeHistory } from "./store.js";
import type { PersistenceSummary } from "./types.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickPools(): string[] {
  const explicit = arg("--pools");
  if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean);
  const snap = arg("--from-snapshot");
  if (snap) {
    const limit = Number(arg("--limit") ?? "25");
    const dataDir = arg("--data-dir") ?? "data";
    const rows = readNormalizedSnapshot(snap, dataDir);
    return rows
      .slice()
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, limit)
      .map((r) => r.pool);
  }
  throw new Error("indicá --pools <ids> o --from-snapshot <fecha>");
}

async function loadChart(pool: string, fixtureDir?: string): Promise<unknown> {
  if (fixtureDir) return JSON.parse(readFileSync(join(fixtureDir, `${pool}.json`), "utf8"));
  return fetchPoolChart(pool);
}

function verdict(s: PersistenceSummary): string {
  if (s.apyBaseMax < s.baseThreshold) return "❌ nunca yield real alto";
  if (s.apyDecayPct > 90 && s.apyBaseMean < s.baseThreshold) return "⚠️ espejismo (APY colapsó)";
  if (s.shareDaysAboveThreshold > 0.6 && s.alive) return "✅ yield real persistente";
  return "◻️ mixto";
}

async function main(): Promise<void> {
  const pools = pickPools();
  const fixtureDir = arg("--fixture-dir");
  const dataDir = arg("--data-dir") ?? "data";
  const sleepMs = Number(arg("--sleep") ?? "400");
  const threshold = Number(arg("--threshold") ?? "10");

  console.log(`== Backfill histórico — ${pools.length} pools ==${fixtureDir ? " (offline)" : ""}\n`);

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    try {
      const raw = await loadChart(pool, fixtureDir);
      const points = normalizeChart(raw);
      writeHistory(points, pool, dataDir);
      const s = summarizeHistory(pool, points, { baseThreshold: threshold });
      console.log(
        `${verdict(s)}  ${pool.slice(0, 18).padEnd(18)} ` +
          `${s.days}d  baseμ ${s.apyBaseMean.toFixed(1)}%  ` +
          `días≥${threshold}%: ${(s.shareDaysAboveThreshold * 100).toFixed(0)}%  ` +
          `APY decay ${s.apyDecayPct.toFixed(0)}%  TVL DD ${s.tvlDrawdownPct.toFixed(0)}%`,
      );
    } catch (e) {
      console.log(`error  ${pool}: ${e instanceof Error ? e.message : e}`);
    }
    if (!fixtureDir && i < pools.length - 1) await sleep(sleepMs); // cortesía con la API
  }

  console.log(`\nhistóricos guardados en ${dataDir}/history/*.jsonl`);
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
