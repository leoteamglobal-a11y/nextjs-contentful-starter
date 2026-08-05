// Reporte sobre un snapshot ya guardado.
//   npm run report                 -> usa el snapshot de hoy (UTC)
//   npm run report -- --date 2026-01-15
import { rankByRealYield, topMirages } from "./normalize.js";
import { readNormalizedSnapshot, todayUtc } from "./store.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function main(): void {
  const date = arg("--date") ?? todayUtc();
  const dataDir = arg("--data-dir") ?? "data";
  const rows = readNormalizedSnapshot(date, dataDir);

  console.log(`== Reporte ${date} (${rows.length} pools) ==\n`);

  console.log("YIELD REAL — top 15 (TVL ≥ $1M, con apyBase, sin espejismos):");
  for (const r of rankByRealYield(rows, { minTvlUsd: 1_000_000, requireApyBase: true, excludeMirage: true }).slice(0, 15)) {
    const basePct = ((r.apyBaseShare ?? 0) * 100).toFixed(0);
    console.log(
      `  ${(r.realYield ?? 0).toFixed(1).padStart(7)}%  ${r.symbol.padEnd(20)} ` +
        `${(r.project + "/" + r.chain).padEnd(28)} TVL $${fmt(r.tvlUsd).padStart(6)}  base ${basePct}%`,
    );
  }

  console.log("\nESTABLECOINS — top 10 por yield real (TVL ≥ $1M):");
  for (const r of rankByRealYield(rows, { minTvlUsd: 1_000_000, requireApyBase: true, excludeMirage: true, stableOnly: true }).slice(0, 10)) {
    console.log(`  ${(r.realYield ?? 0).toFixed(1).padStart(6)}%  ${r.symbol.padEnd(18)} ${r.project}/${r.chain}  TVL $${fmt(r.tvlUsd)}`);
  }

  console.log("\nESPEJISMOS — mayores APY que son casi todo incentivos (>90%, TVL ≥ $1M):");
  for (const r of topMirages(rows, 1_000_000).slice(0, 8)) {
    console.log(
      `  APY ${(r.apy ?? 0).toFixed(0).padStart(8)}%  (real solo ${(r.realYield ?? 0).toFixed(1)}%)  ` +
        `${r.symbol} ${r.project}/${r.chain}`,
    );
  }
}

main();
