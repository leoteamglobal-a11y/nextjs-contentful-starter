//! Librería del sniper. Expone los módulos para que los binarios
//! (`main.rs` = simulación, `bin/devnet_check.rs` = conexión real) los reutilicen.

pub mod chain;
pub mod config;
pub mod detector;
pub mod executor;
pub mod jupiter;
pub mod market;
pub mod safety;
pub mod types;
