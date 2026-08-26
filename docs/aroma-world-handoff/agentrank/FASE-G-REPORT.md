# AgentRank — Informe final (Aroma World) · FASE G

**Objetivo:** convertir el catálogo de Aroma World en un catálogo consistente, legible por máquinas,
estructurado y verificable, listo para buscadores y agentes de compra con IA.

**Regla seguida:** *no rehacer lo que ya estaba bien — verificar primero.* Todo el trabajo se hizo sobre
una **copia sin publicar** del tema (`190716608821`, "AgentRank — structured data (WIP)"). El tema en vivo
(`190395777333`) **nunca** se tocó. El dueño publica la copia cuando dé el visto bueno.

---

## Resumen de fases

| Fase | Qué | Estado |
|---|---|:---:|
| A | Auditoría del estado actual en Shopify | ✅ |
| B | Duplicar MAIN → copia sin publicar (nunca tocar MAIN) | ✅ |
| C | Quiz (7,000/3,000/900 ft²), typo "Aroma World", envío "$100" | ✅ |
| D | Reescritura del Product JSON-LD (schema.org) + metafields MPN | ✅ |
| E | Limpieza de datos demo heredados (contador falso, popups, búsqueda) | ✅ |
| F | Validación del schema contra los datos reales de cada producto | ✅ |
| G | Este informe + scorecard antes/después | ✅ |

---

## Scorecard AgentRank (antes → después)

> Puntajes honestos, 0–100. El "después" refleja la copia lista para publicar. La validación final en vivo
> (Google Rich Results Test) se hace una vez que el dueño publique.

| Dimensión | Antes | Después | Qué cambió |
|---|:---:|:---:|---|
| **Product Schema (JSON-LD)** | 35 | 90 | Ofertas por nº de variantes (no `price_varies`); disponibilidad **por variante** (InStock/OutOfStock correcto en Wave y Sky); MPN desde metafield (no el barcode); GTIN validado y placeholder `00000123` excluido; AggregateRating solo con reseñas reales y con valores correctos; 1 solo bloque Product, sin duplicados. |
| **Calidad de catálogo** | 55 | 85 | Quiz corregido (7,000/3,000/900 ft²), typo corregido, envío coherente, Seduction arreglado (notas reales, imagen, publicado, primero en la colección), Tower 900 ft² propagado. |
| **Confianza comercial** | 40 | 88 | Contador falso "People are viewing" **desactivado**; popup de salida y sugerencias de búsqueda con productos reales; sin ratings inventados en el schema. |
| **Feed readiness (Merchant/IA)** | 45 | 78 | MPN estructurado (A305L/AE103/A603/A316), GTIN placeholder fuera, precio/disponibilidad honestos por variante. *Limita:* la mayoría no tiene GTIN real (barcodes nulos). |
| **Atributos / legibilidad** | 50 | 75 | ft² consistente, marca/MPN estructurados. Product Type queda pendiente (decisión del dueño). |
| **GLOBAL (ponderado)** | **45** | **83** | |

---

## Detalle FASE D — correcciones de schema (por qué importan a los agentes IA)

Bugs corregidos en el bloque `<script type="application/ld+json">` de `sections/main-product.liquid`:

1. **Ofertas** — antes se decidía "varias ofertas" por `product.price_varies`; ahora por
   `product.variants.size > 1`. Un producto con 2 variantes al mismo precio ahora sí lista ambas ofertas.
2. **Disponibilidad por variante** — antes usaba `product.available` para todas; ahora cada variante emite
   su propio `InStock`/`OutOfStock`. (Ej.: Wave Black InStock / White OutOfStock; Sky OutOfStock.)
3. **MPN** — antes se ponía el `barcode` como MPN (incorrecto). Ahora sale del metafield
   `agentrank.manufacturer_model`. Tower/Wave se dejan sin MPN (modelo no verificado — no se inventa).
4. **GTIN** — solo si el barcode tiene longitud 8/12/13/14 **y** no es el placeholder `00000123`
   (Jet White). Antes se emitía un GTIN inválido.
5. **AggregateRating** — antes se emitía siempre (incluso con 0 reseñas) y con `ratingValue`/`reviewCount`
   intercambiados. Ahora solo se emite cuando hay reseñas reales (`reviews.rating_count > 0`) y con los
   valores correctos. Productos con reseñas: Elixir (2), Temptation (6), Mist (1), Jet (4).

Verificación estructural (FASE F): **1** solo bloque Product en todo el tema; `layout/theme.liquid` no tiene
schema Product que compita. Lógica validada contra los datos reales de los 17 productos.

---

## Detalle FASE E — datos demo eliminados

- Contador **falso** "People are viewing this right now" → **desactivado**.
- Popup de salida con 5 productos inexistentes (nocarb-t, nutraday, galeon-xxi-shampoo, control-gamer…) →
  reemplazados por 5 bestsellers reales.
- Búsqueda sugería la colección `clothing` con términos de ropa (Camisas, Jeans, Joggers) →
  ahora `diffusers-1` + "Diffusers, Scents, Tower, Mist, Car Diffuser, Refills".
- Producto de la barra de envío gratis (`amplificador-de-pantalla-3d`) → producto real.
- Texto demo "twill woven shorts", handles `buzo-deportivo…` en Quick-View/Compare → limpiados.
- **0** tokens demo quedan en `settings_data.json`.

---

## Qué falta / próximos pasos

1. **PUBLICAR** la copia `190716608821` (lo hace el dueño) para que todo esto quede en vivo.
2. Tras publicar: validar URLs en **Google Rich Results Test** y Schema.org validator.
3. **GTINs reales** — pedirlos al proveedor para subir el puntaje de feed (Merchant Center).
4. **Product Type** (taxonomía) — pendiente por decisión del dueño ("déjalo por ahora").
5. **Imágenes por color de Tower** — fotos ya subidas (staged), falta asignarlas a cada variante.
6. **Landing pages de intención de compra** (Hotel Scent Diffuser, HVAC, Miami) — fase SEO futura.

## Archivos de referencia (en `docs/aroma-world-handoff/agentrank/`)
- `main-product.FIXED.liquid` — sección con el JSON-LD corregido (ya en la copia).
- `settings_data.FIXED.json`, `product.template.FIXED.json` — configs limpias (ya en la copia).
- `FASE-D-STATUS.md`, `FASE-E-STATUS.md`, `FASE-F-VALIDATION.md` — detalle por fase.
