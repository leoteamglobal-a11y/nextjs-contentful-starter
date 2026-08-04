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
| `feed.ts`     | Estado del pool: simulado ✅ · on-chain ⏳ | parcial |
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

## Pasar a real (próximos pasos)

1. **Feed on-chain** (`feed.ts` → OnchainFeed): leer precio/tick del pool
   Slipstream vía viem + RPC de Base, y APY/TVL de DefiLlama.
2. **Executor live** (`executor.ts` → LiveExecutor): `NonfungiblePositionManager`
   de Slipstream — `mint`/`increaseLiquidity` al entrar, `decreaseLiquidity`+
   `collect` al salir. Firma con clave privada.
3. **Doble traba** ya está: live requiere `dryRun=false` **y** `liveConfirmed=true`.
4. **Probar con montos chicos** en Base antes de escalar.

> No se pudo probar la parte on-chain desde el entorno de desarrollo (el RPC de
> Base está bloqueado por egress). La lógica de señales y el loop sí están
> probados en simulación.

## Seguridad

Nunca commitear claves. `.gitignore` excluye `.env`, `*.key`, `keystore*.json`.
Empezá con montos que estés dispuesto a perder.
