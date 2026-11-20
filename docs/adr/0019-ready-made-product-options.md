# ADR 0019 — Full ready-made product support: options and variants on the site

- **Status:** accepted (accepted by the owner on 2026-11-19)
- **Date:** 2026-11-19

## Context

Two product families exist:

- **Configurator products** — a canonical definition plus one generated
  variant (ADR 0016); the server prices lines from the definition and the
  line's `selections`. They behave exactly as before; nothing in this ADR
  touches them.
- **Ready-made products** — definition-less products managed entirely in the
  stock dashboard, carrying stock (ADR 0018): a plain order block, variant
  stock, the checkout-transition allocation, sold-out hides.

Ready-made products with options are not supported yet — the site assumes
one variant per product:

- `src/lib/catalog/queries.ts` requests no option groups or per-variant
  options; `mappers.ts` (`orderingOf`) reads only `variants.at(0)`.
- `src/lib/basket/api.ts` (`productVariantId`) adds to the first variant.
- The basket shows option labels only for definition-driven lines
  (`LineCard.svelte` via the product definition).
- The ESLint rule `eslint/variant-option-reads.ts` blocks variant-option
  reads across `backend/src/**` and `src/**` (ADR 0016's guard).

The backend does not block it: the single-variant drift check
(`backend/src/plugins/product/single-variant.ts`) and the >1-live-variant
sync refusal (`backend/src/plugins/product/product-definition.service.ts`)
live inside the definition sync, which ready-made products never enter.

Vendure supports all of this natively (verified against `@vendure/core`
3.8.1 and our code, 2026-11-19):

- **Shop API shape** — `Product.optionGroups { options }` and
  `ProductVariant.options` are public (`product.type.graphql`). `variants`
  returns only enabled, non-deleted variants on the shop API
  (`ProductVariantService.getVariantsByProductId`), while `optionGroups`
  lists every option, including ones no live variant uses.
- **Variant identity** — Vendure requires every variant to carry exactly one
  option from each of the product's option groups, and refuses duplicate
  combinations (`validateVariantOptionIds`). It does not require the full
  matrix. A product without option groups can therefore hold only one
  variant.
- **Storefront pattern** — Vendure's product-detail guide reads the product's
  variants with their price and `stockLevel`, and adds the chosen variant
  with `addItemToOrder(productVariantId, quantity)`; `InsufficientStockError`
  already has wording on the site.
- **Stock** — new variants default to `trackInventory: INHERIT`, and
  `GlobalSettings.trackInventory` defaults to true (baseline migration; no
  migration changes it). Only the configurator sync forces `FALSE`.
  `stockLevel` comes from the default `StockDisplayStrategy`
  (`OUT_OF_STOCK` at zero saleable stock).
- **Order flow** — `ServerPricingStrategy` passes the variant's list price
  through when the product has no definition (`line-valuation.ts`);
  `OrderLine.invalidReason` (`VARIANT_UNAVAILABLE`, `OUT_OF_STOCK`) and
  `PlacedOrderStockAllocationStrategy` work per variant; Vendure merges
  basket lines by variant + custom fields.
- **Dashboard** — the stock variants grid, generate-variants prompt and
  option-group editor are hidden only on configurator products
  (`backend/src/dashboard/product/product-definition.tsx`), so the owner
  already has Vendure's native editors for ready-made products.
- **Sets** — the set gate skips lines of definition-less products
  (`backend/src/plugins/product-set/set-basket.ts`), so a ready-made product
  in a set never forms a set instance.

Amending ADR 0016's guard here does **not** reopen that decision. It was
about the _sync-generated_ variant matrix, whose size multiplied with
options × languages × channels and caused the 2026-11-08 incidents.
Owner-maintained variant counts are human-bounded and no sync is involved;
the per-channel price rows of epic 9 are accepted for ready-made products at
that scale.

## What matters (ranked)

1. **Correctness** — the buyer pays the chosen variant's price and the stock
   machinery works per variant; no oversell.
2. **Production safety** — no sync, no worker involvement; variant counts
   bounded by hand-maintenance, not by generation.
3. **Owner workflow** — options, variants, prices and stock all managed in
   the stock dashboard.
4. **Buyer clarity** — sold-out options are visibly disabled, never silently
   unselectable; price and stock update per choice.
5. **Maintainability** — the option-selection UI is one reusable component;
   guards are amended with justification, not bypassed.
6. **Roadmap fit** — option group/option/variant names are
   Vendure-translatable (epic 8); per-channel price rows per variant are
   accepted for this class (epic 9).

## Options

**A. Do nothing / not now.** Ready-made products stay single-variant only;
the owner would have to fake options with a definition (no stock
enforcement — ADR 0018 rejected that path) or as separate products per
option. Rejected: the need is real.

**B. Supersede ADR 0016 and regenerate the matrix.** The sync would own
option groups again, with its memory and sync-risk scaling. Rejected:
configurator products stay exactly as they are.

**C. Complete ready-made product support with owner-maintained option
groups.** Native everything; zero sync involvement. **Chosen.**

**D. Allow options on configurator products too.** Two pricing authorities
on one product, and the sync's single-variant guard would fight hand-built
variants. Rejected (owner decision, 2026-11-19).

## Decision

1. **A ready-made product is an enabled definition-less product** — ADR
   0018's discriminator, unchanged. The owner manages everything in the
   stock dashboard and the sync never touches it. It has either no option
   groups and a single variant (ordered as-is), or one or more option
   groups with owner-maintained variants — Vendure ties the two together
   (see Context).
2. **Pricing is the variant's list price** — the existing pass-through in
   `ServerPricingStrategy` for definition-less products. Order lines carry
   the chosen variant id; the line's `selections` stays `"{}"`.
3. **Stock follows ADR 0018, per variant** — baskets check saleable stock,
   the checkout transition allocates, a losing line flags `OUT_OF_STOCK`.
   The product hides from list, search, sitemap and home block only when
   _every_ variant is sold out; on the detail page sold-out options render
   disabled and unselectable.
4. **Site** — option chips on the detail page (one reusable component),
   add-to-basket resolves the picked options to the variant id, basket lines
   show the variant's options as group/option rows (the same layout as
   configurator lines). **The live variants are the source of truth:** the
   chips list the options of `optionGroups` that some live variant uses;
   an option whose every matching variant is sold out renders disabled; a
   combination with no live variant (never created, disabled or deleted by
   the owner) cannot be picked. `optionGroups` supplies only group names and
   order.
