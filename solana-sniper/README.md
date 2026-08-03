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

## Paso 1 — Conexión devnet real ✅ (implementado)

Binario `devnet-check`: conecta al RPC, carga/crea el keypair, muestra versión
del nodo, pubkey y balance, y en devnet pide airdrop si el balance está bajo.

```bash
cd solana-sniper
cargo run --bin devnet-check          # usa config.toml (rpc_url, keypair_path)
```

> ⚠️ Requiere salida a internet hacia el RPC. En entornos con egress
> restringido (proxy con allowlist, como Claude Code en la nube) la conexión a
> `api.devnet.solana.com` es rechazada con 403 por política — correlo en tu
> máquina o en un entorno con ese host permitido. El código está probado:
> compila y ejecuta; solo lo frena la red del entorno.

Si no tenés keypair, `devnet-check` genera uno y lo guarda en `keypair_path`
(por defecto `~/.config/solana/id.json`). Guardá esa clave con cuidado.

## Pasar a live (próximos pasos)

Con `dry_run = true` no se envía nada a la cadena. El plan restante:

1. ~~**Conexión devnet real**~~ ✅ hecho (ver arriba).
2. ~~**Detector Raydium**~~ ✅ hecho (`detector::run_raydium`) — suscripción
   WebSocket `logsSubscribe` al programa AMM v4 de Raydium; detecta
   `initialize2` y parsea la transacción para extraer pool + mint nuevo.

   ```bash
   cargo run -- config.mainnet.toml   # detecta pools reales (dry_run = true)
   ```

   > Deja `dry_run = true`: detecta pools reales pero no compra hasta tener el
   > paso 3. Los campos de liquidez/precio/autoridades quedan en cero hasta el
   > paso 3 (safety on-chain). Requiere red; usá un RPC dedicado para el WS.
   > Este parseo (layout de `initialize2`) necesita validación contra datos
   > reales de mainnet la primera vez que lo corras.
3. ~~**Safety on-chain**~~ ✅ hecho (`chain::enrich_launch`) — lee mint/freeze
   authority de la cuenta del mint y las reservas de los vaults (liquidez/precio),
   completando lo que el detector deja en cero. Se ejecuta automáticamente antes
   de `safety::evaluate` cuando el detector es `raydium`.

   > LP-burn: aún **no** se auto-verifica de forma fiable. En mainnet dejá
   > `require_lp_burned = false`, o integrá un servicio de rug-check (RugCheck /
   > Birdeye) como paso futuro. Los otros checks (mint/freeze/liquidez) sí son
   > reales.
4. ~~**Executor Jupiter**~~ ✅ motor de swap listo (`jupiter.rs` + binario `swap`).
   Herramienta manual para probar un swap antes de automatizar:

   ```bash
   # solo cotización (seguro, no firma nada):
   cargo run --bin swap -- So11111111111111111111111111111111111111112 <TOKEN> 10000000
   # firmar y enviar de verdad:
   cargo run --bin swap -- So11111111111111111111111111111111111111112 <TOKEN> 10000000 --live
   ```

   > ⚠️ **No probado contra la red real desde el entorno de desarrollo** (egress
   > bloqueado). Validá SIEMPRE primero la cotización (sin `--live`), después un
   > swap con monto chico. La clave privada nunca se loguea ni se commitea.
   > Falta aún: cablear este executor dentro del loop automático del sniper
   > (hoy el bot automático sigue en paper); se hará una vez validado el swap
   > manual.
5. **Pruebas en devnet/mainnet** con montos chicos antes de automatizar y escalar.

> ⚠️ Seguridad: nunca commitear la clave privada. El `.gitignore` ya excluye
> `id.json`, `keypair*.json`, `*.key`.
