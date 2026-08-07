# Guía del Executor — de paper a real (paso a paso)

Esta guía te lleva desde ver el bot operar **solo con dinero ficticio** hasta
(si querés) operar con **plata real**. Seguí el orden. No te saltes el modo paper.

> Antes de esto tenés que haber hecho `SETUP.md` (Node instalado, `npm install`,
> y tu `HELIUS_API_KEY` en el `.env`).

---

## Etapa 1 — Verlo operar solo, SIN riesgo (paper)

Este es el modo por defecto (`EXECUTION_MODE=dry`). El bot decide y "compra/vende"
con dinero ficticio, usando precios reales de Jupiter.

**Probá la simulación offline (no necesita nada):**
```bash
npm run exec:demo
```
Vas a ver cómo entra en una posición nueva, ignora la que ya tiene, **no persigue**
el token pumpeado, y cierra con ganancia. Así piensa el bot.

**Ahora con datos reales de @reboot, una pasada:**
```bash
npm run watch:once
```
Mira a @reboot y, si abrió algo nuevo, el executor lo "compra" en papel y te
muestra la decisión. Ejemplo:
```
🧪 EXECUTION_MODE=dry — autonomous PAPER trading (no real funds).
[exec] 🟢 BUY [paper] Sleepy Dog · 0.100 SOL · (PAPER fill)
```

**Dejalo corriendo (vigila + opera en papel 24/7):**
```bash
npm run watch
```

👉 **Quedate en esta etapa varios días.** Mirá el archivo `out/exec-state.json`:
ahí se guarda tu PnL en papel y las posiciones. Si el bot en papel te convence,
recién ahí pensás en real.

---

## Etapa 2 — El botón de pánico (aprendelo AHORA)

Antes de tocar plata real, memorizá esto:

```bash
npm run stop     # 🛑 frena TODA operación al instante
npm run resume   # ▶️ reanuda
```

`stop` crea un archivo `out/STOP`. Mientras exista, el bot **no compra nada**.
Es tu freno de emergencia. Probalo ahora en paper para ver que funciona.

---

## Etapa 3 — Pasar a real (solo si querés y con cuidado)

⚠️ **Desde acá se mueve plata de verdad, automáticamente.** Hacelo solo si
entendiste cómo opera el bot en papel.

### 3.1 — Creá una wallet DEDICADA

No uses tu wallet principal. Creá una **nueva** (en Phantom, por ejemplo) solo
para el bot, y mandale **poca plata que puedas perder** (arrancá con ~0.5–1 SOL).

### 3.2 — Sacá la private key (base58)

En Phantom: **Settings → Manage Accounts → (tu wallet nueva) → Show Private Key**.
Te da una cadena larga (formato base58). Esa es tu `WALLET_PRIVATE_KEY`.

> 🔒 Es como la llave de tu caja fuerte. Nunca la compartas, nunca la subas a
> ningún lado. El `.env` ya está protegido para no subirse a GitHub.

### 3.3 — Conseguí un RPC

En tu panel de Helius (el mismo de la API key) copiá tu **Solana RPC URL**
(algo como `https://mainnet.helius-rpc.com/?api-key=...`). Esa es tu `RPC_URL`.

### 3.4 — Configurá el `.env`

```
EXECUTION_MODE=live
WALLET_PRIVATE_KEY=tu-clave-base58
RPC_URL=tu-url-de-helius

# Empezá CHICO:
FIXED_SIZE_SOL=0.05        # 0.05 SOL por trade
DAILY_CAP_SOL=0.2          # máximo 0.2 SOL por día
MAX_TRADES_PER_DAY=5
MAX_SLIPPAGE_BPS=100       # 1%
```

### 3.5 — Encendelo

```bash
npm run watch
```
Vas a ver el banner de advertencia y los límites. Cada compra/venta real te
muestra el link a Solscan. Si algo te incomoda: `npm run stop`.

---

## Checklist antes de ir a real

- [ ] Vi el bot operar en **paper** varios días y me convenció.
- [ ] Probé `npm run stop` y `npm run resume`.
- [ ] Uso una wallet **dedicada**, no la principal.
- [ ] Puse **poca plata** que puedo perder.
- [ ] Empecé con `FIXED_SIZE_SOL` y `DAILY_CAP_SOL` chicos.
- [ ] Entiendo que puedo perder por slippage, bugs o rug-pulls.

---

## Recordatorio final

Esto **no es consejo financiero**. El copy trading de memecoins es de altísimo
riesgo. El bot te da una herramienta con frenos, pero la decisión y el riesgo son
tuyos. Empezá chico, andá despacio, y no arriesgues lo que no podés perder.
