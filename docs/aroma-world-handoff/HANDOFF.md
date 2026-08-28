# Aroma World — Handoff: portada bilingüe + quiz (pendiente de aplicar)

> Este documento existe porque el conector de **Shopify quedó trabado** en un chat
> (mostraba `enabledInChat: false` aunque en la UI se veía ON, y ni el toggle ni el
> F5 lo destrababan). La solución fue **abrir un chat nuevo** y retomar aquí.
> TODO el trabajo ya hecho está a salvo en la tienda Shopify; solo falta el paso final.

## Objetivo pendiente (lo único que falta)

Dejar la **página de inicio (homepage)** bilingüe:

1. **Portada (hero) en INGLÉS como idioma principal**, con el **español como traducción**
   (para que quien entre en inglés entienda, y quien entre en español siga viéndolo en español).
2. **Quiz bilingüe** (inglés + español, con detección automática de idioma) con los
   **pies cuadrados (ft²) conservadores** ya acordados.

## ⚠️ Reglas críticas (aprendidas a la mala)

- **NO se puede escribir sobre el tema en vivo (MAIN).** Shopify bloquea los writes al
  tema publicado. Siempre: **duplicar el tema en vivo → editar la copia → el dueño publica.**
  - `themeDuplicate(id: "<MAIN theme gid>", name: "...")` — SÍ existe como mutation.
  - `themeFilesUpsert` está bloqueado en MAIN; funciona en copias UNPUBLISHED.
  - Verificar `theme(id).role` == `UNPUBLISHED` **justo antes** de cada write.
- **Duplicar el tema EN VIVO**, no reutilizar copias viejas. Al 2026-08-14 había una copia
  vieja llamada `✅ PUBLICAR ESTA — FINAL (todo)` (gid `190331060533`) que estaba
  **DESACTUALIZADA** (sus botones del hero decían "Ver difusores" → colección, en vez de
  "Descubre tu difusor" → quiz). Publicarla revertiría avances. **Duplicar siempre el MAIN actual.**
- Subir archivos grandes de tema con **staged upload** (evita meter 50KB en el prompt):
  `stagedUploadsCreate(resource: FILE)` → `curl -F ... -F "file=@archivo"` al target GCS →
  `themeFilesUpsert(body: {type: URL, value: "<resourceUrl>"})`.
- `themeDelete` y `themePublish` están **bloqueados** por el conector → el dueño publica a mano.

## Cómo aplicar el hero en inglés

El hero visible de la homepage es la sección **`background_video_ewaMP6`** (type `background-video`)
en `templates/index.json`. Sus bloques a traducir:

| Bloque | Tipo | Español actual | Poner en inglés (principal) |
|---|---|---|---|
| `custom_text_PWKJnY` | custom_text (h2) | `El aroma de un hotel 5★ en tu casa.` | `The scent of a 5-star hotel, at home.` |
| `custom_text_zY43Wm` | custom_text (p) | `Difusores y aromas de alta gama, seguros para tu familia y tus mascotas. Tecnología cold-air: sin agua, sin residuo.` | `High-end diffusers and scents, safe for your family and pets. Cold-air technology — no water, no residue.` |
| `custom_button_BcC9CL` | custom_button | `Descubre tu aroma` → colección | `Find your scent` — **cambiar link a `#awq-scent`** |
| `custom_button_iRwzLP` | custom_button | `Ver difusores` → colección | `Find your diffuser` — **cambiar link a `#awq-dif`** |

> Los botones deben apuntar al **quiz** (`#awq-scent` / `#awq-dif`), no a las colecciones.

**IMPORTANTE:** NO crear una segunda sección `hero-image` aparte (un subagente lo hizo antes y
quedaban DOS heros apilados). Editar la sección existente `background_video_ewaMP6`, no agregar otra.

### Español como traducción

Con la portada ya en inglés (idioma principal del tema), registrar el español con
`translationsRegister` para el locale `es` sobre los bloques del hero (o instalar la app
gratis **Translate & Adapt** y traducir ahí). Los recursos traducibles del tema salen de
`translatableResource` / `translatableResources`.

## Cómo aplicar el quiz bilingüe

- El quiz vive en la sección **`custom_liquid_ejyAWC`** (type `custom-liquid`), en el setting
  `custom_liquid` del bloque.
