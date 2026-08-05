//! Deteccion de tokens nuevos.
//!
//! - `spawn_simulated`: genera lanzamientos falsos a intervalos aleatorios,
//!   con atributos de seguridad variados, para probar toda la logica sin cadena.
//! - `run_raydium`: en mainnet, se suscribe via WebSocket a los logs del
//!   programa AMM v4 de Raydium (`logsSubscribe` + filtro Mentions), detecta la
//!   creacion de pools (`initialize2`), y parsea la transaccion para extraer el
//!   pool y el mint del token nuevo.

use crate::config::DetectorConfig;
use crate::types::{now_ts, TokenLaunch};
use rand::Rng;
use std::str::FromStr;
use tokio::sync::mpsc::Sender;
use tokio::time::{sleep, Duration};

use solana_client::nonblocking::pubsub_client::PubsubClient;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_config::{
    RpcTransactionConfig, RpcTransactionLogsConfig, RpcTransactionLogsFilter,
};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Signature;
use solana_transaction_status::{EncodedTransaction, UiMessage, UiTransactionEncoding};

/// Programa Raydium Liquidity Pool V4 (mainnet).
pub const RAYDIUM_AMM_V4: &str = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
/// Wrapped SOL — el "quote" mas comun en pools nuevos.
const WSOL: &str = "So11111111111111111111111111111111111111112";

// ---------------------------------------------------------------------------
// Detector simulado (paper)
// ---------------------------------------------------------------------------

fn fake_address(rng: &mut impl Rng) -> String {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    (0..44)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect()
}

fn fake_symbol(rng: &mut impl Rng) -> String {
    const LETTERS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let len = rng.gen_range(3..=5);
    (0..len)
        .map(|_| LETTERS[rng.gen_range(0..LETTERS.len())] as char)
        .collect()
}

