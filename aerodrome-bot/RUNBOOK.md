# RUNBOOK — operar el bot en vivo

Guía operativa corta. Asume que ya validaste con `TESTING.md`. Config base:
`config.live-conservative.json`. **Solo capital que podés perder.**

---

## Antes de arrancar (una vez)

- [ ] `npm install && npm test` → 33 tests verdes.
- [ ] Wallet **nueva y dedicada** en Base, con solo el capital de riesgo + un
      poco de ETH para gas (~$3–5 alcanza para muchas tx).
- [ ] `pool.address` real puesto en el config (Basescan / app de Aerodrome).
- [ ] Corrida en `dryRun:true` con `feed:onchain`: el precio y APY que imprime
      coinciden con Dexscreener. Si no coinciden, **parar** y avisar.
- [ ] Un `mint` mínimo con `--live` verificado en Basescan (paso 4 de TESTING).

---

## Arranque live

```bash
cd aerodrome-bot

# 1. Clave privada SOLO por entorno (nunca en archivo, nunca en git):
export PRIVATE_KEY=0xTU_CLAVE_DEDICADA

# 2. En config.live-conservative.json:
#    "dryRun": false
#    "liveConfirmed": true         <- las DOS, si no, no arranca
#    "positionSizeUsd": 20         <- empezá con esto, NO lo subas todavía

# 3. Lanzar:
npm start config.live-conservative.json
```

Al entrar deberías ver:
```
#  MODO LIVE ACTIVO — LIQUIDEZ REAL EN BASE
[LIVE] wallet 0x... | pool 0x... | pm 0x827922...
[LIVE] ENTER tokenId <N> ... | tx 0x<hash>
```
Guardá el `tokenId` y el link `https://basescan.org/tx/<hash>`.

> Dejalo corriendo en una terminal estable (o `tmux`/`screen` en un VPS). Si se
> corta el proceso, la posición **sigue abierta on-chain** — no se cierra sola.

---

## Chequeo diario (2 minutos)

1. **¿El proceso sigue vivo?** Si murió, reiniciá con el mismo comando (relee la
   posición on-chain vía el `tokenId`... ojo: hoy el bot NO persiste el `tokenId`
   entre reinicios — ver "Límite conocido" abajo).
2. **Balance de la wallet** en Basescan: ¿tiene sentido vs. ayer?
3. **La posición en la app de Aerodrome**: ¿sigue en rango? ¿fees acumulados?
4. **Precio de VELVET** (Dexscreener): ¿se movió fuerte?
5. **Gas restante** (ETH en la wallet): que no se acabe.

Anotá cada día: valor total (posición + wallet), y si hubo ENTER/EXIT/COLLECT.

---

## Cuándo CORTAR (reglas claras, decididas en frío)

Cerrá todo y salí si pasa cualquiera de estas:

- 🔴 **Perdiste el % que fijaste como tope** (sugerido: **−20% del capital**).
  No "esperes a que se recupere". Ese es el error que funde a todos.
- 🔴 **3 semanas seguidas en negativo** → la tesis no funciona, cortá.
- 🔴 **El APY real se desplomó** y no vuelve (los incentivos se agotaron).
- 🔴 **Señal de rug**: liquidez del pool cae en picada, o no podés vender en
  Dexscreener. Salí YA.
- 🔴 **Necesitás el dinero** para otra cosa. Nunca es "solo un mes más".

### Salida de emergencia (manual)

Si querés cerrar sin esperar al bot: en la **app de Aerodrome**, buscá tu
posición (el `tokenId`) → *Remove liquidity* (100%) + *Collect*. Eso te saca del
pool en una transacción manual, sin depender del proceso.

---

## Subir el monto (solo si TODO esto se cumple)

- Corriste ≥ **2 semanas** con $20 sin bugs.
- Los números reales coinciden con lo que esperabas.
- Estás emocionalmente OK con las pérdidas que ya viste.

Recién ahí subís **de a poco** (ej. $20 → $50 → $100). Nunca dupliques de golpe.

---

## Límite conocido (importante)

El bot **no persiste el `tokenId` entre reinicios**. Si matás el proceso y lo
relanzás, arranca "sin posición" en su memoria, aunque tengas una abierta
on-chain. Por ahora:
- Mantené el proceso vivo (VPS + tmux), **o**
- Gestioná los cierres manualmente desde la app de Aerodrome.

(Persistir el `tokenId` a disco es una mejora fácil — pedila si vas a operar en
serio y te preparo eso antes de subir el monto.)

---

## Recordatorios de seguridad

- Clave privada: **solo** `PRIVATE_KEY` en el entorno. Nunca en el config ni en
  git. `.gitignore` ya excluye `.env`, `*.key`, `keystore*.json`.
- Wallet dedicada, capital que podés perder.
- Este código **no fue probado en la red por mí** (egress bloqueado en
  desarrollo) — vos sos el primer test real. Por eso: empezá con $20.
- Nada de esto es asesoramiento financiero.
