//! Sniper de tokens nuevos en Solana — build de simulacion (paper trading).
//!
//! Flujo:
//!   detector -> chequeos de seguridad -> decision de compra -> ejecucion
//!   -> monitoreo de posiciones (take-profit / stop-loss / timeout) -> venta.
//!
//! Ejecutor unificado (paper o live) via `TradeExecutor`. La ejecucion LIVE
//! (swaps reales por Jupiter) tiene DOBLE TRABA: requiere dry_run = false Y
//! live_confirmed = true en el config. Por defecto todo corre en paper.

use std::collections::HashMap;
use std::time::Duration;

use solana_sniper::config::Config;
use solana_sniper::executor::{LiveExecutor, PaperExecutor, TradeExecutor};
use solana_sniper::market::PaperMarket;
use solana_sniper::safety::{self, SafetyVerdict};
use solana_sniper::types::{now_ts, Position};
use solana_sniper::detector;
use solana_sdk::signature::Signer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with_target(false)
        .init();

    // Permite pasar la ruta del config como argumento: `cargo run -- config.demo.toml`
    let cfg_path = std::env::args().nth(1).unwrap_or_else(|| "config.toml".to_string());
    let cfg = Config::load(&cfg_path)?;
    tracing::info!("config: {cfg_path}");

    tracing::info!("===========================================");
    tracing::info!(" Solana Sniper — modo {}", if cfg.dry_run { "PAPER (simulacion)" } else { "LIVE" });
    tracing::info!(" red: {}  rpc: {}", cfg.network, cfg.rpc_url);
    tracing::info!(" compra: {} SOL | TP +{}% | SL -{}% | max pos: {}",
        cfg.trade.buy_amount_sol, cfg.trade.take_profit_pct,
        cfg.trade.stop_loss_pct, cfg.trade.max_open_positions);
    tracing::info!("===========================================");

    // Mercado simulado + motor de precios (usado solo en paper).
    let market = PaperMarket::new();
    market.spawn_random_walk();

    // Construccion del ejecutor con DOBLE TRABA de seguridad para live.
    let exec = if cfg.dry_run {
        TradeExecutor::Paper(PaperExecutor::new(market.clone()))
    } else {
        if !cfg.live_confirmed {
            anyhow::bail!(
                "modo LIVE bloqueado. Para ejecutar swaps REALES con fondos hace falta \
                 dry_run = false Y live_confirmed = true en el config. Falta live_confirmed."
            );
        }
        let kp_path = solana_sniper::chain::expand_tilde(
            cfg.keypair_path.as_deref().unwrap_or("~/.config/solana/id.json"),
        );
        let (keypair, _) = solana_sniper::chain::load_or_create_keypair(&kp_path)?;
        tracing::warn!("############################################################");
        tracing::warn!("#  MODO LIVE ACTIVO — SWAPS REALES CON FONDOS DE VERDAD     #");
        tracing::warn!("#  wallet: {}", keypair.pubkey());
        tracing::warn!("############################################################");
        TradeExecutor::Live(LiveExecutor::new(
            cfg.rpc_url.clone(),
            keypair,
            cfg.trade.slippage_bps,
        ))
    };

    // Detector de lanzamientos.
    let (tx, mut rx) = tokio::sync::mpsc::channel(128);
    match cfg.detector.source.as_str() {
        "simulated" => detector::spawn_simulated(cfg.detector.clone(), tx),
        "raydium" => {
            let ws = cfg
                .ws_url
                .clone()
                .unwrap_or_else(|| detector::derive_ws_url(&cfg.rpc_url));
            let rpc = cfg.rpc_url.clone();
            tracing::info!("detector Raydium — ws: {ws}");
            tokio::spawn(async move {
                if let Err(e) = detector::run_raydium(ws, rpc, tx).await {
                    tracing::error!("detector Raydium termino con error: {e}");
                }
            });
        }
        other => {
            tracing::warn!("detector '{other}' desconocido; usando 'simulated'");
            detector::spawn_simulated(cfg.detector.clone(), tx);
        }
    }

    // Cliente RPC para enriquecer lanzamientos reales con datos on-chain (paso 3).
    let enrich_rpc = if cfg.detector.source == "raydium" {
        Some(solana_client::nonblocking::rpc_client::RpcClient::new_with_commitment(
            cfg.rpc_url.clone(),
            solana_sdk::commitment_config::CommitmentConfig::confirmed(),
        ))
    } else {
        None
    };

    let mut positions: HashMap<String, Position> = HashMap::new();
    let mut realized_pnl: f64 = 0.0;
    let mut wins = 0u32;
    let mut losses = 0u32;

    let mut monitor = tokio::time::interval(Duration::from_secs(1));

    loop {
        tokio::select! {
            // --- Nuevo lanzamiento detectado ---
            Some(mut launch) = rx.recv() => {
                if positions.len() >= cfg.trade.max_open_positions {
                    tracing::debug!("saltando {}: max posiciones abiertas", launch.symbol);
                    continue;
                }
                if positions.contains_key(&launch.mint) {
                    continue;
                }

                // Paso 3: enriquecer con datos on-chain reales (solo lanzamientos reales).
                if let Some(rpc) = &enrich_rpc {
                    if launch.quote_vault.is_some() {
                        if let Err(e) = solana_sniper::chain::enrich_launch(rpc, &mut launch).await {
                            tracing::warn!("enriquecimiento fallo {}: {e}", launch.mint);
                        } else {
                            tracing::info!(
                                "on-chain {} liq {:.2} SOL precio {:.10} mintAuth:{} freeze:{}",
                                launch.mint, launch.liquidity_sol, launch.price_sol,
                                if launch.mint_authority_renounced { "renunciada" } else { "ACTIVA" },
                                if launch.freeze_authority_none { "no" } else { "SI" },
                            );
                        }
                    }
                }

                match safety::evaluate(&cfg.safety, &launch) {
                    SafetyVerdict::Reject(reasons) => {
                        tracing::info!(
                            "RECHAZADO {} ({}): {}",
                            launch.symbol, &launch.mint[..6.min(launch.mint.len())],
                            reasons.join("; ")
                        );
                    }
                    SafetyVerdict::Pass => {
                        tracing::info!(
                            "OK  {} liq {:.1} SOL — entrando",
                            launch.symbol, launch.liquidity_sol
                        );
                        match exec.buy(&launch, cfg.trade.buy_amount_sol).await {
                            Ok(pos) => { positions.insert(pos.mint.clone(), pos); }
                            Err(e) => tracing::warn!("compra fallo {}: {e}", launch.mint),
                        }
                    }
                }
            }

            // --- Monitoreo de posiciones ---
            _ = monitor.tick() => {
                let mut to_close: Vec<(String, &'static str)> = Vec::new();
                let now = now_ts();

                for pos in positions.values() {
                    let Some(value) = exec.position_value_sol(pos).await else { continue };
                    let pnl_pct = (value - pos.cost_sol) / pos.cost_sol * 100.0;
                    let age = now.saturating_sub(pos.opened_at);

                    if pnl_pct >= cfg.trade.take_profit_pct {
                        to_close.push((pos.mint.clone(), "TAKE-PROFIT"));
                    } else if pnl_pct <= -cfg.trade.stop_loss_pct {
                        to_close.push((pos.mint.clone(), "STOP-LOSS"));
                    } else if age >= cfg.trade.max_hold_secs {
                        to_close.push((pos.mint.clone(), "TIMEOUT"));
                    }
                }

                for (mint, reason) in to_close {
                    if let Some(pos) = positions.remove(&mint) {
                        match exec.sell(&pos, reason).await {
                            Ok(proceeds) => {
                                let pnl = proceeds - pos.cost_sol;
                                realized_pnl += pnl;
                                if pnl >= 0.0 { wins += 1; } else { losses += 1; }
                                tracing::info!(
                                    "PnL realizado acumulado: {:+.4} SOL | W:{} L:{} | abiertas: {}",
                                    realized_pnl, wins, losses, positions.len()
                                );
                            }
                            Err(e) => {
                                tracing::warn!("venta fallo {} ({reason}): {e} — reintentare", pos.mint);
                                positions.insert(pos.mint.clone(), pos); // reintentar en el proximo tick
                            }
                        }
                    }
                }
            }
        }
    }
}