- Reemplazar su contenido por el de **`docs/aroma-world-handoff/quiz-bilingue.html`** (este repo).
- El quiz ya es bilingüe: usa atributos `data-en` / `data-es` en todo el texto y un script que
  detecta el idioma con `document.documentElement.lang` (`es` → español, si no → inglés).
- Dos botones de entrada (`data-start="scent"` y `data-start="dif"`) y abre por hash
  `#awq-scent` / `#awq-dif` (los mismos que los botones del hero).

### ft² conservadores ya acordados (en el quiz)
- **Jet** ~250 ft²
- **Tower** ~900 ft²
- **Sky Tower** ~7,500 ft²
- **Power** ~7,000 ft²

> Estos números ya están aplicados en las **descripciones de producto** (live, inglés principal).
> Falta que queden iguales en el quiz del tema (por eso se actualiza el quiz).

## Archivos de referencia (en esta carpeta)
- `quiz-bilingue.html` — el quiz bilingüe final, listo para pegar en `custom_liquid_ejyAWC`.
- `index_new-reference.json` — un `index.json` de referencia con el hero en inglés YA armado
  (ojo: se armó sobre la copia vieja `190331060533`; **usar solo como referencia de textos/estructura**,
  no publicar tal cual — el hero correcto se aplica sobre la copia del MAIN actual).
- `en_descriptions.json` — descripciones de producto en inglés (por GID).

## Datos de marca (para consistencia)
- Dorado champán **`#D9C562`**, navy casi negro **`#010C1C`**. Títulos en **Playfair Display**.
- Botones dorados: `pri_cl #d9c562`, texto `second_cl #010c1c`, hover invertido.
- Nada de gris. "Pet-conscious" (no "pet-safe" salvo con lista de alérgenos verificada).
  Nunca poner marcas de la competencia. Todo dato debe ser real/verificable.

## Estado del proyecto (ya hecho, NO rehacer)
- 12 productos con imágenes de marca; descripciones bilingües (inglés principal + traducción es).
- ft² conservadores en las 4 descripciones de difusores (Tower, Jet, Power, Sky Tower) — LIVE.
- Branding del tema: Playfair, dorado/navy oficial, botones dorados, banner de marca, logo AW, fondos crema.
- Quiz de 2 botones cableado al hero. Favicon AW. Chat (Messenger) funciona.
- **Falta solo:** portada inglés-principal + quiz bilingüe con ft² en una copia del MAIN, y publicar.

---

## ACTUALIZACIÓN (traducciones cruzadas) — 2026-08-15

**Problema nuevo detectado:** en el tema en vivo `190353998133` el hero tiene las
traducciones CRUZADAS: en vista inglés el letrero sale en español; en vista español el
subtítulo/botones salen en inglés. Es un registro de traducciones mal hecho (posible app
de traducción o intento previo). **NO publicar ese tema.**

**Ya hecho:**
- Clon limpio del tema EN VIVO creado: `gid://shopify/OnlineStoreTheme/190394990901`
  ("AW — Inglés + Quiz bilingüe (PUBLICAR)"), role UNPUBLISHED.
