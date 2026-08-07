// Corre el backtest comparando estrategias sobre un universo.
//   npm run backtest -- --universe fixtures/universe.json --start 2025-01-01 --end 2026-01-01
import { readFileSync } from "node:fs";
import {
  chaseTopApy,
  qualityStrategy,
  runBacktest,
  topRealYield,
  type BacktestResult,
  type PoolHistory,
} from "./backtest.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function line(name: string, r: BacktestResult): string {
  return (
    `  ${name.padEnd(26)} ` +
    `final $${r.finalCapital.toFixed(0).padStart(6)}  ` +
    `retorno ${(r.totalReturnPct >= 0 ? "+" : "") + r.totalReturnPct.toFixed(1)}%  ` +
    `CAGR ${(r.cagrPct >= 0 ? "+" : "") + r.cagrPct.toFixed(1)}%  ` +
    `maxDD ${r.maxDrawdownPct.toFixed(1)}%`
  );
}

function main(): void {
  const universePath = arg("--universe") ?? "fixtures/universe.json";
  const start = arg("--start") ?? "2025-01-01";
  const end = arg("--end") ?? "2026-01-01";
  const capital0 = Number(arg("--capital") ?? "1000");
  const universe = JSON.parse(readFileSync(universePath, "utf8")) as PoolHistory[];

  console.log(`== Backtest ${start} → ${end}  ($${capital0}, ${universe.length} pools, sin sesgo de supervivencia) ==\n`);

  const common = { start, end, capital0, rebalanceEveryDays: 30 };
  const results: Array<[string, BacktestResult]> = [
    ["Perseguir APY más alto", runBacktest(universe, { ...common, strategy: chaseTopApy(2) })],
    ["Top yield real (sin espejismos)", runBacktest(universe, { ...common, strategy: topRealYield(2) })],
    ["Screen de calidad", runBacktest(universe, { ...common, strategy: qualityStrategy(2, { minAgeDays: 0 }) })],
  ];

  for (const [name, r] of results) console.log(line(name, r));

  console.log(
    "\nLección: perseguir APY alto arrastra los pools que MUEREN (drawdown enorme);\n" +
      "el screen de calidad evita los espejismos y compone de forma estable.",
  );
}

main();