/// Lanza el detector simulado. Envia `TokenLaunch` por el canal.
pub fn spawn_simulated(cfg: DetectorConfig, tx: Sender<TokenLaunch>) {
    tokio::spawn(async move {
        loop {
            let base = cfg.sim_interval_secs.max(1);
            let jitter = {
                let mut rng = rand::thread_rng();
                rng.gen_range(0..=base)
            };
            sleep(Duration::from_secs(base.saturating_sub(base / 2) + jitter)).await;

            let launch = {
                let mut rng = rand::thread_rng();
                TokenLaunch {
                    mint: fake_address(&mut rng),
                    symbol: fake_symbol(&mut rng),
                    pool: fake_address(&mut rng),
                    base_vault: None,
                    quote_vault: None,
                    lp_mint: None,
                    liquidity_sol: rng.gen_range(0.5..40.0),
                    price_sol: rng.gen_range(0.0000001..0.00005),
                    mint_authority_renounced: rng.gen_bool(0.55),
                    freeze_authority_none: rng.gen_bool(0.6),
                    lp_burned: rng.gen_bool(0.5),
                    detected_at: now_ts(),
                }
            };

            if tx.send(launch).await.is_err() {
                break;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Detector real de Raydium (mainnet)
// ---------------------------------------------------------------------------

/// Deriva la URL WebSocket a partir de la URL RPC (http->ws, https->wss).
pub fn derive_ws_url(rpc_url: &str) -> String {
    if let Some(rest) = rpc_url.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = rpc_url.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        rpc_url.to_string()
    }
}

/// Corre el detector Raydium: se suscribe a los logs del programa y emite un
/// `TokenLaunch` por cada pool nuevo detectado.
///
/// Los campos de enriquecimiento (liquidez, precio, autoridades, LP) se dejan
/// en valores conservadores porque no se conocen al detectar; el paso 3
/// (safety on-chain) los completa antes de decidir una compra.
pub async fn run_raydium(
    ws_url: String,
    rpc_url: String,
    tx: Sender<TokenLaunch>,
) -> anyhow::Result<()> {
    use futures_util::StreamExt;

    let rpc = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let pubsub = PubsubClient::new(&ws_url).await?;
    let (mut stream, _unsub) = pubsub
        .logs_subscribe(
            RpcTransactionLogsFilter::Mentions(vec![RAYDIUM_AMM_V4.to_string()]),
            RpcTransactionLogsConfig {
                commitment: Some(CommitmentConfig::processed()),
            },
        )
        .await?;

    tracing::info!("detector Raydium: suscrito a logs de {RAYDIUM_AMM_V4}");

    while let Some(msg) = stream.next().await {
        if msg.value.err.is_some() {
            continue; // transaccion fallida
        }
        let is_pool_init = msg
            .value
            .logs
            .iter()
            .any(|l| l.contains("initialize2") || l.contains("init_pc_amount"));
        if !is_pool_init {
            continue;
        }

        let sig = msg.value.signature.clone();
        match resolve_launch(&rpc, &sig).await {
            Ok(Some(launch)) => {
                tracing::info!("Raydium pool nuevo: mint {} pool {}", launch.mint, launch.pool);
                if tx.send(launch).await.is_err() {
                    break; // receptor cerrado
                }
            }
            Ok(None) => tracing::debug!("pool init {sig}: no pude resolver los mints"),
            Err(e) => tracing::warn!("error resolviendo {sig}: {e}"),
        }
    }

    Ok(())
}

/// Descarga la transaccion y extrae (pool, mint nuevo) del instruction de
/// Raydium `initialize2`. Layout de cuentas (indices): 4 = pool AMM,
/// 8 = coin/base mint, 9 = pc/quote mint. El token "nuevo" es el que no es WSOL.
async fn resolve_launch(rpc: &RpcClient, sig_str: &str) -> anyhow::Result<Option<TokenLaunch>> {
    let sig = Signature::from_str(sig_str)?;
    let cfg = RpcTransactionConfig {
        encoding: Some(UiTransactionEncoding::Json),
        commitment: Some(CommitmentConfig::confirmed()),
        max_supported_transaction_version: Some(0),
    };
    let confirmed = rpc.get_transaction_with_config(&sig, cfg).await?;

    let EncodedTransaction::Json(ui_tx) = confirmed.transaction.transaction else {
        return Ok(None);
    };
    let UiMessage::Raw(raw) = ui_tx.message else {
        return Ok(None);
    };

    // Pasar a la logica pura: (program_id_index, accounts) por instruccion.
    let instructions: Vec<(u8, Vec<u8>)> = raw
        .instructions
        .iter()
        .map(|ins| (ins.program_id_index, ins.accounts.clone()))
        .collect();

    Ok(parse_raydium_launch(&raw.account_keys, &instructions, now_ts()))
}

/// Logica PURA del parseo de `initialize2`: dado el `account_keys` y las
/// instrucciones ya decodificadas, extrae el `TokenLaunch`. Testeable sin red.
///
/// Layout initialize2: 4 = pool, 7 = lp mint, 8 = coin(base) mint,
/// 9 = pc(quote) mint, 10 = coin vault, 11 = pc vault. El token "nuevo" es el
/// que no es WSOL; el "quote" es el lado SOL.
fn parse_raydium_launch(
    account_keys: &[String],
    instructions: &[(u8, Vec<u8>)],
    detected_at: u64,
) -> Option<TokenLaunch> {
    for (program_id_index, accounts) in instructions {
        let program = account_keys
            .get(*program_id_index as usize)
            .map(String::as_str);
        if program != Some(RAYDIUM_AMM_V4) {
            continue;
        }
        // Resuelve el i-esimo account del instruction a su pubkey.
        let account = |i: usize| -> Option<String> {
            accounts
                .get(i)
                .and_then(|&idx| account_keys.get(idx as usize))
                .cloned()
        };
        let (Some(pool), Some(coin), Some(pc)) = (account(4), account(8), account(9)) else {
            continue;
        };
        let lp_mint = account(7);
        let coin_vault = account(10);
        let pc_vault = account(11);

        let (mint, base_vault, quote_vault) = if coin == WSOL {
            (pc, pc_vault, coin_vault)
        } else {
            (coin, coin_vault, pc_vault)
        };

        return Some(TokenLaunch {
            mint,
            symbol: "?".to_string(),
            pool,
            base_vault,
            quote_vault,
            lp_mint,
            liquidity_sol: 0.0, // lo completa el paso 3 (enrich_launch)
            price_sol: 0.0,     // idem
            mint_authority_renounced: false, // idem
            freeze_authority_none: false,    // idem
            lp_burned: false,                // LP-burn no auto-verificado (ver README)
            detected_at,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const NEW_MINT: &str = "NEWm1nt1111111111111111111111111111111111111";

    /// Construye account_keys + una instruccion de Raydium con el layout de
    /// initialize2. `coin`/`pc` son los mints en las posiciones 8/9.
    fn build_init2(coin: &str, pc: &str) -> (Vec<String>, Vec<(u8, Vec<u8>)>) {
        // account_keys por indice:
        // 0=RAYDIUM, 1=filler, 2=pool, 3=lp, 4=coin_mint, 5=pc_mint,
        // 6=coin_vault, 7=pc_vault
        let keys = vec![
            RAYDIUM_AMM_V4.to_string(), // 0
            "filler".to_string(),       // 1
            "POOLxxxx".to_string(),     // 2
            "LPxxxx".to_string(),       // 3
            coin.to_string(),           // 4
            pc.to_string(),             // 5
            "COINVAULT".to_string(),    // 6
            "PCVAULT".to_string(),      // 7
        ];
        // accounts del instruction, posiciones 0..11 -> indices en keys.
        // pos 4=pool(2), 7=lp(3), 8=coin(4), 9=pc(5), 10=coinvault(6), 11=pcvault(7)
        let accounts = vec![1u8, 1, 1, 1, 2, 1, 1, 3, 4, 5, 6, 7];
        (keys, vec![(0u8, accounts)])
    }

    #[test]
    fn coin_es_wsol_toma_pc_como_mint() {
        let (keys, ins) = build_init2(WSOL, NEW_MINT);
        let l = parse_raydium_launch(&keys, &ins, 42).expect("deberia parsear");
        assert_eq!(l.mint, NEW_MINT);
        assert_eq!(l.pool, "POOLxxxx");
        assert_eq!(l.lp_mint.as_deref(), Some("LPxxxx"));
        // base_vault = vault del token nuevo (pc_vault), quote_vault = coin_vault (SOL)
        assert_eq!(l.base_vault.as_deref(), Some("PCVAULT"));
        assert_eq!(l.quote_vault.as_deref(), Some("COINVAULT"));
        assert_eq!(l.detected_at, 42);
    }

    #[test]
    fn pc_es_wsol_toma_coin_como_mint() {
        let (keys, ins) = build_init2(NEW_MINT, WSOL);
        let l = parse_raydium_launch(&keys, &ins, 0).expect("deberia parsear");
        assert_eq!(l.mint, NEW_MINT);
        assert_eq!(l.base_vault.as_deref(), Some("COINVAULT"));
        assert_eq!(l.quote_vault.as_deref(), Some("PCVAULT"));
    }

    #[test]
    fn instruccion_no_raydium_devuelve_none() {
        let (mut keys, ins) = build_init2(WSOL, NEW_MINT);
        keys[0] = "OtroProgramaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX".to_string();
        assert!(parse_raydium_launch(&keys, &ins, 0).is_none());
    }

    #[test]
    fn instruccion_con_pocas_cuentas_se_saltea() {
        let keys = vec![RAYDIUM_AMM_V4.to_string(), "a".to_string(), "b".to_string()];
        let ins = vec![(0u8, vec![1u8, 2])]; // solo 2 cuentas, no llega al indice 8/9
        assert!(parse_raydium_launch(&keys, &ins, 0).is_none());
    }

    #[test]
    fn campos_de_enriquecimiento_arrancan_vacios() {
        let (keys, ins) = build_init2(WSOL, NEW_MINT);
        let l = parse_raydium_launch(&keys, &ins, 0).unwrap();
        assert_eq!(l.liquidity_sol, 0.0);
        assert!(!l.mint_authority_renounced);
        assert!(!l.freeze_authority_none);
        assert!(!l.lp_burned);
        assert_eq!(l.symbol, "?");
    }
}
