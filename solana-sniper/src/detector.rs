//! Deteccion de tokens nuevos.
//!
//! - `spawn_simulated`: genera lanzamientos falsos a intervalos aleatorios,
//!   con atributos de seguridad variados, para probar toda la logica sin cadena.
//! - `spawn_raydium` (TODO): en mainnet, suscribirse via WebSocket a los logs
//!   del programa de Raydium (`logsSubscribe`) y parsear los eventos de
//!   `initialize2` / creacion de pool para extraer el mint y la liquidez.

use crate::config::DetectorConfig;
use crate::types::{now_ts, TokenLaunch};
use rand::Rng;
use tokio::sync::mpsc::Sender;
use tokio::time::{sleep, Duration};

/// Genera una cadena base58-ish pseudo-aleatoria (para mints/pools falsos).
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
            // espera aleatoria alrededor del intervalo configurado
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
                    liquidity_sol: rng.gen_range(0.5..40.0),
                    price_sol: rng.gen_range(0.0000001..0.00005),
                    // La mayoria de los lanzamientos NO son limpios: sesgo hacia rugs.
                    mint_authority_renounced: rng.gen_bool(0.55),
                    freeze_authority_none: rng.gen_bool(0.6),
                    lp_burned: rng.gen_bool(0.5),
                    detected_at: now_ts(),
                }
            };

            if tx.send(launch).await.is_err() {
                break; // el receptor se cerro
            }
        }
    });
}

/// TODO(mainnet): detector real de Raydium via logsSubscribe.
/// Se deja el stub para dejar clara la interfaz esperada.
#[allow(dead_code)]
pub fn spawn_raydium(_rpc_ws_url: String, _tx: Sender<TokenLaunch>) {
    tracing::warn!(
        "detector 'raydium' aun no implementado (mainnet). \
         Requiere suscripcion WebSocket a los logs del programa de Raydium."
    );
}
