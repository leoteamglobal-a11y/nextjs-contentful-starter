# Guía de validación — Solana Sniper

Cómo comprobar, en orden y con red real, que cada pieza funciona antes de operar
con fondos. Todo lo de abajo se corre **en tu máquina** (o en un entorno con
salida a internet); el entorno de desarrollo en la nube tiene el egress
bloqueado, así que los pasos 1–4 no se pudieron probar en vivo ahí.

**Regla de oro:** avanzá un paso a la vez. No pases al siguiente si el anterior
no dio lo esperado. Usá siempre montos chicos.

---

## 0. Requisitos

```bash
# Rust (si no lo tenés)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# (opcional) Solana CLI, útil para manejar el keypair y pedir airdrops
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

cd solana-sniper
cargo build            # primera vez baja dependencias; puede tardar unos minutos
```

**Esperado:** `Finished ... target(s)` sin errores. Se generan 3 binarios:
`solana-sniper`, `devnet-check`, `swap`.

---

## 1. Paper trading (sin red, sin riesgo)

Confirma que toda la lógica (detección → safety → compra → TP/SL) funciona.

```bash
cargo run -- config.demo.toml
```

**Esperado:** en segundos empiezan a aparecer líneas `[PAPER] COMPRA ...`,
después `[PAPER] VENTA (TAKE-PROFIT/STOP-LOSS/TIMEOUT) ...` y un
`PnL realizado acumulado: ... | W:x L:y`. Cortá con `Ctrl-C`.

Con la config estricta verás sobre todo rechazos (es lo correcto):

```bash
cargo run                 # usa config.toml (safety estricto)
```

**Esperado:** líneas `RECHAZADO SYMBOL (...): mint authority NO renunciada; ...`.

✅ Si ves compras/ventas en demo y rechazos en la estricta, la lógica está OK.

---

## 2. Conexión a devnet (red real, sin fondos en riesgo)

```bash
cargo run --bin devnet-check
```

**Esperado:**
```
== Solana devnet check ==
network : devnet
rpc     : https://api.devnet.solana.com
conectado ✓  solana-core <versión>
keypair : /ruta/.config/solana/id.json  (nuevo)   # si no existía, lo crea
wallet  : <TU_PUBKEY>
balance : 0 SOL
balance bajo — pidiendo airdrop de 1 SOL (devnet)...
airdrop ✓  nuevo balance: 1 SOL
paso 1 completo ✓
```

**Si falla:**
- `tunnel error` / `Connect` → no hay salida a internet (o egress bloqueado).
- `airdrop falló (faucet limitado)` → normal, el faucet público limita; probá
  de nuevo más tarde o usá `solana airdrop 1 <pubkey> --url devnet`.

✅ Si ves versión + wallet + balance, la conexión a la cadena funciona.

---

## 3. Detector Raydium (red real, mainnet, SIN comprar)

Detecta pools nuevos reales. `dry_run = true` en `config.mainnet.toml`, así que
**no compra** — solo detecta y muestra el veredicto on-chain.

```bash
cargo run -- config.mainnet.toml
```

> Recomendado: usá un RPC dedicado (Helius, Triton, QuickNode) en `rpc_url` /
> `ws_url`. El endpoint público de mainnet limita mucho el WebSocket y quizás no
> veas eventos.

**Esperado:**
```
detector Raydium — ws: wss://...
detector Raydium: suscrito a logs de 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
Raydium pool nuevo: mint <MINT> pool <POOL>
on-chain <MINT> liq X.XX SOL precio 0.0000000123 mintAuth:renunciada freeze:no
RECHAZADO ? (...): ...        # o "OK ? liq ... — entrando" si pasa el safety
```

**Qué validar acá (lo más importante del test):**
1. Que **detecte** pools (aparece "Raydium pool nuevo").
2. Que el `mint` corresponda al token nuevo real (verificalo en
   `https://solscan.io/token/<MINT>` o Dexscreener).
3. Que `liq` y `mintAuth/freeze` tengan valores coherentes con lo que ves en un
   explorador. **Este es el punto que hay que confirmar contra datos reales** —
   si el mint o la liquidez salieran mal, el parseo de `initialize2` necesita
   ajuste.

✅ Si detecta pools y el mint/liquidez coinciden con el explorador, los pasos
2 y 3 están validados.

---

## 4. Swap con Jupiter (empezá por la cotización)

### 4a. Solo cotización (100% seguro, NO firma nada)

Comprar un token con 0.01 SOL = `10000000` lamports (SOL tiene 9 decimales):

```bash
cargo run --bin swap -- \
  So11111111111111111111111111111111111111112 <MINT_DEL_TOKEN> 10000000
```

**Esperado:**
```
== Jupiter swap ==
in : So1111...112
out: <MINT>
amount: 10000000 (unidades base)  slippage: 300 bps
cotización: outAmount <N>  priceImpact <x>
(cotización solamente) — agregá --live para firmar y enviar.
```

**Si falla:** `Jupiter /quote devolvió error` suele ser un mint inexistente/sin
ruta, o rate limit. Probá con un token líquido conocido primero.

### 4b. Swap real (¡fondos reales!)

Solo cuando 4a funcione y con un **monto chico** (ej. 0.005 SOL). Necesitás SOL
real en la wallet de `keypair_path` y `rpc_url` apuntando a mainnet.

```bash
cargo run --bin swap -- \
  So11111111111111111111111111111111111111112 <MINT> 5000000 --live
```

**Esperado:**
```
⚠️  MODO LIVE — se firmará con tu clave y se enviará una transacción REAL.
wallet: <TU_PUBKEY>
swap enviado ✓  https://solscan.io/tx/<SIGNATURE>
```

Abrí el link y confirmá que el swap se ejecutó. Para vender, invertí los mints
(input = token, output = SOL).

✅ Si un swap chico se confirma en Solscan, el paso 4 está validado.

---

## Checklist

- [ ] 1. Paper trading muestra compras/ventas (demo) y rechazos (estricta)
- [ ] 2. `devnet-check` conecta y muestra wallet + balance
- [ ] 3. Detector Raydium detecta pools y el mint/liquidez coinciden con el explorador
- [ ] 4a. Cotización de Jupiter devuelve `outAmount`
- [ ] 4b. Un swap chico `--live` se confirma en Solscan

---

## Seguridad — leé esto

- **Nunca** compartas ni commitees tu keypair. `.gitignore` ya excluye
  `id.json`, `keypair*.json`, `*.key`. Verificá con `git status` antes de subir.
- Empezá con montos que estés dispuesto a perder. Los tokens nuevos son de
  altísimo riesgo (rugs, honeypots).
- `require_lp_burned` está en `false` porque ese chequeo aún no es automático;
  no asumas que un token con LP no quemada es seguro.
- El bot automático (`solana-sniper`) **todavía opera en paper** aunque detecte
  en real. Ejecutar swaps reales es, por ahora, manual con el binario `swap`.
  Cablear la ejecución al loop automático es el paso siguiente, una vez que
  validaste todo lo de arriba.

## Reportar resultados

Cuando corras esto, anotá en qué paso estás y qué viste (copiá la salida). Con
eso ajustamos lo que haga falta — sobre todo el paso 3 (parseo real) y el
paso 4 (swaps), que son los que no se pudieron probar en el entorno de desarrollo.
