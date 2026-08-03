//! Herramienta manual de swap vía Jupiter (paso 4).
//!
//! Uso:
//!   cargo run --bin swap -- <inputMint> <outputMint> <amountBaseUnits>
//!   cargo run --bin swap -- <inputMint> <outputMint> <amountBaseUnits> --live
//!
//! Sin `--live`: solo muestra la cotización (NO firma ni envía nada). Seguro.
//! Con  `--live`: firma con el keypair de config.toml y envía la transacción.
//!
//! Ejemplo (comprar el token XYZ con 0.01 SOL = 10_000_000 lamports):
//!   cargo run --bin swap -- So11111111111111111111111111111111111111112 <XYZ> 10000000
//!
//! Empezá SIEMPRE con la cotización (sin --live) y luego un monto chico.

use anyhow::{Context, Result};
use solana_sdk::signature::Signer;
use solana_sniper::config::Config;
use solana_sniper::{chain, jupiter};

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let positional: Vec<&String> = args[1..].iter().filter(|a| !a.starts_with("--")).collect();
    let live = args.iter().any(|a| a == "--live");

    if positional.len() < 3 {
        eprintln!("uso: swap <inputMint> <outputMint> <amountBaseUnits> [--live]");
        std::process::exit(2);
    }
    let input_mint = positional[0];
    let output_mint = positional[1];
    let amount: u64 = positional[2].parse().context("amount debe ser un entero (unidades base)")?;

    let cfg = Config::load("config.toml")?;
    let slippage = cfg.trade.slippage_bps;
    let http = reqwest::Client::new();

    println!("== Jupiter swap ==");
    println!("in : {input_mint}");
    println!("out: {output_mint}");
    println!("amount: {amount} (unidades base)  slippage: {slippage} bps");

    // 1) Cotización (siempre).
    let quote = jupiter::get_quote(&http, input_mint, output_mint, amount, slippage).await?;
    let out_amount = quote.get("outAmount").and_then(|v| v.as_str()).unwrap_or("?");
    let price_impact = quote.get("priceImpactPct").and_then(|v| v.as_str()).unwrap_or("?");
    println!("cotización: outAmount {out_amount}  priceImpact {price_impact}");

    if !live {
        println!("(cotización solamente) — agregá --live para firmar y enviar.");
        return Ok(());
    }

    // 2) Modo live: firmar y enviar.
    println!("\n⚠️  MODO LIVE — se firmará con tu clave y se enviará una transacción REAL.");
    let kp_path = chain::expand_tilde(
        cfg.keypair_path.as_deref().unwrap_or("~/.config/solana/id.json"),
    );
    let (keypair, _) = chain::load_or_create_keypair(&kp_path)?;
    println!("wallet: {}", keypair.pubkey());

    let tx_b64 = jupiter::build_swap_tx(&http, &quote, &keypair.pubkey().to_string()).await?;
    let rpc = solana_client::nonblocking::rpc_client::RpcClient::new(cfg.rpc_url.clone());
    let sig = jupiter::sign_and_send(&rpc, &keypair, &tx_b64).await?;
    println!("swap enviado ✓  https://solscan.io/tx/{sig}");
    Ok(())
}
