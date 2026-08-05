import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { normalizePool, rankByRealYield, topMirages } from "../src/normalize.js";
import type { RawPool } from "../src/types.js";

const fixturePath = fileURLToPath(new URL("../fixtures/sample-pools.json", import.meta.url));
const pools = JSON.parse(readFileSync(fixturePath, "utf8")) as RawPool[];
const rows = pools.map((p) => normalizePool(p, "2026-01-15"));

const bySymbol = (s: string) => rows.find((r) => r.symbol === s)!;

test("apyBaseShare e incentiveShare se calculan bien", () => {
  const velvet = bySymbol("USDC-VELVET");
  assert.ok(velvet.apyBaseShare !== null && velvet.apyBaseShare < 0.001, "casi todo incentivo");
  assert.ok(velvet.incentiveShare !== null && velvet.incentiveShare > 0.99);
});

test("el espejismo se marca isMirage", () => {
  assert.equal(bySymbol("USDC-VELVET").isMirage, true);
  assert.equal(bySymbol("MOON-USDC").isMirage, true);
  assert.equal(bySymbol("USDC").isMirage, false);
});

test("realYield = apyBase cuando existe", () => {
  assert.equal(bySymbol("WETH-USDC").realYield, 12.1);
  assert.equal(bySymbol("USDC").realYield, 5.1);
});

test("realYield cae a apy - apyReward si falta apyBase", () => {
  // XYZ-ETH tiene apyBase null, apy 22, apyReward null -> realYield 22
  assert.equal(bySymbol("XYZ-ETH").realYield, 22);
});

test("ranking por yield real excluye espejismos y ordena bien", () => {
  const top = rankByRealYield(rows, { minTvlUsd: 1_000_000, requireApyBase: true, excludeMirage: true });
  const symbols = top.map((r) => r.symbol);
  // VELVET (291.160% APY) NO debe aparecer; los reales sí, ordenados por yield real.
  assert.ok(!symbols.includes("USDC-VELVET"), "el espejismo no entra");
  assert.ok(!symbols.includes("MOON-USDC"), "TVL bajo + espejismo fuera");
  assert.equal(symbols[0], "WETH-USDC"); // 12.1% es el mayor yield real
  // ordenado descendente
  for (let i = 1; i < top.length; i++) {
    assert.ok((top[i - 1].realYield ?? 0) >= (top[i].realYield ?? 0));
  }
});

test("filtro stableOnly deja solo stablecoins", () => {
  const stables = rankByRealYield(rows, { minTvlUsd: 1_000_000, requireApyBase: true, stableOnly: true });
  assert.ok(stables.every((r) => r.stablecoin));
  assert.ok(stables.some((r) => r.symbol === "PT-USDE"));
});

test("filtro de TVL descarta pools ilíquidos", () => {
  const big = rankByRealYield(rows, { minTvlUsd: 1_000_000 });
  assert.ok(!big.some((r) => r.symbol === "MOON-USDC")); // TVL $90k
});

test("topMirages lista los espejismos por APY", () => {
  const m = topMirages(rows, 1_000_000);
  assert.equal(m[0].symbol, "USDC-VELVET"); // el APY más alto entre espejismos con TVL
});
