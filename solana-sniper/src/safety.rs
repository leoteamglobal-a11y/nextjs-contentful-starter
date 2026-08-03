//! Chequeos de seguridad (rug checks) antes de comprar.
//!
//! En modo simulacion, los atributos vienen en el `TokenLaunch`. En modo live
//! estos datos se obtienen on-chain: mint/freeze authority desde la cuenta del
//! mint (SPL Token), y el estado de la LP desde la cuenta del pool.

use crate::config::SafetyConfig;
use crate::types::TokenLaunch;

/// Resultado de la evaluacion de seguridad.
#[derive(Debug)]
pub enum SafetyVerdict {
    Pass,
    Reject(Vec<String>),
}

pub fn evaluate(cfg: &SafetyConfig, t: &TokenLaunch) -> SafetyVerdict {
    let mut reasons = Vec::new();

    if cfg.require_mint_authority_renounced && !t.mint_authority_renounced {
        reasons.push("mint authority NO renunciada (pueden acuñar mas supply)".to_string());
    }
    if cfg.require_freeze_authority_none && !t.freeze_authority_none {
        reasons.push("freeze authority presente (pueden congelar tu wallet)".to_string());
    }
    if cfg.require_lp_burned && !t.lp_burned {
        reasons.push("LP no quemada (pueden retirar la liquidez / rug)".to_string());
    }
    if t.liquidity_sol < cfg.min_liquidity_sol {
        reasons.push(format!(
            "liquidez {:.2} SOL < minimo {:.2} SOL",
            t.liquidity_sol, cfg.min_liquidity_sol
        ));
    }

    if reasons.is_empty() {
        SafetyVerdict::Pass
    } else {
        SafetyVerdict::Reject(reasons)
    }
}
