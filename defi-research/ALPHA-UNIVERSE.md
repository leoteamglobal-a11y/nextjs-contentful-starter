# El universo completo de alpha cripto (no solo pools DeFi)

Investigación ampliada, con datos 2024–2026. Pregunta guía: *"¿existe una
combinación de estrategias (funding, cash-and-carry, market making, MEV,
liquidaciones, opciones, vol arb, RWA, lending, stablecoin/cross-chain arb,
prediction markets, launches, airdrops, restaking, Hyperliquid, Ethena, Pendle,
EigenLayer) que maximice el rendimiento compuesto con riesgo controlado?"*

Respuesta corta: **sí, y ya tiene nombre — es un fondo multi-estrategia
market-neutral.** Pero la combinación óptima **depende del tamaño del capital**,
y ahí está tu ventaja real. Detalle abajo.

---

## 1. Mapa de estrategias: retorno, capacidad y para quién

Retorno = neto realista sostenible. **Capacidad** = cuánto capital absorbe antes
de que el edge se comprima (clave y casi siempre ignorado).

| Estrategia | Retorno real | Capacidad | Riesgo | ¿Para capital chico? |
|---|---|---|---|---|
| **RWA / T-bills tokenizados** (Ondo, sDAI) | 4–5% | Enorme ($12.9B y creciendo) | Muy bajo | ✅ es el "piso" |
| **Lending stables** (Aave, Morpho) | 4–8% | Enorme | Bajo | ✅ base |
| **Yield fijo** (Pendle PT) | 4–10% | Media-alta | Bajo-medio | ✅ |
| **Restaking** (EigenLayer, +LST) | 3–5% + puntos | Alta | Medio (slashing) | ✅ |
| **Delta-neutral / funding** (Ethena, basis) | 8–20% (Sharpe ~4.8) | **Limitada** (se comprime al llenarse) | Medio (funding flip, exchange, leverage) | ✅ hasta cierto punto |
| **Cash-and-carry / basis** (spot vs perp) | 8–15% (BTC ~11%, ETH ~10%) | Limitada | Medio | ✅ (versión simple) |
| **Market making** | 10–30%+ | Alta pero intensiva | Medio-alto (inventario) | ⚠️ requiere infra/skill |
| **Vol arb / opciones** | Variable | Media | Alto (complejo) | ❌ institucional |
| **MEV: arbitraje/sandwich** | Titular alto, **neto 1 dígito** | Saturada | Alto (infra, competencia) | ❌ 90% va a validators; guerra de bots |
| **MEV: liquidaciones** | Bonos ~5–8% por evento | Media | Alto (infra) | ⚠️ nicho competitivo |
| **Cross-chain / CEX-DEX arb** | Comprimiéndose | Baja | Alto | ❌ dominado por 19 searchers |
| **Airdrops / points farming** | **Muy alto pero episódico** | **Muy baja** | Medio (sybil, gas, tiempo) | ✅✅ **el edge del capital chico** |
| **Token launches** | Alto y binario | Baja | Muy alto | ✅ con tamaño mínimo |
| **Prediction markets** (Polymarket) | Nicho, event-driven | Baja | Medio | ✅ oportunista |
| **LP concentrado + incentivos** (tu VELVET) | Espejismo | — | Alto | ⚠️ solo "apuesta" con stop |

---

## 2. La idea clave que cambia todo: capacidad y tamaño de capital

Las estrategias no son "mejores o peores" en abstracto — dependen de **cuánto
dinero manejás**:

- **Capital grande (fondos):** obligado a estrategias **escalables pero de bajo
  retorno** — RWA, lending, basis, market making. No pueden "farmear airdrops"
  con $500M. Techo realista: **10–20% anual**.
- **Capital chico (vos):** podés acceder a los edges **no escalables** que los
  fondos **no pueden tocar**: airdrops, pools nuevos chicos, launches,
  liquidaciones de nicho, prediction markets. Ahí es donde *puntualmente*
  aparecen retornos altísimos.

> **Tu ventaja no es competir con firmas de HFT en MEV o market making — es la
> agilidad y el acceso a lo que no escala.** El error clásico del retail es
> intentar jugar el juego de los fondos (donde pierden) en vez de su propio juego.

Evidencia de los datos:
- MEV: **90%+ de la revenue va a builders/validators**; >65% de traders usan
  bots; márgenes netos de 1 dígito. No es para vos.
- Basis/funding: Sharpe hasta 4.84 pero **se comprime al llenarse de capital** —
  bueno para tamaño medio, no infinito.
