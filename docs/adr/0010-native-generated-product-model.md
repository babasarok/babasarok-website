# 0010: Native-with-generation product modeling

Date: 2026-11-01
Status: Accepted

## Context

Products in Tina are a configurator, not a variant grid: configurable `fields`
of type input / select / radio / color / toggle / embroidery / material, where
a **material field** references Vendure-owned materials with a per-material
price and a `color_count` (how many colors the buyer picks for that slot),
plus product-level `banned_combinations` and a `length_based_pricing` mode
(one product kind, fonott rácsvédő). Buyers pick
a material once per material field and then that field's number of colors;
valid colors depend on the chosen material. (The Tina collection's
per-product % discount field is retired — unused in content — and is not
absorbed; see decision 6.)

ADR 0009 made Vendure the catalog owner side-by-side with Tina. Two spikes
compared how to model products in Vendure, using babafeszek (size select ×3
priced, 2 priced toggles, 2 material fields × 7 materials, banned
wellsoft×wellsoft) as the specimen:

- `spike/native-options` — stock Vendure option groups + full variant matrix,
  administered through the stock product editor.
- `spike/generated-options` — a canonical structured configurator from which
  native option groups and variants are generated and kept in sync,
  administered through a dashboard extension editor.

Both branches are the primary evidence; this ADR records the outcome.

## Spike findings

Native modeling's unit of administration is the variant, not the option:

- ProductOption carries **no price** (verified in @vendure/core source) —
  every price delta is baked into each variant's price. babafeszek becomes
  **576 variants** (588 minus banned); "minky costs +1000" is 156 variant
  edits; a base-price change is 576 edits; the stock editor has no bulk price
  edit, requires one SKU per row in the generate panel (which offers banned
  combinations and defaults everything unchecked past 20 rows).
- Option↔Material entity links are impossible without numeric ids (resolved
  since: materials now have auto-increment ids, ADR 0009 materials slice,
  commit cdd47aaf) — but even with the link, **colors cannot live in the
  matrix**: valid colors depend on the chosen material and Vendure has no
  dependent options. Vendure's own guidance for configurators is to carry
  such selections as OrderLine custom fields.
- Length-based pricing is the one case where native modeling is _cleaner_
  than the matrix: per-cm prices as option custom fields plus an
  `OrderItemPriceCalculationStrategy` reading an OrderLine `lengthCm` custom
  field. Both approaches agree the rácsvédő product split (forced by the old
  inability to price materials separately within a length-priced product) can
  be undone.

The generated approach keeps the native structure (real Vendure product,
option groups, variants — so facets, collections, promotions and order
machinery all work) while the admin edits the structured model, from which
the sync re-derives and reprices native variants on every save. Its proven
loop: set a per-material price → exactly the affected variants reprice; add
an option → the missing variants appear; no manual variant work anywhere.

## Decision

1. **Hybrid model ("native-with-generation")** is the product architecture.
   The canonical configurator model lives in `packages/product-definition`
   (strict zod, same style as `MaterialDefinitionSchema`); the backend
   Product plugin stores it (write-time validated) and **syncs** the native
   Vendure structure from it: option groups per field (toggles as two-option
   groups), variants for the full combination matrix with banned
   combinations omitted, prices = base + Σ option prices.
2. **The structured model is the single authority.** Native-side edits to
   generated products' option groups, variants and prices are overwritten by
   the next sync. The production sync must detect native-side drift
   (e.g. a hash of last-synced state) and refuse-or-confirm instead of
   silently overwriting. (Since [ADR 0011](0011-native-ownership-and-translatable-catalog.md)
   decision 1 the product's name and slug are excepted: the native Product
   owns them and the sync never writes them.)
3. **The configurator is edited on the stock product page** via a dashboard
   page block on `pageId: 'product-detail'` (spike-verified mechanism); no
   separate section exists — creation happens via an action-bar item on the
   stock products list (`pageId: 'product-list'`), implemented in PR #77.
4. **Materials keep slugs as business keys; numeric ids for machinery**
   (already implemented). Product definitions reference materials by slug.
5. **Colors, length and embroidery never become variant axes.** Colors are
   storefront selections carried on OrderLines (with the existing
   client-quote path); length-based pricing reads a length input plus
   per-material per-cm prices from the structured model (which also enables
   merging the split rácsvédő products); embroidery stays a per-word priced
   input field kind outside options and variants. Product×material×color
   imagery (a photo of the completed product in a specific material+color)
   is definition data keyed by (product, material, color) — not a variant
   axis; the editor slots and storefront resolution are post-cutover
   follow-ups (the fallback chain: definition image → material-color image
   → product featured asset).
6. **Collections and promotions stay native**: facets (Material, Color) on
   variants for facet-based Collections, auto-synced from definitions and
   material changes. Pricing is server-side in Vendure within epic 2:
   length-based and embroidery prices via a custom
   `OrderItemPriceCalculationStrategy` reading order-line custom fields, and
   the set (szett) discount as a Vendure Promotion (custom
   PromotionCondition/Action; spec: order-pricing, product-sets). The backend
   carries its own copy of the pricing logic — the Astro site's
   `src/lib/pricing` stays untouched until the cutover, after which the
   backend is the single price authority. Per-product % discounts are dropped (owner
   decision: unused in content) — they get no Vendure home and the canonical
   model carries no discount field. Group membership lives in native
   Collections: private children of the "Szettek" / "Kapcsolódó termékek"
   parents, members via the `product-id-filter`, the set discount as a
   Collection custom field — the canonical group schemas stay the seed's
   content validation and the shape yardstick.
   _(Group home superseded by ADR 0014: discounted sets are now one Promotion
   per set — members and the Ft amount in the promotion's args; the
   "Szettek" parent retires and related-items groups stay collections under
   "Kapcsolódó termékek".)_
