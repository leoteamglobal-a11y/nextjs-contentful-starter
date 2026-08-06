import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { detectDeaths } from "../src/events.js";
import { buildProtocolInfo, hacksToEvents, normalizeProtocols } from "../src/protocols.js";
import { lookupProtocol, qualityScreenV2 } from "../src/screen2.js";
import type { NormalizedRow } from "../src/types.js";

function row(over: Partial<NormalizedRow>): NormalizedRow {
  return {
    date: "2026-01-15",
    pool: over.pool ?? "p",
    chain: "Ethereum",
    project: over.project ?? "aave-v3",
    symbol: over.symbol ?? "SYM",
    tvlUsd: over.tvlUsd ?? 20_000_000,
    apy: over.apy ?? 12,
    apyBase: over.apyBase ?? 12,
    apyReward: over.apyReward ?? 0,
    apyBaseShare: 1,
    incentiveShare: over.incentiveShare ?? 0,
    realYield: over.apyBase ?? 12,
    isMirage: false,
    ageDays: over.ageDays ?? 500,
    stablecoin: false,
    ilRisk: null,
    exposure: null,
    poolMeta: null,
    ...over,
  };
}

// --- detectDeaths ---

test("detectDeaths marca pools que desaparecieron o colapsaron", () => {
  const prev = [
    row({ pool: "alive", tvlUsd: 20_000_000 }),
    row({ pool: "gone", tvlUsd: 15_000_000 }),
    row({ pool: "collapsed", tvlUsd: 10_000_000 }),
    row({ pool: "small", tvlUsd: 200_000 }), // por debajo de minPrev, se ignora
  ];
  const curr = [
    row({ pool: "alive", tvlUsd: 21_000_000 }),
    row({ pool: "collapsed", tvlUsd: 20_000 }), // colapsó
    // "gone" no está
  ];
  const deaths = detectDeaths(prev, curr, "2026-01-15");
  const refs = deaths.map((d) => d.ref).sort();
  assert.deepEqual(refs, ["collapsed", "gone"]);
  assert.ok(deaths.every((d) => d.type === "death" && d.scope === "pool"));
});

// --- protocolos / hacks ---

const evDir = fileURLToPath(new URL("../fixtures/events/", import.meta.url));
const protoRaw = JSON.parse(readFileSync(evDir + "protocols.json", "utf8"));
const hacksRaw = JSON.parse(readFileSync(evDir + "hacks.json", "utf8"));

test("normalizeProtocols detecta auditorías y edad", () => {
  const metas = normalizeProtocols(protoRaw, "2026-01-15");
  const aave = metas.find((m) => m.slug === "aave-v3")!;
  assert.equal(aave.audited, true);
  assert.ok(aave.auditCount >= 1);
  assert.ok((aave.ageDays ?? 0) > 365);
  const maxi = metas.find((m) => m.slug === "yield-maxi")!;
  assert.equal(maxi.audited, false); // audits "0"
});

test("hacksToEvents convierte hacks en eventos con fecha", () => {
  const ev = hacksToEvents(hacksRaw);
  assert.ok(ev.length >= 1);
  const curve = ev.find((e) => e.ref.includes("curve"));
  assert.ok(curve);
  assert.equal(curve!.type, "hack");
});

test("buildProtocolInfo marca hack reciente dentro de la ventana", () => {
  const metas = normalizeProtocols(protoRaw, "2026-01-15");
  const info = buildProtocolInfo(metas, hacksToEvents(hacksRaw), "2026-01-15", 365);
  assert.equal(info.get("curve")!.recentHack, true); // hack 2025-08 dentro de 1 año
  assert.equal(info.get("aave-v3")!.recentHack, false);
});

// --- screen v2 ---

test("qualityScreenV2 exige auditoría y excluye hack reciente", () => {
  const metas = normalizeProtocols(protoRaw, "2026-01-15");
  const info = buildProtocolInfo(metas, hacksToEvents(hacksRaw), "2026-01-15", 365);

  const rows = [
    row({ pool: "a", project: "aave-v3", apyBase: 11 }), // auditado, sin hack -> pasa
    row({ pool: "b", project: "curve", apyBase: 15 }), // auditado pero HACK reciente -> fuera
    row({ pool: "c", project: "unknown-proto", apyBase: 13 }), // sin metadata -> sin auditoría -> fuera
    row({ pool: "d", project: "yield-maxi", apyBase: 14 }), // audits 0 -> fuera
  ];
  const passed = qualityScreenV2(rows, info).map((r) => r.pool);
  assert.deepEqual(passed, ["a"]);
});

test("lookupProtocol resuelve el sufijo de versión", () => {
  const metas = normalizeProtocols(protoRaw, "2026-01-15");
  const info = buildProtocolInfo(metas, [], "2026-01-15");
  // "aave-v3" existe directo; probamos fallback con un proyecto -v9 inexistente
  info.set("aave", { slug: "aave", name: "Aave", category: null, auditCount: 1, audited: true, ageDays: 1000, recentHack: false });
  assert.ok(lookupProtocol("aave-v9", info)); // cae a "aave"
});
