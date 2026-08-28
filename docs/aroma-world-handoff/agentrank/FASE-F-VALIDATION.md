# AgentRank — FASE F (schema validation) on theme 190716608821

Validated the new Product JSON-LD logic against every product's REAL variant/metafield data
(pulled live from Admin API 2026-08-26). Logic paths confirmed correct for each configuration.

## Offers shape = by variant COUNT (not price_varies)
| Product | Variants | offers type | Per-variant availability | Notes |
|---|---|---|---|---|
| Wave | 2 | AggregateOffer/array | Black **InStock**, White **OutOfStock** | KEY: mixed availability renders correctly |
| Jet | 2 | array | Black InStock, White InStock | GTIN excluded both (Black null, White `00000123` placeholder); MPN `AE103` |
| Mist | 4 | array | all InStock | MPN `A603`; AggregateRating (rc=1, honest) |
| Diffuser+3 | 8 | array | all InStock | |
| Tower | 3 | array | all InStock | no MPN (unverified), no rating |
| Elixir / Dreamy / Temptation / Utopia / Enigma / Eleganza / Seduction | 2 each | array | per-variant | scents |
| Power HVAC | 1 | single Offer | InStock | MPN `A305L` (single-variant path via current_variant) |
| Sky | 1 | single Offer | **OutOfStock** | KEY: single-variant OOS; MPN `A316` |

## AggregateRating — emitted ONLY when real review count > 0
| Product | reviews.rating_count | ratingValue | Renders? |
|---|---|---|---|
| Elixir | 2 | 5.0 | ✅ |
| Temptation | 6 | 3.67 | ✅ |
| Mist | 1 | 5.0 | ✅ |
| Jet | 4 | 5.0 | ✅ |
| all others | null/0 | — | ❌ (correctly omitted — no fabricated ratings) |

## GTIN safety
- Jet White barcode `00000123` = placeholder → **excluded** (gtin only if length ∈ {8,12,13,14} AND ≠ `00000123`).
- All other variants have null barcode → no gtin emitted (correct; no invented codes).

## MPN (structured, from metafield — never barcode)
Power=A305L, Jet=AE103, Mist=A603, Sky=A316. Tower/Wave intentionally unset (model unverified).

## Duplicate-schema check
- `sections/main-product.liquid`: exactly **1** `application/ld+json` (the Product block).
- `layout/theme.liquid`: **no** ld+json (only `content_for_header` + `meta-tags` render → OG/Twitter, complementary).
- No competing/duplicate Product schema in the theme. Judge.me AggregateRating (if injected at runtime) is
  additive, not a conflicting Product node.

**Result: FASE F PASS.** Owner can publish theme 190716608821 when ready; then re-validate live URLs in
Google Rich Results Test / Schema.org validator.