- Archivo corregido listo: `docs/aroma-world-handoff/final_index.json` — pone el hero
  visible (`2a92e6a7-...`, hero-image) en INGLÉS ("The scent of a 5-star hotel, at home",
  "Find your scent" #awq-scent, "Find your diffuser" #awq-dif) y mete el quiz bilingüe con
  ft² conservadores. La sección `background_video_ewaMP6` está `disabled: true` (no muestra).

**Falta (hacer en chat nuevo con Shopify OK):**
1. Verificar `theme(190394990901).role == UNPUBLISHED`.
2. Subir `final_index.json` a `templates/index.json` del clon (staged upload → themeFilesUpsert).
3. Revisar traducciones cruzadas: `shopLocales` (ver primary), luego `translatableResource`
   del template index / de los bloques del hero, y **corregir o borrar** las traducciones
   cruzadas del hero para el clon. Objetivo: inglés parejo + español parejo (sin mezclar).
4. Verificar leyendo de vuelta el index.json del clon.
5. Decirle al dueño que publique el clon `190394990901`.

---

## TAREA: fotos de difusores por color (2026-08-16)

El dueño quiere una foto por CADA color de cada difusor (hoy cada producto tiene una sola
foto y las variantes no tienen imagen). Colores por producto (de Shopify):
- **Jet**: Black, White — faltan las 2
- **Mist**: Black, White — faltan las 2
- **Tower**: Black, Silver, Gold — faltan las 3
- **Wave**: Black, White — faltan las 2
- **Power**: solo White (ya tiene) · **Sky Tower**: color único (ya tiene)

Decisión del dueño: **recolorear** desde la foto existente (no tiene fotos de cada color),
**empezando por Tower** como prueba antes de seguir con el resto.

**Referencia REAL del Tower dorado** (enviada por el dueño):
`docs/aroma-world-handoff/product-photos/tower-GOLD-real-reference.png`
- Es el oro CORRECTO + logo real "AROMAWORLD® — Experience the power of scent" + panel real
  (display "02", botones mist/1H/luz/power, indicadores 1H/2H/4H), fondo blanco limpio.
- Úsala como base: sirve TAL CUAL para la variante **Gold**, y se recolorea a **Black** y
  **Silver** desde ella (así el logo/panel/forma quedan reales).
- (También hay `tower-thanksgiving-lifestyle.png`, un lifestyle navideño, por si sirve para marketing.)

**Pendiente (con Higgsfield + Shopify conectados):**
1. Gold = usar la foto real directo. Black/Silver = recolorear desde la foto real
   (nano_banana_pro, medias role:image), mismo fondo/forma/logo/panel.
2. Subir cada imagen a Shopify (stagedUploadsCreate IMAGE → fileCreate) y **asignarla a su
   variante** (productVariantAppendMedia / variant.image) del producto correspondiente.
   IDs de variantes Tower: Black `45384898904373`, Silver `45384898937141`, Gold `47686166610229`.
3. OK visual del dueño con Tower, luego repetir para Jet, Mist, Wave.

---

## Tower — fotos por color LISTAS para asignar (2026-08-19)

Decisión: se usaron las **fotos reales del catálogo SCENTA (A326, 118×342mm)** — proporción
slim correcta. Recortadas por color a `product-photos/tower-{gold,silver,black}-final.png`
(900×1200, fondo blanco). El "silver" real es un **champán cálido** (no acero frío).

Ya SUBIDAS a Shopify staged uploads (válidas hasta 2026-08-20T12:22Z). resourceUrls:
- Gold:   `https://shopify-staged-uploads.storage.googleapis.com/tmp/76982944053/files/52db51f9-e0f1-4ec1-9cd8-dcb31845db1a/tower-gold.png`
- Silver: `https://shopify-staged-uploads.storage.googleapis.com/tmp/76982944053/files/9e9ead40-7c40-458d-91a2-4e75b4cf676b/tower-silver.png`
- Black:  `https://shopify-staged-uploads.storage.googleapis.com/tmp/76982944053/files/840fb830-2a46-4f7f-98f2-c6242d1d1f4b/tower-black.png`

**PASO FINAL pendiente (solo 2 mutations, requiere Shopify conectado):**
Producto Tower: `gid://shopify/Product/8373043855669`
Variantes: Gold `47686166610229` · Silver `45384898937141` · Black `45384898904373`

1. `productCreateMedia(productId, media:[{originalSource:<resourceUrl>, mediaContentType:IMAGE, alt:"..."}])`
   para las 3 (guardar los MediaImage IDs devueltos). Si las staged URLs expiraron, re-subir
   los PNG de `product-photos/` con stagedUploadsCreate(resource:IMAGE)+curl POST.
2. `productVariantAppendMedia(productId, variantMedia:[{variantId:<gid>, mediaIds:[<mediaId>]}])`
   emparejando cada foto con su variante (gold→gold, etc.). Verificar con get-product.

Luego repetir el mismo enfoque para **Jet, Mist, Wave** usando sus fotos reales del catálogo
SCENTA (buscar cada modelo en el PDF `fd8ee217-SCENTA_Product_Catalogue__Aroma_Diffuser.pdf`).
Opcional que pidió el dueño: añadir el logo "AROMAWORLD" a cada foto (requiere Higgsfield estable).
