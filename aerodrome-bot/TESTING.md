# Guía de validación — Aerodrome Signal Bot

Cómo comprobar cada pieza, en orden, antes de arriesgar fondos. Se corre **en tu
máquina** (con red): el entorno de desarrollo tiene el egress bloqueado, así que
los pasos con RPC/Base no se pudieron probar ahí.

**Regla de oro:** un paso a la vez. No avances si el anterior no dio lo
esperado. Montos mínimos.

---

## 0. Requisitos

```bash
cd aerodrome-bot
npm install
npm run typecheck    # debe terminar sin errores
```

Necesitás además:
- La **dirección del contrato del pool** USDC-VELVET CL1 (de la app de Aerodrome
  o Basescan). Va en `config.onchain.json` → `pool.address`.
- Para live: una wallet en **Base** con algo de USDC + VELVET + ETH (gas), y su
  **clave privada** (solo por entorno, ver paso 4).

---

## 1. Simulación (sin red, sin riesgo)

```bash
npm run sim        # config.sim.json
```

**Esperado:** líneas `[PAPER] ENTER ...` cuando el APY simulado supera el umbral,
y `[PAPER] EXIT (...)` con el motivo (fuera de rango / APY bajo / SL / TP), más
`PnL acumulado`. Cortá con `Ctrl-C`.

✅ Si ves entradas y salidas por señales, la lógica está OK. (Vas a ver muchas
salidas por "fuera de rango": es correcto — refleja el riesgo del par volátil en
rango angosto.)

---

## 2. Feed on-chain (red real, SIN operar)

Con `dryRun=true`, lee el pool real pero **no pone fondos**.

```bash
# 1. Poné pool.address real en config.onchain.json
# 2. Corré:
npm start config.onchain.json
```

**Esperado:** cada tick, el bot lee el precio de VELVET desde el pool y el
APY/TVL desde DefiLlama, y decide (probablemente ENTER en paper si el APY alto
supera el umbral).

**Qué validar (lo más importante):**
- Que el **precio de VELVET** que imprime/usa el bot coincida con
  Dexscreener/Basescan (± algo). Si difiere por órdenes de magnitud, revisá el
  cálculo desde `sqrtPriceX96` o la identificación de token0/token1.
- Que el **APY/TVL** coincidan con DefiLlama.

**Si falla:**
- `config.pool.address vacío` → faltó poner la dirección real.
- `feed error: ...` (repetido) → problema de RPC; probá otro `rpcUrl` (Base
  público limita; usá un RPC dedicado).

✅ Si el precio y APY coinciden con exploradores, el feed on-chain está validado.

---

## 3. Ajustar señales (en simulación o con feed real en paper)

Editá `signals` en el config y observá el comportamiento:
- `enterApyMin` / `exitApyMin` — umbrales de entrada/salida por APY.
- `rangeWidthPct` — ancho del rango (más angosto = más fees pero más "fuera de
  rango").
- `maxVelvetMovePct`, `stopLossPct`, `takeProfitPct`.

✅ Cuando el patrón de entradas/salidas te cierre, pasás a live.

---

## 4. Live — liquidez real (¡fondos!) 🔴

Solo después de validar 1–3, y con **monto mínimo**.

```bash
# 1. Clave privada SOLO por entorno (nunca en el archivo):
export PRIVATE_KEY=0xTU_CLAVE

# 2. En config.onchain.json:
#    "dryRun": false
#    "liveConfirmed": true          (DOBLE traba: hacen falta las dos)
#    "positionSizeUsd": 5           (empezá chico)
#    pool.address y live.positionManager completos

# 3. Corré:
npm start config.onchain.json
```

**Esperado al entrar:**
```
#  MODO LIVE ACTIVO — LIQUIDEZ REAL EN BASE
[LIVE] wallet 0x... | pool 0x... | pm 0x827922...
[LIVE] approve 0x... ok (0x<txhash>)     # una o dos veces la primera vez
[LIVE] ENTER tokenId <N> liq <L> ticks [<lo>,<hi>] ~$5 | tx 0x<hash>
```
Abrí `https://basescan.org/tx/<hash>` y confirmá el mint. En la app de Aerodrome
deberías ver la posición NFT.

**Al salir** (cuando dispare una señal):
```
[LIVE] EXIT (motivo) tokenId <N> -> ~$<x> (PnL ~$<y>) | tx 0x<hash>
```

**Trabas (todas verificadas):**
- Sin `liveConfirmed=true` → no arranca ("modo LIVE bloqueado").
- Sin `PRIVATE_KEY` en el entorno → no arranca.

🔴 **Antes de escalar**, verificá en Basescan la **primera** operación real:
- que los **ticks** del rango sean los que esperabas,
- que las **cantidades** aportadas tengan sentido,
- que el **collect** al salir te devolvió los fondos.

---

## Checklist

- [ ] 1. Simulación entra/sale por señales
- [ ] 2. Feed on-chain: precio y APY coinciden con exploradores
- [ ] 3. Señales ajustadas a tu gusto
- [ ] 4. Un `mint` mínimo confirmado en Basescan + `collect` al salir

---

## ⚠️ Limitaciones conocidas (leer antes de live)

- **Sin protección de slippage en el `mint`** (`amount0Min/1Min = 0`). Solo apto
  para montos mínimos hasta implementar mins reales.
- **Ratio de amounts 50/50 USD** por lado (no óptimo para el rango; puede quedar
  token sin usar).
- **Precio desde `sqrtPriceX96` aproximado** (usa `Number`).
- **No probado contra la red** desde el desarrollo — vos sos el primer test real.
- Recordá: este pool es **de altísimo riesgo** (par estable+volátil, IL alto, APY
  espejismo). Nada de esto es asesoramiento financiero.

## Seguridad

- La clave privada **solo** por `PRIVATE_KEY` en el entorno. Nunca en el config
  ni en git. `.gitignore` excluye `.env`, `*.key`, `keystore*.json`.
- Empezá con lo que estés dispuesto a perder.

## Reportar

Anotá en qué paso estás y pegá la salida (o el error). Con eso ajustamos —
sobre todo el precio del feed (paso 2) y la primera operación live (paso 4).
