# 0010: Native-with-generation product modeling

Date: 2026-11-01
Status: Accepted

## Context

Products in Tina are a configurator, not a variant grid: configurable `fields`
of type input / select / radio / color / toggle / embroidery / material, where
a **material field** references Vendure-owned materials with a per-material
price and a `color_count` (how many colors the buyer picks for that slot),
plus product-level `banned_combinations`, a `length_based_pricing` mode
(one product kind, fonott rácsvédő), and per-product % discounts. Buyers pick
a material once per material field and then that field's number of colors;
valid colors depend on the chosen material.

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
   silently overwriting.
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
   input field kind outside options and variants.
6. **Collections and promotions stay native**: facets (Material, Color) on
   variants for facet-based Collections; the per-product % discount maps to
   stock promotions; the set (szett) discount's material+color multiset
   matching stays in the pricing layer initially (spec: order-pricing,
   product-sets), with a custom PromotionCondition as a later, optional
   refactor.
7. Seed/import direction stays one-way Tina → Vendure, temporary and
   preview-only (ADR 0009); prod is hand-migrated at cutover.
8. **Tina never stores product information — at no point in the roadmap.** No
   Tina product collections are added or extended, no Tina authoring forms are
   built for the catalog, and the Astro site (`src/`, `tina/`) is not modified
   for Vendure's benefit. The existing Tina product content is legacy
   test data with exactly two uses: test data for the temporary preview
   seed, and the completeness yardstick — **Vendure's product model must
   support every field Tina products have today** (field kinds, banned
   combinations, length-based pricing, discounts, product groups/related
   products). The authoring-form plan on `refactor/vendure-preparation`
   (`docs/product-definition-authoring-plan.md`, Stages 4–10) is **shelved**:
   only its canonical zod model is absorbed into `packages/product-definition`;
   the Tina form/codec/compiler stages are never built. Product management
   happens entirely in the Vendure dashboard.

## Known UX gaps from the spike click-through (and remedies)

1. **Generated preview list rendered empty** — spike-grade defect; resolved
   in PR #77 with a paged `generatedVariants` query.
2. **The block does not span the full page width** — the stock page's
   column layout constrains blocks; needs a full-width block or layout
   override (`pnpm patch` candidate; still open).
3. **Stock blocks (variants grid) cannot be conditionally hidden** — the
   block API's `shouldRender` is synchronous while "is this product
   generated?" is asynchronous (spike-verified). Remedies, in order of
   preference: fold the definition lookup into the product page's own data
   query; a small `pnpm patch` to the dashboard package in our build (we
   already build the dashboard SPA ourselves) allowing async block
   visibility; or an upstream contribution. (Still open.)
4. **A separate Termékek section still exists** — resolved in PR #77
   (pulled forward at the owner's request): the standalone section is
   removed; creation is an action-bar item on the stock products list,
   delete lives in the configurator block.

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
   gaps above, staleness indicator for material renames/deletes affecting
   generated products, delete/conflict policy.
4. **Facets + Collections** — material/color facet values on variants,
   auto-managed collections, dashboard surfacing.
5. **Promotions** — stock promotion for per-product % discounts; set
   discount stays in the pricing layer (fed by Vendure data) until a native
   PromotionCondition is justified.
6. **Vendure-complete gate** — the catalog is fully manageable in the Vendure
   dashboard with nothing left that only Tina can do; verified end-to-end via
   seeds, API probes and dashboard e2e.
7. **Cutover (separate work, last)** — the Astro site switches to reading
   Vendure (ADR 0009's switch flip): order-line custom fields for color
   selections/length/word count, the client-quote handover, prod
   hand-migration. Once the site is happy on Vendure, the Tina product
   collections are deleted.
