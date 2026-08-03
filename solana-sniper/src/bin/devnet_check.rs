//! Paso 1: conexión real a devnet.
//!
//! Uso:  cargo run --bin devnet-check            (usa config.toml)
//!       cargo run --bin devnet-check -- otra.toml
//!
//! Conecta al RPC configurado, carga/crea el keypair, muestra versión del nodo,
//! pubkey y balance, y en devnet pide airdrop si el balance está bajo.
//!
//! NOTA: requiere salida a internet hacia el RPC (p. ej. api.devnet.solana.com).
//! En entornos con egress restringido (proxy con allowlist) la conexión será
//! rechazada — correlo donde tengas red abierta.

use anyhow::Result;
use solana_sdk::signature::Signer;
use solana_sniper::chain;
use solana_sniper::config::Config;

fn main() -> Result<()> {
    let cfg_path = std::env::args().nth(1).unwrap_or_else(|| "config.toml".to_string());
    let cfg = Config::load(&cfg_path)?;

    println!("== Solana devnet check ==");
    println!("network : {}", cfg.network);
    println!("rpc     : {}", cfg.rpc_url);

    let client = chain::connect(&cfg.rpc_url);

    let version = chain::node_version(&client)?;
    println!("conectado ✓  solana-core {version}");

    let kp_path = chain::expand_tilde(
        cfg.keypair_path.as_deref().unwrap_or("devnet-keypair.json"),
    );
    let (keypair, created) = chain::load_or_create_keypair(&kp_path)?;
    let pubkey = keypair.pubkey();
    println!("keypair : {}{}", kp_path.display(), if created { "  (nuevo)" } else { "" });
    println!("wallet  : {pubkey}");

    let bal = chain::balance_sol(&client, &pubkey)?;
    println!("balance : {bal} SOL");

    if cfg.network == "devnet" && bal < 0.5 {
        println!("balance bajo — pidiendo airdrop de 1 SOL (devnet)...");
        match chain::airdrop(&client, &pubkey, 1.0) {
            Ok(()) => {
                let bal = chain::balance_sol(&client, &pubkey)?;
                println!("airdrop ✓  nuevo balance: {bal} SOL");
            }
            Err(e) => println!("airdrop falló (faucet limitado): {e}"),
        }
    }

    println!("paso 1 completo ✓");
    Ok(())
}
