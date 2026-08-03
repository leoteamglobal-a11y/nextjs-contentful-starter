//! Conexión real a la cadena (devnet/mainnet) vía JSON-RPC.
//!
//! Paso 1 del plan a live: conectar al RPC, cargar/crear keypair, leer versión
//! y balance, y (en devnet) pedir airdrop. Los pasos siguientes (detector
//! Raydium, safety on-chain, swaps Jupiter) se apoyan sobre esto.

use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::native_token::{lamports_to_sol, sol_to_lamports};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, write_keypair_file, Keypair};
use std::path::{Path, PathBuf};
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
