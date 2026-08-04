// Loop principal del bot de señales.
import { loadConfig } from "./config.js";
import { OnchainFeed, SimulatedFeed, type PoolFeed } from "./feed.js";
import { PaperExecutor, LiveExecutor, type Executor } from "./executor.js";
import { decide } from "./signals.js";
import { EMPTY_POSITION, type Position } from "./types.js";

async function main(): Promise<void> {
  const cfgPath = process.argv[2] ?? "config.json";
  const cfg = loadConfig(cfgPath);

  console.log("=".repeat(56));
  console.log(` Aerodrome Signal Bot — ${cfg.pool.label}`);
  console.log(` modo: ${cfg.dryRun ? "PAPER (simulación)" : "LIVE"}   feed: ${cfg.feed}`);
  console.log(
    ` entrar APY≥${cfg.signals.enterApyMin}%  salir APY<${cfg.signals.exitApyMin}%  ` +
      `rango ±${cfg.signals.rangeWidthPct}%  SL ${cfg.signals.stopLossPct}%  TP ${cfg.signals.takeProfitPct}%`,
  );
  console.log("=".repeat(56));

  // Ejecutor con DOBLE TRABA de seguridad para live.
  let exec: Executor;
  if (cfg.dryRun) {
    exec = new PaperExecutor();
  } else {
    if (!cfg.liveConfirmed) {
      throw new Error(
        "modo LIVE bloqueado. Para operar con fondos reales hace falta dryRun=false Y liveConfirmed=true.",
      );
    }
    console.warn("############################################################");
    console.warn("#  MODO LIVE ACTIVO — LIQUIDEZ REAL EN BASE                 #");
    console.warn("############################################################");
    exec = new LiveExecutor();
  }

  let feed: PoolFeed;
  if (cfg.feed === "simulated") {
    feed = new SimulatedFeed(cfg.sim);
  } else if (cfg.feed === "onchain") {
    feed = new OnchainFeed(cfg);
    console.log(` on-chain: pool ${cfg.pool.address} @ ${cfg.rpcUrl}`);
  } else {
    throw new Error(`feed '${cfg.feed}' desconocido. Usá 'simulated' u 'onchain'.`);
  }

  const intervalMs = cfg.pollIntervalMs ?? cfg.sim.intervalMs;
  let pos: Position = { ...EMPTY_POSITION };
  let realizedPnl = 0;
  let entries = 0;
  let exits = 0;

  for (;;) {
    let state;
    try {
      state = await feed.next();
    } catch (e) {
      console.warn("feed error:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    const action = decide(state, pos, cfg.signals);

    if (action.kind === "enter") {
      pos = await exec.enter(state, action, cfg.positionSizeUsd);
      entries++;
    } else if (action.kind === "exit") {
      const pnl = await exec.exit(pos, state, action.reason);
      realizedPnl += pnl;
      exits++;
      pos = { ...EMPTY_POSITION };
      console.log(
        `   PnL acumulado ~$${realizedPnl.toFixed(2)} | entradas ${entries} salidas ${exits}`,
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
