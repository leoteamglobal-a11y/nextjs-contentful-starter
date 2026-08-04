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
- **exit** → `decreaseLiquidity(...)` + `collect(...)`.

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

> 🔴 **UNTESTED contra la red real** (egress bloqueado en desarrollo). Antes de
> usar montos serios, **validá con una posición mínima** y verificá en Basescan:
> la dirección del position manager, el `tickSpacing` del pool, la matemática de
> ticks y las cantidades. Además, el `mint` va con `amount0Min/1Min = 0` (sin
> protección de slippage) — sólo apto para pruebas chicas hasta calcular los
> mins reales. El precio desde `sqrtPriceX96` es aproximado.

### Falta / mejoras conocidas

- Slippage real en `mint` (hoy mins en 0).
- Modelo de amounts óptimo por rango (hoy 50/50 USD por lado).
- `increaseLiquidity`/reposicionamiento en vez de cerrar+abrir.

## Seguridad

Nunca commitear claves. `.gitignore` excluye `.env`, `*.key`, `keystore*.json`.
Empezá con montos que estés dispuesto a perder.