- Airdrops: retorno por dólar altísimo pero **no escala** — perfecto para chico.

---

## 3. La combinación óptima: multi-estrategia market-neutral por capas

Sí existe una combinación que maximiza el retorno **ajustado al riesgo**: apilar
**sleeves poco correlacionados**. Es lo que hacen los fondos multi-strat, y su
gracia es que la suma tiene mejor Sharpe que cualquier pata sola.

Para **capital chico**, la versión realista:

```
  NÚCLEO (50–70%)  →  RENDIMIENTO ESTABLE, PRESERVA PRINCIPAL
    RWA/T-bills + lending stables + yield fijo Pendle   → 5–9%

  SATÉLITE MARKET-NEUTRAL (20–35%)  →  EL MOTOR
    delta-neutral/funding (Ethena) + basis/cash-and-carry → 8–18%

  OPORTUNISTA / NO ESCALABLE (5–15%)  →  TU EDGE ÚNICO
    airdrops + pools nuevos + launches + liquidaciones    → alto pero episódico
    (con STOP duro; si va a 0, no toca el núcleo)
```

- **Poca correlación** entre patas → el drawdown del conjunto es menor que el de
  cualquiera sola.
- El **núcleo** compone seguro; el **satélite** aporta el grueso del retorno
  ajustado al riesgo; el **oportunista** es la lotería controlada donde el
  capital chico puede pegar 1%/día *por un tiempo* sin arriesgar el principal.
- **Blended realista: ~12–30% anual**, variable, con downside acotado por diseño.
  Compuesto 5–10 años = 2x–8x. Eso ya es de élite y **no te funde**.

---

## 4. Quién ya hace esto (prior art para copiar)

- **Fondos multi-strat market-neutral cripto:** basis + funding + relative value;
  ~8–20% anual con drawdowns chicos (un ejemplo real: +2.4% en 6 semanas con DD
  diario máximo de 0.1%, neutral a una caída de −15% de BTC).
- **Ethena:** delta-neutral empaquetado (sUSDe) — la pata funding "llave en mano".
- **Yearn v3 / Beefy:** rotación + auto-compound de la parte DeFi-yield.
- **Pendle:** para fijar tasa o especular con yield.
- **Searchers MEV (19 dominan CEX-DEX):** te muestran qué NO pelear.

Nadie combina *todo* con optimización de riesgo automatizada y acceso al sleeve
no-escalable — **ahí está el hueco real que tu proyecto podría ocupar.**

---

## 5. Conclusión honesta

- La pregunta correcta no es "¿qué pool da 1%/día?" sino **"¿qué cartera
  multi-estrategia me da el mejor retorno ajustado al riesgo para MI tamaño de
  capital, y cómo la roto automáticamente?"** — exactamente adonde apuntás.
- El objetivo realista es **~15–30% anual sostenible** para capital chico bien
  gestionado (más que un fondo grande, gracias al sleeve no-escalable), con el
  principal protegido por diseño.
- El siguiente paso NO es más búsqueda de APY. Es **construir la base de datos
  histórica** para distinguir edges reales de espejismos — ver `DATA-PLATFORM.md`.

## Fuentes

- [Basis / cash-and-carry: 8–15%, Sharpe 4.84, capacidad limitada](https://alphanode.global/insights/crypto-basis-trade-guide/) · [market-neutral primer](https://www.tv-hub.org/guide/market-neutral-strategy-crypto)
- [MEV: $1B acumulado, 90% a validators, márgenes 1 dígito](https://crypto.news/how-mev-bots-make-multimillion-dollar-profits-from-attacks/) · [CEX-DEX searcher profitability (arXiv)](https://arxiv.org/html/2507.13023v1)
- [Market making / vol arb en hedge funds cripto](https://thehedgefundjournal.com/hedge-fund-strategies-in-cryptoland/) · [market-neutral 2.4%/6sem, DD 0.1%](https://deliberatedirections.com/market-neutral-crypto-trading-strategies/)
- [RWA / T-bills tokenizados $12.9B](https://metamask.io/news/types-of-tokenized-real-world-assets-rwa-categories) · [rwa.xyz analytics](https://app.rwa.xyz/)
- [Ethena delta-neutral](https://eco.com/support/en/articles/14796324-inside-ethena-usde-delta-neutral-mechanism) · [funding arb 8–20%](https://arbitragescanner.io/blog/crypto-funding-rate-arbitrage-guide)

*No es asesoramiento financiero. Podés perder el principal.*
