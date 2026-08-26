# AgentRank — FASE E (legacy demo-data cleanup) on theme 190716608821

All changes applied to the UNPUBLISHED copy (190716608821) and verified by re-reading the theme.
Files changed: `config/settings_data.json`, `templates/product.json`.

## Customer-visible issues FIXED
1. **Fake "People are viewing this right now" counter** (`main-product` → `live_view` block) was **ENABLED**.
   The theme itself labels this "fake real time visitor." → set `disabled: true`. (Dishonest signal removed.)
2. **Exit-intent popup** (`popups` → `exit`, enabled, homepage) listed 5 **non-existent demo products**
   (`nocarb-t`, `nutraday`, `navidad-en-armonia`, `galeon-xxi-shampoo-protector-para-barba`,
   `control-gamer-elite-x-turbo`). → replaced with 5 real bestsellers
   (towermist / scentjet / aromamist / aromawave / seduction). Heading kept ("Los Productos más Vendidos").
3. **Search suggestions** pointed at collection `clothing` (doesn't exist) with clothing hotkeys
   (`Camisas, Jeans, Joggers…`). → `search_prs_suggest: diffusers-1`;
   `list_hotkey: "Diffusers, Scents, Tower, Mist, Car Diffuser, Refills"`.
4. **Free-shipping-bar product** `free_ship_pr: amplificador-de-pantalla-3d-100` (demo) → `aromamist-diffuser`.

## Hidden/disabled demo data ALSO cleaned (belt-and-suspenders)
- `sales` popup (disabled) demo list (`amplificador…`, `biopro`, `carro-a-escala…`) → real handles.
- Quick-View / Quick-Shop `demo_pr: buzo-deportivo-dama-…` → `towermist-diffuser`.
- Compare page `product_list` (buzo x2) → `towermist-diffuser`, `scentjet-diffuser`.
- Disabled product `description` block held demo **"twill woven shorts"** clothing copy → cleared to "".
- **0** demo tokens remain anywhere in `settings_data.json` (verified).

## Already clean (no action needed)
- `sold` fake-sales counter → already `disabled: true`.
- `order` delivery block (the `| default: 19041994` fallback source) → already `disabled: true`, so the
  `19041994` value never renders. `time` is set to `17:00:00` regardless.
- `home_keywords` → already real AW SEO ("difusores de lujo, aromas para el hogar, … Miami, Aroma World").
- Judge.me app block `review_data: "sample_data"` → editor-preview only; real reviews load on the live
  storefront. Our JSON-LD AggregateRating reads the real `reviews.rating_count` metafield, so schema is honest.
- Testimonials section → owner-authored, references "Aroma World" by name. Left as-is (not demo data).
  If the owner wants these removed for strict honesty, that's a separate decision.

**Result: FASE E PASS.**
