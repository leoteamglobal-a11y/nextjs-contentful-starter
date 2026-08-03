//! Mercado simulado (paper). Mantiene precios por mint y los mueve con un
//! random walk para poder disparar take-profit / stop-loss de forma realista.
//!
//! En modo live esto se reemplaza por precios reales (Jupiter price API / pools).

use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Default)]
pub struct PaperMarket {
    prices: Arc<Mutex<HashMap<String, f64>>>,
}

impl PaperMarket {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registra/actualiza el precio de un mint.
    pub fn set(&self, mint: &str, price: f64) {
        self.prices.lock().unwrap().insert(mint.to_string(), price);
    }

    /// Precio actual de un mint, si existe.
    pub fn price(&self, mint: &str) -> Option<f64> {
        self.prices.lock().unwrap().get(mint).copied()
    }

    /// Deja de trackear un mint (posicion cerrada).
    pub fn remove(&self, mint: &str) {
        self.prices.lock().unwrap().remove(mint);
    }

    /// Lanza un task que mueve todos los precios cada 500ms.
    /// Ligero sesgo alcista + volatilidad, para simular la vida de un token nuevo.
    pub fn spawn_random_walk(&self) {
        let prices = self.prices.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let mut guard = prices.lock().unwrap();
                let mut rng = rand::thread_rng();
                for price in guard.values_mut() {
                    // cambio entre -8% y +9% por tick
                    let change: f64 = rng.gen_range(-0.08..0.09);
                    *price *= 1.0 + change;
                    if *price < 0.0 {
                        *price = 0.0;
                    }
                }
            }
        });
    }
}
