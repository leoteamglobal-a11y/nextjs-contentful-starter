# defi-data — ingester (Etapa 1)

Primer ladrillo de la plataforma de datos (ver `../defi-research/DATA-PLATFORM.md`).
Baja DefiLlama Yields a un almacén **append-only** y separa el **yield real**
(`apyBase`) del **incentivo** (`apyReward`) — el filtro #1 para no perseguir
espejismos.

## Uso

```bash
cd defi-data
npm install
npm test                                   # 8 tests, sin red (usa fixture)

# Ingesta EN VIVO (requiere salida a internet a DefiLlama):
npm run ingest                             # snapshot de hoy (UTC)

# Ingesta OFFLINE de prueba (sin red):
npm run ingest -- --fixture fixtures/sample-pools.json --date 2026-01-15

# Reporte sobre un snapshot guardado:
npm run report -- --date 2026-01-15
```

> El pull en vivo puede estar bloqueado en entornos con egress restringido
> (DefiLlama da 403). Corré `npm run ingest` donde tengas red abierta.

## Qué guarda

Append-only, particionado por fecha UTC (nunca sobrescribe un día):

- `data/raw/YYYY-MM-DD.jsonl` — el snapshot crudo de DefiLlama (verdad histórica).
- `data/normalized/YYYY-MM-DD.jsonl` — filas normalizadas con las métricas:
  - `apyBaseShare` = `apyBase/apy` → **% del yield que es real**.
  - `incentiveShare` = `apyReward/apy` → % que es subsidio.
  - `realYield` → `apyBase` (o `apy - apyReward`).
  - `isMirage` → `true` si >90% del APY es incentivos.

`data/` está en `.gitignore` (los snapshots se regeneran ingiriendo; no van a git).

## Por qué importa

El reporte rankea por **yield real, no por APY bruto**. Un pool con 291.000% APY
donde el 99,99% son incentivos aparece como espejismo; uno con 12% real de
comisiones sube al tope. Esa distinción es la base de todo el sistema.

## Screen de calidad

`qualityScreen()` codifica los criterios sostenibles (configurables):

- `apyBase ≥ 10%` — yield real alto, no incentivos.
- `TVL ≥ $10M` — liquidez seria.
- antigüedad `≥ 1 año` (proxy = `count`, días de historia de DefiLlama).
- incentivos `≤ 50%` del APY — base predominante.

Es **deliberadamente estricto**: puede devolver pocas o cero oportunidades, y eso
también es información honesta. **Auditorías** y **calendario de desbloqueos**
NO están en el snapshot de DefiLlama → se agregan en la etapa 3 (tablas de
eventos).

## Etapa 2 — backfill histórico + persistencia ✅

Baja la serie temporal de cada pool (`/chart/{id}`) y calcula **persistencia**:
¿el yield real se sostuvo, o el APY colapsó cuando terminaron los incentivos?

```bash
# En vivo (requiere red):
npm run backfill -- --from-snapshot 2026-01-15 --limit 25   # top pools por TVL
npm run backfill -- --pools <poolId1,poolId2>

# Offline (prueba):
npm run backfill -- --pools velvet,weth --fixture-dir fixtures/charts

# Resumen detallado de un pool:
npm run summary -- --pool velvet --fixture fixtures/charts/velvet.json
```

Métricas de persistencia (`summarizeHistory`):
- `apyBaseMean/median/min/max/stdev` — el yield real a lo largo del tiempo.
- `daysApyBaseAboveThreshold` / `shareDaysAboveThreshold` — **¿cuántos días
  sostuvo yield real alto?** (la métrica clave).
- `apyDecayPct` — cuánto colapsó el APY desde su pico (señal de espejismo).
- `tvlDrawdownPct`, `alive` — supervivencia.
- **Veredicto** automático: espejismo / sostenible / mixto.

Ejemplo real de la demo: VELVET → *"❌ nunca yield real alto, APY decay 100%,
TVL DD 95%"*; WETH-USDC → *"✅ yield real persistente, días≥10%: 100%"*.

Los históricos se guardan en `data/history/<poolId>.jsonl`.

## Próximas etapas

- **Etapa 3:** tablas de eventos (hacks, unlocks, depegs) — incluir los "muertos".
- **Etapa 4:** features (post-evento) + backtest sin sesgo de supervivencia.
- **Etapa 5:** scoring → allocator (ver `../defi-research/STRATEGY.md`).
