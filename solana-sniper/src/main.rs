//! Sniper de tokens nuevos en Solana — build de simulacion (paper trading).
//!
//! Flujo:
//!   detector -> chequeos de seguridad -> decision de compra -> ejecucion
//!   -> monitoreo de posiciones (take-profit / stop-loss / timeout) -> venta.
//!
//! Todo corre en modo `dry_run` (paper). La integracion real con la cadena
//! (RPC devnet + Jupiter/Raydium) esta marcada como TODO en los modulos
//! `detector`, `executor` y `market`.

mod config;
mod detector;
mod executor;
mod market;
mod safety;
mod types;

use std::collections::HashMap;
use std::time::Duration;

use config::Config;
use executor::PaperExecutor;
use market::PaperMarket;
use safety::SafetyVerdict;
use types::{now_ts, Position};

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

    if !cfg.dry_run {
        anyhow::bail!(
            "modo live aun no implementado. Deja dry_run = true. \
             Ver README para el plan de integracion con la cadena."
        );
    }

    // Mercado simulado + motor de precios.
    let market = PaperMarket::new();
    market.spawn_random_walk();

    // Detector de lanzamientos.
    let (tx, mut rx) = tokio::sync::mpsc::channel(128);
    match cfg.detector.source.as_str() {
        "simulated" => detector::spawn_simulated(cfg.detector.clone(), tx),
        other => {
            tracing::warn!("detector '{other}' no implementado; usando 'simulated'");
            detector::spawn_simulated(cfg.detector.clone(), tx);
        }
    }

    let exec = PaperExecutor::new(market.clone(), cfg.dry_run);
    let mut positions: HashMap<String, Position> = HashMap::new();
    let mut realized_pnl: f64 = 0.0;
    let mut wins = 0u32;
    let mut losses = 0u32;

    let mut monitor = tokio::time::interval(Duration::from_secs(1));

    loop {
        tokio::select! {
            // --- Nuevo lanzamiento detectado ---
            Some(launch) = rx.recv() => {
                if positions.len() >= cfg.trade.max_open_positions {
                    tracing::debug!("saltando {}: max posiciones abiertas", launch.symbol);
                    continue;
                }
                if positions.contains_key(&launch.mint) {
                    continue;
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
                        let pos = exec.buy(&launch, cfg.trade.buy_amount_sol);
                        positions.insert(pos.mint.clone(), pos);
                    }
                }
            }

            // --- Monitoreo de posiciones ---
            _ = monitor.tick() => {
                let mut to_close: Vec<(String, f64, &'static str)> = Vec::new();
                let now = now_ts();

                for pos in positions.values() {
                    let Some(price) = market.price(&pos.mint) else { continue };
                    let pnl_pct = (price - pos.entry_price_sol) / pos.entry_price_sol * 100.0;
                    let age = now.saturating_sub(pos.opened_at);

                    if pnl_pct >= cfg.trade.take_profit_pct {
                        to_close.push((pos.mint.clone(), price, "TAKE-PROFIT"));
                    } else if pnl_pct <= -cfg.trade.stop_loss_pct {
                        to_close.push((pos.mint.clone(), price, "STOP-LOSS"));
                    } else if age >= cfg.trade.max_hold_secs {
                        to_close.push((pos.mint.clone(), price, "TIMEOUT"));
                    }
                }

                for (mint, price, reason) in to_close {
                    if let Some(pos) = positions.remove(&mint) {
                        let proceeds = exec.sell(&pos, price, reason);
                        let pnl = proceeds - pos.cost_sol;
                        realized_pnl += pnl;
                        if pnl >= 0.0 { wins += 1; } else { losses += 1; }
                        tracing::info!(
                            "PnL realizado acumulado: {:+.4} SOL | W:{} L:{} | abiertas: {}",
                            realized_pnl, wins, losses, positions.len()
                        );
                    }
                }
            }
        }
    }
}
