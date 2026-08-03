//! Conexión real a la cadena (devnet/mainnet) vía JSON-RPC.
//!
//! Paso 1 del plan a live: conectar al RPC, cargar/crear keypair, leer versión
//! y balance, y (en devnet) pedir airdrop. Los pasos siguientes (detector
//! Raydium, safety on-chain, swaps Jupiter) se apoyan sobre esto.

use crate::types::TokenLaunch;
use anyhow::{Context, Result};
use solana_client::nonblocking::rpc_client::RpcClient as AsyncRpcClient;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::native_token::{lamports_to_sol, sol_to_lamports};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, write_keypair_file, Keypair};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

/// Crea un cliente RPC con commitment "confirmed".
pub fn connect(rpc_url: &str) -> RpcClient {
    RpcClient::new_with_commitment(rpc_url.to_string(), CommitmentConfig::confirmed())
}

/// Expande un `~/` inicial usando $HOME.
pub fn expand_tilde(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return Path::new(&home).join(rest);
        }
    }
    PathBuf::from(p)
}

/// Carga el keypair del path; si no existe, genera uno nuevo y lo guarda.
/// Devuelve también `true` si fue recién creado.
pub fn load_or_create_keypair(path: &Path) -> Result<(Keypair, bool)> {
    if path.exists() {
        let kp = read_keypair_file(path)
            .map_err(|e| anyhow::anyhow!("no pude leer keypair {}: {e}", path.display()))?;
        Ok((kp, false))
    } else {
        let kp = Keypair::new();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let target = path
            .to_str()
            .context("ruta de keypair no es UTF-8 válida")?;
        write_keypair_file(&kp, target)
            .map_err(|e| anyhow::anyhow!("no pude escribir keypair {}: {e}", path.display()))?;
        Ok((kp, true))
    }
}

/// Versión del nodo (solana-core).
pub fn node_version(client: &RpcClient) -> Result<String> {
    Ok(client.get_version().context("get_version")?.solana_core)
}

/// Balance en SOL de una pubkey.
pub fn balance_sol(client: &RpcClient, pubkey: &Pubkey) -> Result<f64> {
    let lamports = client.get_balance(pubkey).context("get_balance")?;
    Ok(lamports_to_sol(lamports))
}

// ---------------------------------------------------------------------------
// Paso 3: safety on-chain (enriquecimiento de un TokenLaunch con datos reales)
// ---------------------------------------------------------------------------

/// Balance (ui_amount, ya ajustado por decimales) de una token account.
async fn token_ui_balance(rpc: &AsyncRpcClient, addr: &str) -> Result<f64> {
    let pk = Pubkey::from_str(addr).context("pubkey vault invalida")?;
    let bal = rpc.get_token_account_balance(&pk).await.context("get_token_account_balance")?;
    Ok(bal.ui_amount.unwrap_or(0.0))
}

/// Lee datos on-chain reales y completa el `TokenLaunch`:
///  - mint_authority_renounced / freeze_authority_none  (cuenta del mint SPL Token)
///  - liquidity_sol                                      (balance del vault SOL/quote)
///  - price_sol                                          (quote_reserve / base_reserve)
///
/// LP quemada: aun NO se auto-verifica de forma fiable (ver README). Se deja el
/// valor tal cual venga; en mainnet conviene `require_lp_burned = false` o
/// integrar un servicio de rug-check (paso futuro).
///
/// Parseo del mint: layout clasico SPL Token (82 bytes). Token-2022 tiene otro
/// layout — TODO si se necesita.
pub async fn enrich_launch(rpc: &AsyncRpcClient, t: &mut TokenLaunch) -> Result<()> {
    // 1) Autoridades del mint.
    if let Ok(mint_pk) = Pubkey::from_str(&t.mint) {
        match rpc.get_account_data(&mint_pk).await {
            Ok(data) if data.len() >= 82 => {
                // COption<Pubkey>: tag u32 (LE) en los primeros 4 bytes; 0 = None.
                // mint_authority en [0..4], freeze_authority en [46..50].
                t.mint_authority_renounced = data[0] == 0;
                t.freeze_authority_none = data[46] == 0;
            }
            Ok(_) => tracing::warn!("mint {} con layout inesperado (Token-2022?)", t.mint),
            Err(e) => tracing::warn!("no pude leer mint {}: {e}", t.mint),
        }
    }

    // 2) Liquidez y precio desde los vaults del pool.
    if let (Some(quote_vault), Some(base_vault)) = (t.quote_vault.clone(), t.base_vault.clone()) {
        let quote_reserve = token_ui_balance(rpc, &quote_vault).await.unwrap_or(0.0);
        let base_reserve = token_ui_balance(rpc, &base_vault).await.unwrap_or(0.0);
        t.liquidity_sol = quote_reserve; // el quote vault es el lado SOL
        if base_reserve > 0.0 {
            t.price_sol = quote_reserve / base_reserve;
        }
    }

    Ok(())
}

/// Pide airdrop (solo devnet/testnet) y espera confirmación.
pub fn airdrop(client: &RpcClient, pubkey: &Pubkey, sol: f64) -> Result<()> {
    let sig = client
        .request_airdrop(pubkey, sol_to_lamports(sol))
        .context("request_airdrop")?;
    for _ in 0..40 {
        if client.confirm_transaction(&sig).unwrap_or(false) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    anyhow::bail!("airdrop enviado pero no confirmado a tiempo (sig {sig})");
}
