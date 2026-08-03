//! Ejecución de swaps vía Jupiter v6 (paso 4).
//!
//! Flujo: `get_quote` (cotización, sin riesgo) → `build_swap_tx` (Jupiter arma
//! la transacción) → `sign_and_send` (la firmamos con el keypair y la enviamos).
//!
//! ⚠️ NO probado contra la API/red reales desde este entorno (egress bloqueado).
//! Validá primero con una cotización (sin `--live`) y luego un swap chico en
//! mainnet/devnet antes de automatizar. La clave privada nunca se loguea.

use anyhow::{Context, Result};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::VersionedTransaction;

pub const JUP_QUOTE: &str = "https://quote-api.jup.ag/v6/quote";
pub const JUP_SWAP: &str = "https://quote-api.jup.ag/v6/swap";
/// Wrapped SOL — mint de entrada al comprar con SOL.
pub const WSOL: &str = "So11111111111111111111111111111111111111112";

/// Pide una cotización a Jupiter. `amount` en unidades base del `input_mint`
/// (p. ej. lamports si input = SOL). Devuelve el JSON crudo (se reenvía a /swap).
pub async fn get_quote(
    http: &reqwest::Client,
    input_mint: &str,
    output_mint: &str,
    amount: u64,
    slippage_bps: u32,
) -> Result<serde_json::Value> {
    let url = format!(
        "{JUP_QUOTE}?inputMint={input_mint}&outputMint={output_mint}\
         &amount={amount}&slippageBps={slippage_bps}"
    );
    let resp = http
        .get(url)
        .send()
        .await
        .context("request a Jupiter /quote")?
        .error_for_status()
        .context("Jupiter /quote devolvió error")?;
    let v: serde_json::Value = resp.json().await.context("parse JSON de /quote")?;
    Ok(v)
}

/// Pide a Jupiter que construya la transacción de swap para `user_pubkey`.
/// Devuelve la transacción serializada en base64.
pub async fn build_swap_tx(
    http: &reqwest::Client,
    quote: &serde_json::Value,
    user_pubkey: &str,
) -> Result<String> {
    let body = serde_json::json!({
        "quoteResponse": quote,
        "userPublicKey": user_pubkey,
        "wrapAndUnwrapSol": true,
        "dynamicComputeUnitLimit": true,
    });
    let resp = http
        .post(JUP_SWAP)
        .json(&body)
        .send()
        .await
        .context("request a Jupiter /swap")?
        .error_for_status()
        .context("Jupiter /swap devolvió error")?;
    let v: serde_json::Value = resp.json().await.context("parse JSON de /swap")?;
    let tx_b64 = v
        .get("swapTransaction")
        .and_then(|x| x.as_str())
        .context("respuesta de /swap sin campo swapTransaction")?
        .to_string();
    Ok(tx_b64)
}

/// Firma la transacción de swap con el keypair y la envía a la red.
/// Devuelve la firma (signature) de la transacción confirmada.
pub async fn sign_and_send(
    rpc: &RpcClient,
    keypair: &Keypair,
    swap_tx_b64: &str,
) -> Result<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let bytes = STANDARD.decode(swap_tx_b64).context("base64 de swapTransaction")?;
    let mut vtx: VersionedTransaction =
        bincode::deserialize(&bytes).context("deserializar VersionedTransaction")?;

    // El usuario es el primer firmante requerido (fee payer). Firmamos el mensaje.
    if vtx.signatures.is_empty() {
        anyhow::bail!("la transacción no tiene slots de firma");
    }
    let message_bytes = vtx.message.serialize();
    vtx.signatures[0] = keypair.sign_message(&message_bytes);

    let sig = rpc
        .send_and_confirm_transaction(&vtx)
        .await
        .context("enviar/confirmar la transacción de swap")?;
    Ok(sig.to_string())
}
