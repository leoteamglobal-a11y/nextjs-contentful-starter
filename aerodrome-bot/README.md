# Aerodrome Signal Bot (Base)

Bot de **entrada/salida por señales** para un pool de **Aerodrome Slipstream**
(liquidez concentrada, estilo Uniswap V3) en **Base**. Pool objetivo:
`USDC-VELVET CL1 0.01%`.

Construido **simulación primero** (TypeScript + viem). Hoy corre 100% en paper:
motor de señales + feed simulado + ejecutor de papel. La ejecución real y la
lectura on-chain están aisladas y marcadas como TODO.

> ⚠️ Este pool es de **altísimo riesgo**: par estable (USDC) + token volátil
> (VELVET) en un rango muy angosto → mucho impermanent loss, y el APY gigante es
> un espejismo de incentivos. La simulación ya muestra salidas frecuentes por
> "fuera de rango". No es asesoramiento financiero.

## Arquitectura

```
feed (estado del pool) → signals (decidir) → executor (entrar/salir)
```

| Módulo | Rol | Estado |
|--------|-----|--------|
| `signals.ts`  | Motor de decisión PURO (enter/exit/hold) | ✅ |
| `feed.ts`     | Estado del pool: simulado ✅ · on-chain ✅ (validar con red) | ok |
| `executor.ts` | Paper ✅ · Live Aerodrome ✅ (validar con red) | ok |
| `config.ts`   | Config + umbrales | ✅ |
| `index.ts`    | Loop principal | ✅ |

## Señales (config)

- **Entrar** cuando `APY ≥ enterApyMin` y no hay posición; abre rango
  `± rangeWidthPct` alrededor del precio.
- **Salir** si (cualquiera): `APY < exitApyMin`, precio fuera de rango,
  VELVET se movió `≥ maxVelvetMovePct`, stop-loss o take-profit.

## Correr (simulación)

```bash
cd aerodrome-bot
npm install
npm run sim        # usa config.sim.json (rápido)
npm start          # usa config.json
npm run typecheck
```

## Feed on-chain ✅ (implementado)

`OnchainFeed` lee el precio de VELVET desde `slot0()` del pool Slipstream (vía
viem + RPC de Base) y el APY/TVL desde DefiLlama (cacheado).

```bash
# 1. Poné la dirección real del pool en config.onchain.json (pool.address)
# 2. Corré:
npm start config.onchain.json
```

**Cómo obtener `pool.address`:** entrá al pool en la app de Aerodrome o buscá el
par USDC-VELVET (CL1) en Basescan; es la dirección del contrato del pool CL, no
el uuid de DefiLlama.

> Requiere red hacia Base y DefiLlama. No se pudo probar desde el entorno de
> desarrollo (egress bloqueado); el código corre y el loop tolera errores de red.
> El cálculo de precio desde `sqrtPriceX96` es aproximado (usa `Number`) —
> validalo contra un explorador la primera vez.

## Executor live ✅ (implementado)

`LiveExecutor` opera liquidez real en el **NonfungiblePositionManager de
Slipstream** (`0x827922686190790b37229fd06084350e74485b72`):
- **enter** → `mint(...)` (convierte el rango de precios a ticks, aprueba los
  tokens, abre la posición NFT).
- **increase** → `increaseLiquidity(...)` sobre el MISMO NFT: agrega exposición
  sin cerrar/abrir, hasta `maxPositionUsd`, cuando el APY sigue alto y en rango.
- **reposition** → cuando el precio se sale del rango pero el pool sigue
  atractivo: `decreaseLiquidity`+`collect`+`mint` en un rango nuevo centrado en
  el precio actual, en un paso (el capital no queda parado).
- **exit** → `decreaseLiquidity(...)` + `collect(...)`.

Config `signals`:
- Aporte: `increaseApyMin`, `increaseStepUsd`, `maxPositionUsd`.
- Reposición: `reposition` (bool), `repositionApyMin`.
- Fuera de rango, el orden es: take-profit → stop-loss → reposición → salida.

### Cómo activarlo (con MUCHO cuidado)

```bash
# 1. clave privada SOLO por entorno, nunca en el config:
export PRIVATE_KEY=0x....

# 2. en el config: dryRun=false y liveConfirmed=true (DOBLE traba),
#    y completá pool.address + [live].positionManager.

# 3. corré:
npm start config.onchain.json
```

**Tres trabas de seguridad** (todas verificadas):
1. `dryRun=false` **Y** `liveConfirmed=true` (si falta una, no arranca).
2. `PRIVATE_KEY` debe venir del entorno (nunca del archivo).
3. Avisos y logs de cada tx.

**Cantidades y slippage:** las cantidades se calculan con **TickMath exacto**
(`getSqrtRatioAtTick`, enteros, idéntico al on-chain) y las fórmulas enteras de
`LiquidityAmounts` según dónde cae el precio en el rango. Los `amountMin` van con
slippage real (`applySlippageDown`), al entrar y al salir. Verificado con tests,
incluidas las constantes canónicas `MIN/MAX_SQRT_RATIO` de Uniswap (`npm test`).

> 🔴 **UNTESTED contra la red real** (egress bloqueado en desarrollo). Antes de
> usar montos serios, **validá con una posición mínima** y verificá en Basescan:
> dirección del position manager, `tickSpacing` del pool y las cantidades. La
> única parte aproximada que queda es el **dimensionado de L por USD** (usa el
> precio y `Number` para escalar) — no crítico: los mins protegen y el contrato
> recalcula la liquidez exacta.

### Mejoras futuras

- Modelo de impermanent loss real en el PnL estimado del paper.
- Cobro de fees sin cerrar (`collect` periódico) para posiciones de largo plazo.

## Seguridad

Nunca commitear claves. `.gitignore` excluye `.env`, `*.key`, `keystore*.json`.
Empezá con montos que estés dispuesto a perder.
