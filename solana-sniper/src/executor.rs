//! Ejecucion de ordenes.
//!
//! `PaperExecutor` simula compras/ventas contra el `PaperMarket`. En modo live
//! esto se reemplaza por swaps reales via Jupiter (quote + swap tx firmada con
//! el keypair) — ver README, seccion "Pasar a live".

use crate::market::PaperMarket;
use crate::types::{now_ts, Position, Sol, TokenLaunch};

pub struct PaperExecutor {
    market: PaperMarket,
    dry_run: bool,
}

impl PaperExecutor {
    pub fn new(market: PaperMarket, dry_run: bool) -> Self {
        Self { market, dry_run }
    }

    /// Compra `amount_sol` del token del lanzamiento. Devuelve la posicion abierta.
    pub fn buy(&self, launch: &TokenLaunch, amount_sol: Sol) -> Position {
        // Registra el precio inicial en el mercado simulado.
        self.market.set(&launch.mint, launch.price_sol);
        let amount_tokens = amount_sol / launch.price_sol;

        if self.dry_run {
            tracing::info!(
                mint = %launch.mint,
                symbol = %launch.symbol,
                "[PAPER] COMPRA {:.4} SOL -> {:.0} {} @ {:.10} SOL",
                amount_sol, amount_tokens, launch.symbol, launch.price_sol
            );
        } else {
            // TODO(live): construir swap via Jupiter y enviar transaccion.
            tracing::warn!("modo live no implementado; usar dry_run = true por ahora");
        }

        Position {
            mint: launch.mint.clone(),
            symbol: launch.symbol.clone(),
            amount_tokens,
            entry_price_sol: launch.price_sol,
            cost_sol: amount_sol,
            opened_at: now_ts(),
        }
    }

    /// Vende toda la posicion al precio dado. Devuelve el SOL recibido.
    pub fn sell(&self, pos: &Position, price_sol: f64, reason: &str) -> Sol {
        let proceeds = pos.amount_tokens * price_sol;
        let pnl = proceeds - pos.cost_sol;
        let pnl_pct = if pos.cost_sol > 0.0 {
            pnl / pos.cost_sol * 100.0
        } else {
            0.0
        };

        if self.dry_run {
            tracing::info!(
                mint = %pos.mint,
                symbol = %pos.symbol,
                "[PAPER] VENTA ({}) {:.0} {} @ {:.10} -> {:.4} SOL | PnL {:+.4} SOL ({:+.1}%)",
                reason, pos.amount_tokens, pos.symbol, price_sol, proceeds, pnl, pnl_pct
            );
        } else {
            // TODO(live): swap de vuelta a SOL via Jupiter.
            tracing::warn!("modo live no implementado; usar dry_run = true por ahora");
        }

        self.market.remove(&pos.mint);
        proceeds
    }
}
