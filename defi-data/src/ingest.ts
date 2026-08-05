// Job de ingesta diaria.
//   npm run ingest                          -> baja DefiLlama en vivo (requiere red)
//   npm run ingest -- --fixture <archivo>   -> usa un JSON local (sin red, para probar)
//   npm run ingest -- --date 2026-01-15     -> fuerza la fecha del snapshot
//   npm run ingest -- --force               -> permite re-escribir el día
import { readFileSync } from "node:fs";
import { fetchPools } from "./defillama.js";
import { normalizePool, rankByRealYield } from "./normalize.js";
import { todayUtc, writeNormalizedSnapshot, writeRawSnapshot } from "./store.js";
import type { RawPool } from "./types.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (flag: string) => process.argv.includes(flag);

async function main(): Promise<void> {
  const fixture = arg("--fixture");
  const date = arg("--date") ?? todayUtc();
  const force = hasFlag("--force");
  const dataDir = arg("--data-dir") ?? "data";

  console.log(`== Ingesta DeFi Yields — ${date} ==`);

  let pools: RawPool[];
  if (fixture) {
    console.log(`fuente: fixture ${fixture}`);
    const parsed = JSON.parse(readFileSync(fixture, "utf8"));
    pools = Array.isArray(parsed) ? parsed : parsed.data;
  } else {
    console.log("fuente: DefiLlama /pools (en vivo)");
    pools = await fetchPools();
  }

  const rows = pools.map((p) => normalizePool(p, date));

  const wroteRaw = writeRawSnapshot(pools, date, dataDir, force);
  const wroteNorm = writeNormalizedSnapshot(rows, date, dataDir, force);
  if (!wroteRaw || !wroteNorm) {
    console.log(`(ya existía el snapshot de ${date}; usá --force para re-escribir)`);
  }

  // Resumen inmediato: distinguir yield real de espejismo.
  const withBase = rows.filter((r) => r.apyBase != null).length;
  const mirages = rows.filter((r) => r.isMirage).length;
  console.log(`pools: ${rows.length} | con apyBase: ${withBase} | espejismos (>90% incentivos): ${mirages}`);

  const top = rankByRealYield(rows, {
    minTvlUsd: 1_000_000,
    requireApyBase: true,
    excludeMirage: true,
  }).slice(0, 8);
  console.log(`\nTop 8 por YIELD REAL (TVL ≥ $1M, sin espejismos):`);
  for (const r of top) {
    const basePct = ((r.apyBaseShare ?? 0) * 100).toFixed(0);
    console.log(
      `  ${(r.realYield ?? 0).toFixed(1).padStart(6)}%  ${r.symbol} ` +
        `(${r.project}/${r.chain})  TVL $${fmt(r.tvlUsd)}  base ${basePct}%`,
    );
  }
  console.log(`\nsnapshot guardado en ${dataDir}/raw/${date}.jsonl y ${dataDir}/normalized/${date}.jsonl`);
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
