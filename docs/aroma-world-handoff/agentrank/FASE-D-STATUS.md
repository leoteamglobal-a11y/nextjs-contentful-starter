# AgentRank — FASE D (JSON-LD) status

Working UNPUBLISHED theme: gid://shopify/OnlineStoreTheme/190716608821 ("AgentRank — structured data (WIP)").
MAIN (live, do NOT touch): gid://shopify/OnlineStoreTheme/190395777333.

## DONE (live on products)
- Created metafield `agentrank.manufacturer_model` (single_line_text_field):
  - Power (8373044642101) = A305L
  - Jet   (8373043429685) = AE103
  - Mist  (8373042217269) = A603
  - Sky   (8845963231541) = A316
  - Tower/Wave: intentionally NOT set (model unverified — do not invent).

## ✅ DONE — UPSERTED + VERIFIED ON THE COPY (2026-08-26)
File `docs/aroma-world-handoff/agentrank/main-product.FIXED.liquid` was staged-uploaded and upserted to
`sections/main-product.liquid` on theme 190716608821. Re-read from the theme (161,129 bytes, exact match).
All 8 checks pass: CONTAINS `product.variants.size > 1`, `agentrank.manufacturer_model`, `if variant.available`,
`if current_variant.available`, `00000123`; DOES NOT CONTAIN `Shopify Product Reviews` or barcode-as-MPN.
Exactly **1** `application/ld+json` block in the file. `layout/theme.liquid` has **no** competing Product schema
(only `content_for_header` + `meta-tags` render). No duplicate/conflicting Product schema store-wide.

## READY (superseded — kept for history)
File: docs/aroma-world-handoff/agentrank/main-product.FIXED.liquid  → upsert as sections/main-product.liquid on theme 190716608821.
(Only the <script type="application/ld+json"> block changed; see jsonld-block.FIXED.liquid. Liquid tags balanced: if=endif 16, for/endfor 1, case/endcase 1, unless/endunless 1, capture 0.)

### JSON-LD fixes applied in that block
1. Multi vs single offers: now `product.variants.size > 1` (was `product.price_varies`).
2. Availability per variant: loop uses `variant.available`; single uses `current_variant.available` (was `product.available` for all).
3. MPN: from `product.metafields.agentrank.manufacturer_model` at Product root (was `variant.barcode`). Removed barcode-as-MPN everywhere.
4. GTIN: only if barcode length ∈ {8,12,13,14} AND barcode != '00000123' (Jet White placeholder excluded). Fixed the single-branch `variant.barcode` out-of-scope bug (now uses stripped current/loop barcode).
5. AggregateRating: only emitted when real review count > 0; ratingValue = reviews.rating.value.rating, reviewCount = reviews.rating_count (was swapped + always-on "Shopify Product Reviews"). Other app cases (2/3/4/stamped) preserved.

## HOW TO UPSERT (when Shopify connector holds)
stagedUploadsCreate(resource:FILE, filename "main-product.liquid") → curl POST file to GCS target (HTTP 201) → themeFilesUpsert(themeId 190716608821, files:[{filename:"sections/main-product.liquid", body:{type:URL, value:<resourceUrl>}}]). Verify role UNPUBLISHED first. Then re-read and confirm the 7 checks (contains variants.size>1, agentrank.manufacturer_model, variant.available, current_variant.available, v_barcode != '00000123'; NOT contains "Shopify Product Reviews", NOT `"mpn": "{{ current_variant.barcode }}"`).

## STILL PENDING (FASE C/D remainder)
- Upsert the file above to the copy (blocked only by connector).
- FASE C shipping/quiz/typo already applied to the copy earlier (theme 190716608821).
- FASE F: render-validate schema on the copy's product pages; then owner publishes.
