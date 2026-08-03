//! Carga y tipos de configuracion (config.toml).

use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// "devnet" | "mainnet" (informativo mientras dry_run = true).
    pub network: String,
    pub rpc_url: String,
    /// Ruta al keypair (solo modo live).
    pub keypair_path: Option<String>,
    /// true = paper trading (no envia transacciones reales).
    pub dry_run: bool,
    pub trade: TradeConfig,
    pub safety: SafetyConfig,
    pub detector: DetectorConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TradeConfig {
    pub buy_amount_sol: f64,
    pub slippage_bps: u32,
    pub take_profit_pct: f64,
    pub stop_loss_pct: f64,
    pub max_open_positions: usize,
    pub max_hold_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SafetyConfig {
    pub require_mint_authority_renounced: bool,
    pub require_freeze_authority_none: bool,
    pub require_lp_burned: bool,
    pub min_liquidity_sol: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DetectorConfig {
    /// "simulated" | "raydium"
    pub source: String,
    pub sim_interval_secs: u64,
}

impl Config {
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let text = std::fs::read_to_string(path.as_ref())
            .map_err(|e| anyhow::anyhow!("no pude leer {}: {e}", path.as_ref().display()))?;
        let cfg: Config = toml::from_str(&text)?;
        Ok(cfg)
    }
}
