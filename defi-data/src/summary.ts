// Resumen de persistencia de un pool.
//   npm run summary -- --pool <id>                 (lee data/history/<id>.jsonl)
//   npm run summary -- --pool velvet --fixture fixtures/charts/velvet.json
import { readFileSync } from "node:fs";
import { normalizeChart, summarizeHistory } from "./history.js";
import { readHistory } from "./store.js";
import type { ChartPoint } from "./types.js";

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
  const pool = arg("--pool");
  if (!pool) throw new Error("indicá --pool <id>");
  const fixture = arg("--fixture");
  const threshold = Number(arg("--threshold") ?? "10");
  const dataDir = arg("--data-dir") ?? "data";

  let points: ChartPoint[];
  if (fixture) points = normalizeChart(JSON.parse(readFileSync(fixture, "utf8")));
  else points = readHistory(pool, dataDir);

  const s = summarizeHistory(pool, points, { baseThreshold: threshold });

  console.log(`== Persistencia — ${pool} ==`);
  console.log(`período: ${s.first} → ${s.last}  (${s.days} días)`);
  console.log("");
  console.log("YIELD REAL (apyBase):");
  console.log(`  media ${s.apyBaseMean.toFixed(2)}%  mediana ${s.apyBaseMedian.toFixed(2)}%  ` +
    `min ${s.apyBaseMin.toFixed(2)}%  max ${s.apyBaseMax.toFixed(2)}%  σ ${s.apyBaseStdev.toFixed(2)}`);
  console.log(`  días con apyBase ≥ ${threshold}%: ${s.daysApyBaseAboveThreshold}/${s.days} ` +
    `(${(s.shareDaysAboveThreshold * 100).toFixed(0)}%)  ← PERSISTENCIA`);
  console.log(`  incentivos promedio: ${(s.incentiveShareMean * 100).toFixed(0)}% del APY`);
  console.log("");
  console.log("COLAPSO DEL APY (señal de espejismo):");
  console.log(`  APY pico ${fmt(s.apyPeak)}%  →  último ${s.apyLast.toFixed(1)}%  (caída ${s.apyDecayPct.toFixed(1)}%)`);
  console.log("");
  console.log("SUPERVIVENCIA:");
  console.log(`  TVL pico $${fmt(s.tvlPeakUsd)}  →  último $${fmt(s.tvlLastUsd)}  (drawdown ${s.tvlDrawdownPct.toFixed(0)}%)`);
  console.log(`  ¿vivo? ${s.alive ? "sí" : "NO"}`);
  console.log("");

  // Veredicto
  let v: string;
  if (s.apyBaseMax < threshold) v = "❌ NUNCA tuvo yield real alto — el APY siempre fue incentivos.";
  else if (s.apyDecayPct > 90 && s.apyBaseMean < threshold) v = "⚠️ ESPEJISMO — el APY colapsó y el yield real fue bajo.";
  else if (s.shareDaysAboveThreshold > 0.6 && s.alive) v = "✅ SOSTENIBLE — yield real alto la mayor parte del tiempo, y sigue vivo.";
  else v = "◻️ MIXTO — evaluar con más contexto (eventos, unlocks).";
  console.log(`VEREDICTO: ${v}`);
}

main();
