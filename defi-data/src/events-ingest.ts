// Ingesta de eventos externos (etapa 3): hacks + metadata de protocolos (auditorías).
//   npm run events -- --date 2026-01-15
//   npm run events -- --fixtures fixtures/events    (offline: protocols.json + hacks.json)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchHacks, fetchProtocols } from "./defillama.js";
import { appendEvents } from "./events.js";
import { hacksToEvents, normalizeProtocols } from "./protocols.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function load(fixtures: string | undefined, name: string, fetcher: () => Promise<unknown>): Promise<unknown> {
  if (fixtures) return JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
  return fetcher();
}

async function main(): Promise<void> {
  const fixtures = arg("--fixtures");
  const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
  const dataDir = arg("--data-dir") ?? "data";

  console.log(`== Ingesta de eventos — ${date} ==${fixtures ? " (offline)" : ""}`);

  // 1) Hacks -> eventos.
  const hacksRaw = await load(fixtures, "hacks", fetchHacks);
  const hackEvents = hacksToEvents(hacksRaw);
  appendEvents(hackEvents, dataDir);
  console.log(`hacks: ${hackEvents.length} eventos agregados`);

  // 2) Metadata de protocolos (auditorías, edad) -> cache.
  const protoRaw = await load(fixtures, "protocols", fetchProtocols);
  const metas = normalizeProtocols(protoRaw, date);
  const audited = metas.filter((m) => m.audited).length;
  const metaFile = join(dataDir, "meta", "protocols.json");
  mkdirSync(join(dataDir, "meta"), { recursive: true });
  writeFileSync(metaFile, JSON.stringify(metas, null, 0));
  console.log(`protocolos: ${metas.length} (${audited} con auditoría) → ${metaFile}`);
  console.log(`\nlisto. Usá qualityScreenV2 para filtrar por auditoría + sin hack reciente.`);
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
