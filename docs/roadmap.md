# Vendure migration roadmap

The governing plan for the Tina → Vendure catalog migration. The principles
below are fixed — do not relitigate or re-plan them. The decisions behind each
step live in [ADR 0009](adr/0009-side-by-side-vendure-catalog-migration.md)
(side-by-side migration) and
[ADR 0010](adr/0010-native-generated-product-model.md) (product model). Update
the step statuses as work lands; change steps only via ADR.

## Principles (fixed)

1. **Product information is never stored in Tina — at no point in the
   roadmap.** No Tina product collections are added or extended, no Tina
   authoring forms are built for the catalog, and no work item ever resumes
   Tina-side catalog tooling.
2. **The Astro site is untouched until cutover.** Nothing under `src/` or
   `tina/` is modified for Vendure's benefit; the site keeps running on Tina
   exactly as it is. The cutover (step 9) is separate, final work.
3. **Vendure must support every product field Tina has today** (field kinds
   input/select/radio/color/toggle/embroidery/material, banned material
   combinations, length-based pricing, per-product discounts, product
   groups/related products). Existing Tina product content is read-only test
   data for the temporary preview seed and the completeness yardstick.
4. **Length-based pricing is a hard requirement.** It is only phased out if it
   proves to be a really big problem — and ADR 0010 shows it fits natively
   (OrderLine length + per-material per-cm prices), including un-splitting the
   rácsvédő products.
5. **Native Vendure as much as possible** unless product-management UX
   genuinely suffers (the structured model exists exactly because the stock
   variant editor cannot express this catalog).
6. **The seed machinery is temporary and preview-only.** Prod cutover is a
   hand-migration run directly from the repo; the automated path never runs
   against prod.
7. **Embroidery per-word stays a special case** (a priced input field kind,
   never a variant axis); the set (szett) discount's material+color multiset
   matching stays in the pricing layer initially.

## Steps

| #   | Step                                                                                                                                                                                                                                                                     | Status                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | **Materials ported** — Vendure entities with numeric ids + slug business key, dashboard CRUD, data-preserving migration, seed from Tina content (PR #76 / `feat/vendure-materials`)                                                                                      | done                                                |
| 2   | **Product architecture decided** — native-with-generation per ADR 0010, proven by spikes A/B                                                                                                                                                                             | done                                                |
| 3   | **Canonical product schema** — absorb the zod catalogue model (product, field kinds, product groups, thread colors) from `refactor/vendure-preparation` into `packages/product-definition`, reconciled with the material schema. Canonical model only — no Tina adapters | in progress (`feat/product-definition-unification`) |
| 4   | **Products core** — Product plugin: structured definition storage (write-time zod), sync deriving native option groups/variants/prices (batched writes, drift detection), versioned migration, admin API; seed reads Tina product content as test data                   | not started                                         |
| 5   | **Dashboard production pass** — configurator page block on the stock product page, fixing ADR 0010's four UX gaps, staleness indicator for material renames/deletes, delete/conflict policy                                                                              | not started                                         |
| 6   | **Facets + Collections** — material/color facet values on variants, auto-managed collections, dashboard surfacing                                                                                                                                                        | not started                                         |
| 7   | **Promotions** — stock promotion for per-product % discounts; set discount stays in the pricing layer                                                                                                                                                                    | not started                                         |
| 8   | **Vendure-complete gate** — the catalog is fully manageable in the Vendure dashboard with nothing left that only Tina can do; verified via seeds, API probes and dashboard e2e                                                                                           | not started                                         |
| 9   | **Cutover (separate work, last)** — the Astro site switches to reading Vendure (order-line custom fields for color/length/embroidery, client-quote handover, prod hand-migration). Once the site is happy on Vendure, the Tina product collections are deleted           | not started                                         |

Every step 3–8 merges as a stacked PR against `feat/vendure-materials` (which
is the migration base branch and is not merged to main until the structure is
settled).
