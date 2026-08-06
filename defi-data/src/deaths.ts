// Detector de pools muertos (etapa 3): compara dos snapshots normalizados y
// registra eventos `death` para los pools que colapsaron. Es la corrección del
// sesgo de supervivencia — sin esto, los backtests mienten.
//   npm run deaths -- --prev 2026-01-01 --curr 2026-01-15
import { appendEvents, detectDeaths } from "./events.js";
import { readNormalizedSnapshot } from "./store.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const prevDate = arg("--prev");
  const currDate = arg("--curr");
  if (!prevDate || !currDate) throw new Error("indicá --prev <fecha> y --curr <fecha>");
  const dataDir = arg("--data-dir") ?? "data";

  const prev = readNormalizedSnapshot(prevDate, dataDir);
  const curr = readNormalizedSnapshot(currDate, dataDir);
  const deaths = detectDeaths(prev, curr, currDate, {
    minPrevTvlUsd: Number(arg("--min-tvl") ?? "1000000"),
  });

  appendEvents(deaths, dataDir);
  console.log(`== Muertes ${prevDate} → ${currDate} ==`);
  console.log(`pools previos: ${prev.length} | actuales: ${curr.length} | MUERTOS: ${deaths.length}\n`);
  for (const d of deaths.slice(0, 30)) console.log(`  ☠️  ${d.detail}`);
  if (deaths.length > 30) console.log(`  ... y ${deaths.length - 30} más`);
  console.log(`\neventos agregados a ${dataDir}/events/events.jsonl (append-only)`);
}

main();
