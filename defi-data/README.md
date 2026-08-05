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

## Próximas etapas

- **Etapa 2:** backfill histórico por pool (`/chart/{id}`) → SQLite/Parquet.
- **Etapa 3:** tablas de eventos (hacks, unlocks, depegs) — incluir los "muertos".
- **Etapa 4:** features (persistencia, post-evento) + backtest.
- **Etapa 5:** scoring → allocator (ver `../defi-research/STRATEGY.md`).
