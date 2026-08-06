import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { normalizeChart, summarizeHistory } from "../src/history.js";

function loadChart(name: string) {
  const p = fileURLToPath(new URL(`../fixtures/charts/${name}.json`, import.meta.url));
  return normalizeChart(JSON.parse(readFileSync(p, "utf8")));
}

const velvet = loadChart("velvet");
const weth = loadChart("weth");

test("normalizeChart ordena y extrae fechas", () => {
  assert.ok(velvet.length === 7);
  assert.equal(velvet[0].date, "2025-11-01");
  assert.equal(velvet[velvet.length - 1].date, "2026-02-01");
});

test("VELVET: espejismo — APY colapsa, yield real siempre bajo", () => {
  const s = summarizeHistory("velvet", velvet, { baseThreshold: 10 });
  assert.ok(s.apyBaseMax < 10, "nunca apyBase ≥ 10");
  assert.equal(s.daysApyBaseAboveThreshold, 0);
  assert.ok(s.apyDecayPct > 99, "el APY se desplomó");
  assert.ok(s.incentiveShareMean > 0.9, "casi todo incentivos");
  assert.ok(s.tvlDrawdownPct > 80, "la liquidez se fue");
});

test("WETH-USDC: sostenible — yield real alto y persistente", () => {
  const s = summarizeHistory("weth", weth, { baseThreshold: 10 });
  assert.ok(s.apyBaseMean >= 10, `baseμ ${s.apyBaseMean}`);
  assert.ok(s.shareDaysAboveThreshold > 0.6, "la mayoría de los días ≥ 10%");
  assert.ok(s.apyDecayPct < 30, "APY estable, no colapsó");
  assert.ok(s.alive, "sigue vivo");
});

test("umbral configurable cambia la persistencia", () => {
  const strict = summarizeHistory("weth", weth, { baseThreshold: 13 });
  const loose = summarizeHistory("weth", weth, { baseThreshold: 8 });
  assert.ok(loose.shareDaysAboveThreshold > strict.shareDaysAboveThreshold);
});

test("chart vacío no rompe", () => {
  const s = summarizeHistory("empty", [], {});
  assert.equal(s.days, 0);
  assert.equal(s.apyBaseMean, 0);
  assert.equal(s.alive, false);
});
