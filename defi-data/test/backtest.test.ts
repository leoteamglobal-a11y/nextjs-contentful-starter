import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  chaseTopApy,
  poolDeathDate,
  pointAsOf,
  qualityStrategy,
  runBacktest,
  type PoolHistory,
} from "../src/backtest.js";

const universe = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/universe.json", import.meta.url)), "utf8"),
) as PoolHistory[];
const get = (p: string) => universe.find((h) => h.pool === p)!;

test("poolDeathDate detecta el colapso de TVL", () => {
  assert.equal(poolDeathDate(get("mirage-a").points), "2025-05-01");
  assert.equal(poolDeathDate(get("mirage-b").points), "2025-07-01");
  assert.equal(poolDeathDate(get("weth-usdc").points), null); // vivo
  assert.equal(poolDeathDate(get("aave-usdc").points), null);
});

test("pointAsOf devuelve el último punto ≤ fecha", () => {
  const pts = get("weth-usdc").points;
  assert.equal(pointAsOf(pts, "2025-05-15")?.date, "2025-04-01");
  assert.equal(pointAsOf(pts, "2024-12-01"), null);
});

const cfg = { start: "2025-01-01", end: "2026-01-01", capital0: 1000, rebalanceEveryDays: 30 };

test("perseguir APY alto se funde con los pools que mueren", () => {
  const r = runBacktest(universe, { ...cfg, strategy: chaseTopApy(2) });
  assert.ok(r.finalCapital < 1000, `deberia perder capital, dio ${r.finalCapital}`);
  assert.ok(r.maxDrawdownPct > 40, `drawdown grande, dio ${r.maxDrawdownPct}`);
});

test("el screen de calidad compone de forma estable", () => {
  const r = runBacktest(universe, { ...cfg, strategy: qualityStrategy(2, { minAgeDays: 0 }) });
  assert.ok(r.finalCapital > 1000, `deberia ganar, dio ${r.finalCapital}`);
  assert.ok(r.totalReturnPct > 8 && r.totalReturnPct < 20, `~11-12%, dio ${r.totalReturnPct}`);
  assert.ok(r.maxDrawdownPct < 5, `drawdown chico, dio ${r.maxDrawdownPct}`);
});

test("calidad supera ampliamente a perseguir APY", () => {
  const chase = runBacktest(universe, { ...cfg, strategy: chaseTopApy(2) });
  const quality = runBacktest(universe, { ...cfg, strategy: qualityStrategy(2, { minAgeDays: 0 }) });
  assert.ok(quality.finalCapital > chase.finalCapital * 1.5);
});

test("sin sesgo de supervivencia: los muertos cuentan como pérdida", () => {
  // Si ignoráramos los muertos, chaseTopApy no perdería. La pérdida prueba que se cuentan.
  const r = runBacktest(universe, { ...cfg, strategy: chaseTopApy(2), deathHaircut: 1 });
  const noHaircut = runBacktest(universe, { ...cfg, strategy: chaseTopApy(2), deathHaircut: 0 });
  assert.ok(noHaircut.finalCapital > r.finalCapital, "con haircut pierde más");
});