7. Seed/import direction stays one-way Tina → Vendure, temporary and
   preview-only (ADR 0009); prod is hand-migrated at cutover.
8. **Tina never stores product information — at no point in the roadmap.** No
   Tina product collections are added or extended, no Tina authoring forms are
   built for the catalog, and the Astro site (`src/`, `tina/`) is not modified
   for Vendure's benefit. The existing Tina product content is legacy
   test data with exactly two uses: test data for the temporary preview
   seed, and the completeness yardstick — **Vendure's product model must
   support every field Tina products have today** (field kinds, banned
   combinations, length-based pricing, product groups/related
   products). The authoring-form plan on `refactor/vendure-preparation`
   (`docs/product-definition-authoring-plan.md`, Stages 4–10) is **shelved**:
   only its canonical zod model is absorbed into `packages/product-definition`;
   the Tina form/codec/compiler stages are never built. Product management
   happens entirely in the Vendure dashboard.

## Known UX gaps from the spike click-through (and remedies)

1. **Generated preview list rendered empty** — spike-grade defect; resolved
   in PR #77 with a paged `generatedVariants` query.
2. **The block does not span the full page width** — superseded (owner
   decision 2026-11): the configurator sits at the bottom of the stock
   product page's main column instead. The layout engine renders
   full-width blocks first, so bottom placement rules out `column: "full"`.
3. **Stock blocks (variants grid) cannot be conditionally hidden** — resolved
   via the first remedy: a `detailForms` `extendDetailDocument` adds
   `Product.productDefinition` (a ReadCatalog-gated resolver field on the
   stock Product type) to the product-detail page's own query, so the blocks'
   synchronous `shouldRender` sees the generated flag; the configurator block
   renders only for generated products, and the stock variants grid, the
   generate-variants prompt and the option-group editor are suppressed via
   empty replacement blocks. No `pnpm patch`, no upstream change.
4. **A separate Termékek section still exists** — resolved in PR #77
   (pulled forward at the owner's request): the standalone section is
   removed; creation happens on the stock `/products/new` page (a
   Konfigurátoros termék switch in the configurator block reveals the
   editor; the unified Létrehozás action-bar button runs the create and
   patches the stock form's values onto the generated product), delete lives
   in the configurator block.

## Display-field coverage gap (completeness yardstick audit)

The decision 8 yardstick holds for configurator data: every order-form field
in the Tina product collection maps 1:1 onto the canonical schema (field
kinds, banned combinations, length-based pricing) — the mapping is
recorded in the product-catalog spec's transition note. The audit found a
gap on the display side. Editorial fields map to the native product at
cutover (`title` → `name`, body → `description`, `thumbnail` → featured
asset, `images` → assets), but these have no home yet — native Vendure has
no slot and the canonical model does not carry them:

- `shortDescription` — product-list search text and card body.
- `categories` (the "Alcím" tagline) — list and detail display.
- `date` — the "newest first" list sort.
- `icon` — order-item/checkout item icon.
- per-image gallery descriptions — Vendure `Asset` has only a `name`
  (verified in @vendure/core 3.8.1).

Resolution (owner decision): native Vendure custom fields on `Product`
(`shortDescription`, tagline, `date`, `icon`) and `Asset` (gallery
description), edited in the stock dashboard — not the canonical model.

## Delivery plan (non-spike work)

Ordered; each step mergeable as a stacked PR against feat/vendure-materials.
Per decision 8, no step touches `src/` or `tina/` — the site keeps running on
Tina exactly as it is until step 7.

1. **Canonical product schema** — absorb the canonical zod catalogue model
   (product, field kinds, product groups, thread colors) from
   `refactor/vendure-preparation`'s `src/product-definition/` fork into
   `packages/product-definition`, reconciled with the package's current
   material schema. Canonical model only — no Tina adapters, codecs or forms.
2. **Products core** — production-grade Product plugin: entity + structured
   configurator storage, sync with batched variant writes (the spike's
   O(n²) creation is not shippable), drift detection, versioned migration,
   admin API. Seed reads Tina product content as test data
   (temporary/preview-only per ADR 0009; the site is untouched).
3. **Dashboard production pass** — configurator page block fixing the four
   gaps above (all resolved), staleness indicator for material renames/deletes
   affecting generated products (with a drift-detail list), delete/conflict
   policy.
4. **Facets + Collections** — material/color facet values on variants,
   auto-managed collections, dashboard surfacing.
5. **Server-side pricing + promotions** — order-line custom fields (length,
   embroidery word count, field selections), a custom
   `OrderItemPriceCalculationStrategy` for length/embroidery, and the set
   discount as a Vendure Promotion; product groups live on private
   Collections (the "Szettek"/"Kapcsolódó termékek" parents with
   `product-id-filter` children and a `setDiscount` custom field).
   Per-product % discounts are dropped (owner decision), so no stock
   promotion is built for them.
6. **Vendure-complete gate** — the catalog is fully manageable in the Vendure
   dashboard with nothing left that only Tina can do; verified end-to-end via
   seeds, API probes and dashboard e2e.
7. **Cutover (separate work, last)** — the Astro site switches to reading
   Vendure (ADR 0009's switch flip): the site places real orders against the
   step-5 order-line fields and server pricing, the client-quote handover, prod
   hand-migration. Once the site is happy on Vendure, the Tina product
   collections are deleted.
