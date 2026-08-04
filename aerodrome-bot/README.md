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
| `executor.ts` | Paper ✅ · Live (Aerodrome) ⏳ | parcial |
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

## Pasar a real (último paso)

1. ~~**Feed on-chain**~~ ✅ hecho.
2. **Executor live** (`executor.ts` → LiveExecutor): `NonfungiblePositionManager`
   de Slipstream — `mint`/`increaseLiquidity` al entrar, `decreaseLiquidity`+
   `collect` al salir. Firma con clave privada.
3. **Doble traba** ya está: live requiere `dryRun=false` **y** `liveConfirmed=true`.
4. **Probar con montos chicos** en Base antes de escalar.

## Seguridad

Nunca commitear claves. `.gitignore` excluye `.env`, `*.key`, `keystore*.json`.
Empezá con montos que estés dispuesto a perder.
