//! Ejecución de órdenes.
//!
//! - `PaperExecutor`: simula compras/ventas contra el `PaperMarket`.
//! - `LiveExecutor`: swaps reales vía Jupiter (quote → swap tx → firma → envío).
//! - `TradeExecutor`: enum que unifica ambos con una interfaz async, para que el
//!   loop del sniper no distinga entre paper y live.
//!
//! Métrica común: `position_value_sol` = cuánto SOL vale la posición AHORA (en
//! paper, precio simulado × cantidad; en live, re-cotización a SOL). El loop
//! decide TP/SL comparando ese valor contra el costo de entrada.

use crate::jupiter;
use crate::market::PaperMarket;
use crate::types::{now_ts, Position, Sol, TokenLaunch};
use anyhow::{Context, Result};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::native_token::{lamports_to_sol, sol_to_lamports};
use solana_sdk::signature::{Keypair, Signer};

/// Ejecutor unificado (paper o live).
pub enum TradeExecutor {
    Paper(PaperExecutor),
    Live(LiveExecutor),
}

impl TradeExecutor {
    pub async fn buy(&self, launch: &TokenLaunch, amount_sol: Sol) -> Result<Position> {
        match self {
            TradeExecutor::Paper(p) => Ok(p.buy(launch, amount_sol)),
            TradeExecutor::Live(l) => l.buy(launch, amount_sol).await,
        }
    }

    pub async fn sell(&self, pos: &Position, reason: &str) -> Result<Sol> {
        match self {
            TradeExecutor::Paper(p) => Ok(p.sell(pos, reason)),
            TradeExecutor::Live(l) => l.sell(pos, reason).await,
        }
    }

    /// Valor actual de la posición en SOL. `None` si no se pudo obtener este tick.
    pub async fn position_value_sol(&self, pos: &Position) -> Option<Sol> {
        match self {
            TradeExecutor::Paper(p) => p.position_value_sol(pos),
            TradeExecutor::Live(l) => l.position_value_sol(pos).await,
        }
    }
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

pub struct PaperExecutor {
    market: PaperMarket,
}

impl PaperExecutor {
    pub fn new(market: PaperMarket) -> Self {
        Self { market }
    }

    pub fn buy(&self, launch: &TokenLaunch, amount_sol: Sol) -> Position {
        self.market.set(&launch.mint, launch.price_sol);
        let amount_tokens = amount_sol / launch.price_sol;
        tracing::info!(
            mint = %launch.mint,
            "[PAPER] COMPRA {:.4} SOL -> {:.0} {} @ {:.10} SOL",
            amount_sol, amount_tokens, launch.symbol, launch.price_sol
        );
        Position {
            mint: launch.mint.clone(),
            symbol: launch.symbol.clone(),
            amount_tokens,
            entry_price_sol: launch.price_sol,
            cost_sol: amount_sol,
            opened_at: now_ts(),
        }
    }

    pub fn position_value_sol(&self, pos: &Position) -> Option<Sol> {
        self.market.price(&pos.mint).map(|p| p * pos.amount_tokens)
    }

    pub fn sell(&self, pos: &Position, reason: &str) -> Sol {
        let price = self.market.price(&pos.mint).unwrap_or(pos.entry_price_sol);
        let proceeds = pos.amount_tokens * price;
        let pnl = proceeds - pos.cost_sol;
        let pnl_pct = if pos.cost_sol > 0.0 { pnl / pos.cost_sol * 100.0 } else { 0.0 };
        tracing::info!(
            mint = %pos.mint,
            "[PAPER] VENTA ({}) {:.0} {} @ {:.10} -> {:.4} SOL | PnL {:+.4} SOL ({:+.1}%)",
            reason, pos.amount_tokens, pos.symbol, price, proceeds, pnl, pnl_pct
        );
        self.market.remove(&pos.mint);
        proceeds
    }
}

// ---------------------------------------------------------------------------
// Live (Jupiter)
// ---------------------------------------------------------------------------

pub struct LiveExecutor {
    http: reqwest::Client,
    rpc: RpcClient,
    keypair: Keypair,
    slippage_bps: u32,
}

impl LiveExecutor {
    pub fn new(rpc_url: String, keypair: Keypair, slippage_bps: u32) -> Self {
        Self {
            http: reqwest::Client::new(),
            rpc: RpcClient::new(rpc_url),
            keypair,
            slippage_bps,
        }
    }

    /// Compra: swap SOL -> token vía Jupiter. `amount_tokens` queda en unidades base.
    pub async fn buy(&self, launch: &TokenLaunch, amount_sol: Sol) -> Result<Position> {
        let lamports = sol_to_lamports(amount_sol);
        let quote = jupiter::get_quote(&self.http, jupiter::WSOL, &launch.mint, lamports, self.slippage_bps).await?;
        let out_amount: f64 = quote
            .get("outAmount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);
        if out_amount <= 0.0 {
            anyhow::bail!("Jupiter no devolvió ruta para {}", launch.mint);
        }
        let user = self.keypair.pubkey().to_string();
        let tx_b64 = jupiter::build_swap_tx(&self.http, &quote, &user).await?;
        let sig = jupiter::sign_and_send(&self.rpc, &self.keypair, &tx_b64).await?;
        tracing::info!(
            mint = %launch.mint,
            "[LIVE] COMPRA {:.4} SOL -> {:.0} unidades base | tx {}",
            amount_sol, out_amount, sig
        );
        Ok(Position {
            mint: launch.mint.clone(),
            symbol: launch.symbol.clone(),
            amount_tokens: out_amount,
            entry_price_sol: amount_sol / out_amount,
            cost_sol: amount_sol,
            opened_at: now_ts(),
        })
    }

    /// Venta: swap token -> SOL vía Jupiter. Devuelve el SOL recibido.
    pub async fn sell(&self, pos: &Position, reason: &str) -> Result<Sol> {
        let amount = pos.amount_tokens as u64;
        let quote = jupiter::get_quote(&self.http, &pos.mint, jupiter::WSOL, amount, self.slippage_bps).await?;
        let out_lamports: u64 = quote
            .get("outAmount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .context("cotización de venta sin outAmount")?;
        let user = self.keypair.pubkey().to_string();
        let tx_b64 = jupiter::build_swap_tx(&self.http, &quote, &user).await?;
        let sig = jupiter::sign_and_send(&self.rpc, &self.keypair, &tx_b64).await?;
        let proceeds = lamports_to_sol(out_lamports);
        let pnl = proceeds - pos.cost_sol;
        tracing::info!(
            mint = %pos.mint,
            "[LIVE] VENTA ({}) -> {:.4} SOL | PnL {:+.4} SOL | tx {}",
            reason, proceeds, pnl, sig
        );
        Ok(proceeds)
    }

    /// Valor actual: re-cotiza vender toda la posición a SOL.
    pub async fn position_value_sol(&self, pos: &Position) -> Option<Sol> {
        let amount = pos.amount_tokens as u64;
        let quote = jupiter::get_quote(&self.http, &pos.mint, jupiter::WSOL, amount, self.slippage_bps)
            .await
            .ok()?;
        let out_lamports: u64 = quote.get("outAmount").and_then(|v| v.as_str()).and_then(|s| s.parse().ok())?;
        Some(lamports_to_sol(out_lamports))
    }
}