5. **Set discounts and product groups are out of scope** (owner: no plans
   for ready-made products at this time). Until designed, ready-made
   products must not be added to sets; the product-sets spec gains a note
   stating this and the set gate's behaviour for definition-less lines is
   pinned by tests.
6. **Guard amendment** — `eslint/variant-option-reads.ts` had no allowlist
   (ADR 0016 step 7 deleted it); it applies `no-restricted-syntax` to all of
   `backend/src/**` and `src/**`. Ready-made variant options are read in
   two modules only, listed in its `variantOptionReadAllowlist` and exempted
   in `eslint.config.ts`: the site's `src/lib/catalog/variantOptions.ts`
   (catalog mapping and basket line rows; option picking works on the
   mapped option ids in `src/lib/catalog/readyMade.ts`) and the order
   emails' `backend/src/plugins/email/variant-option-details.ts` (the emails
   name the ordered variant's options; the dashboard's order view already
   shows the variant name under the product). A unit test fails when an
   allowlisted file no longer exists. The rule's message points at ADR 0016
   for configurator products and at the allowlist for ready-made ones.

## Rollout

Each step ships alone; the system is correct after each. No data migration
is needed — option products are owner-entered data.

1. **Site catalog layer** — extend `PRODUCT_FIELDS`, the zod schemas and the
   mappers with option groups and per-variant options, names, prices and
   stock; listing, search, sitemap and the home block include ready-made
   products with options; the catalog contract test validates the new query
   fields against the live shop API schema, and a backend integration test
   orders an option product end to end. The ESLint
   allowlist lands here for the site's option-reading module.
2. **Product page** — the option-chip component, per-variant price and
   stock, sold-out chips disabled; add-to-basket resolves the chosen variant.
3. **Basket and emails** — line labels from variant options; the order
   emails list a ready-made line's options; the stale-line and
   `OUT_OF_STOCK` paths are verified for variant-based lines.
4. **Specs and docs** — `product-catalog` and `order-basket` specs, the
   CONTEXT.md product vocabulary, and a roadmap follow-up entry.

## Consequences

- **Epic 9:** one `ProductVariantPrice` row per variant per channel for
  ready-made products with options — accepted at owner-managed scale.
- **Epic 8:** option group, option and variant names need English values in
  the dashboard; they are native Vendure translations.
- **Order lines** display the variant's name as their identity; the invoicing
  research of ADR 0016 (name + SKU suffice, selection labels in the
  description) applies unchanged.
- **ADR 0018 is unchanged**; this ADR extends it to ready-made products with
  options.
