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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TokenLaunch;

    fn clean_launch() -> TokenLaunch {
        TokenLaunch {
            mint: "mint".into(),
            symbol: "SYM".into(),
            pool: "pool".into(),
            base_vault: None,
            quote_vault: None,
            lp_mint: None,
            liquidity_sol: 10.0,
            price_sol: 0.001,
            mint_authority_renounced: true,
            freeze_authority_none: true,
            lp_burned: true,
            detected_at: 0,
        }
    }

    fn strict_cfg() -> SafetyConfig {
        SafetyConfig {
            require_mint_authority_renounced: true,
            require_freeze_authority_none: true,
            require_lp_burned: true,
            min_liquidity_sol: 5.0,
        }
    }

    #[test]
    fn token_limpio_pasa() {
        assert!(matches!(evaluate(&strict_cfg(), &clean_launch()), SafetyVerdict::Pass));
    }

    #[test]
    fn mint_authority_activa_rechaza() {
        let mut t = clean_launch();
        t.mint_authority_renounced = false;
        assert!(matches!(evaluate(&strict_cfg(), &t), SafetyVerdict::Reject(_)));
    }

    #[test]
    fn freeze_authority_presente_rechaza() {
        let mut t = clean_launch();
        t.freeze_authority_none = false;
        assert!(matches!(evaluate(&strict_cfg(), &t), SafetyVerdict::Reject(_)));
    }

    #[test]
    fn liquidez_baja_rechaza() {
        let mut t = clean_launch();
        t.liquidity_sol = 1.0;
        assert!(matches!(evaluate(&strict_cfg(), &t), SafetyVerdict::Reject(_)));
    }

    #[test]
    fn checks_desactivados_permiten_todo() {
        let cfg = SafetyConfig {
            require_mint_authority_renounced: false,
            require_freeze_authority_none: false,
            require_lp_burned: false,
            min_liquidity_sol: 0.0,
        };
        let mut t = clean_launch();
        t.mint_authority_renounced = false;
        t.freeze_authority_none = false;
        t.lp_burned = false;
        assert!(matches!(evaluate(&cfg, &t), SafetyVerdict::Pass));
    }
}
