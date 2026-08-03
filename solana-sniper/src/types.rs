//! Tipos de dominio compartidos.

use std::time::{SystemTime, UNIX_EPOCH};

/// Cantidad expresada en SOL.
pub type Sol = f64;

/// Un lanzamiento de token detectado (pool nuevo).
#[derive(Debug, Clone)]
pub struct TokenLaunch {
    pub mint: String,
    pub symbol: String,
    pub pool: String,
    /// Vault del token nuevo (para leer reservas on-chain). None en simulacion.
    pub base_vault: Option<String>,
    /// Vault del lado SOL/quote (para liquidez y precio). None en simulacion.
    pub quote_vault: Option<String>,
    /// Mint de la LP (para chequear si esta quemada). None en simulacion.
    pub lp_mint: Option<String>,
    /// Liquidez en SOL al momento de detectar.
    pub liquidity_sol: Sol,
    /// Precio inicial en SOL por token.
    pub price_sol: f64,
    /// Autoridad de acuñacion renunciada (no puede crear mas supply).
    pub mint_authority_renounced: bool,
    /// Sin autoridad de congelamiento (no puede congelar tu wallet).
    pub freeze_authority_none: bool,
    /// LP quemada/bloqueada.
    pub lp_burned: bool,
    pub detected_at: u64,
}

/// Una posicion abierta.
#[derive(Debug, Clone)]
pub struct Position {
    pub mint: String,
    pub symbol: String,
    pub amount_tokens: f64,
    pub entry_price_sol: f64,
    /// SOL gastado al entrar.
    pub cost_sol: Sol,
    pub opened_at: u64,
}

/// Timestamp unix (segundos).
pub fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
