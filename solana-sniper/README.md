# Solana Sniper (paper-trading first)

Bot sniper de tokens nuevos en Solana, en Rust. Estrategia: detectar
lanzamientos de tokens/pools nuevos, filtrar rugs con chequeos de seguridad, y
comprar rápido con reglas de salida (take-profit / stop-loss / timeout).

Se construyó **simulación primero**: hoy corre 100% en modo *paper trading*
(sin fondos ni transacciones reales), para validar toda la lógica. La
integración real con la cadena está aislada en módulos marcados con `TODO`.

## Arquitectura

```
detector  →  safety (rug checks)  →  decisión de compra  →  executor
                                                               │
                        monitor de posiciones (TP / SL / timeout) ─┘
```

| Módulo         | Rol                                    | Estado |
|----------------|----------------------------------------|--------|
| `config.rs`    | Carga `config.toml`                    | ✅ |
| `detector.rs`  | Detecta lanzamientos                   | ✅ simulado · ⏳ Raydium (mainnet) |
| `safety.rs`    | Rug checks (mint/freeze/LP/liquidez)   | ✅ |
| `executor.rs`  | Compra/venta                           | ✅ paper · ⏳ Jupiter (live) |
| `market.rs`    | Precios (random walk)                  | ✅ paper · ⏳ precios reales |
| `main.rs`      | Orquestación + gestión de posiciones   | ✅ |

## Cómo correrlo (simulación)

```bash
cd solana-sniper
cargo run
```

Ajustá parámetros en `config.toml` (monto, slippage, TP/SL, filtros de
seguridad, frecuencia de lanzamientos simulados). Para más logs:
`RUST_LOG=debug cargo run`.

## Pasar a live (próximos pasos)

Con `dry_run = true` no se envía nada a la cadena. El plan para operar real:

1. **Conexión devnet real** — añadir `solana-client` + `solana-sdk`, cargar el
   keypair desde `keypair_path`, y consultar balance en devnet.
2. **Detector Raydium** (`detector::spawn_raydium`) — suscripción WebSocket
   `logsSubscribe` al programa de Raydium; parsear `initialize2` para sacar
   mint, pool y liquidez.
3. **Safety on-chain** — leer mint/freeze authority de la cuenta del mint (SPL
   Token) y el estado de la LP desde la cuenta del pool.
4. **Executor Jupiter** — quote + swap tx firmada con el keypair, con manejo de
   slippage y prioridad de fees.
5. **Pruebas en devnet** antes de tocar mainnet con fondos reales.

> ⚠️ Seguridad: nunca commitear la clave privada. El `.gitignore` ya excluye
> `id.json`, `keypair*.json`, `*.key`.
