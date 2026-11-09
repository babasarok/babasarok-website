# ADR 0016: One native variant per configurable product — choices live only in line selections

- **Status:** proposed
- **Date:** 2026-11-09

## Context

ADR 0010 decision 1 generates a native `ProductVariant` for every option
combination of a product definition (banned combinations omitted, price =
base + Σ option prices), with option groups/options, names in every
language, and Material/Color facet values on every variant (decision 6).
babafeszek has 1,152 variants; the catalog about 3,180.

Every production incident and most bugs of the week of 2026-11-08 lived in
that matrix: the worker OOM from burst-queued heavy syncs (AGENTS.md,
"Bulk catalog writes vs the prod worker"), an API GC death spiral from two
concurrent bulk reads of full matrices, TypeORM relation loading of the
matrix (334k joined rows), drift/staleness bugs, and translations of a
removed language never converging. PR #104 fixed them; babafeszek now syncs
in ~0.55 s and the worker peaks ~500 MiB. There is no urgency — but the
matrix still grows multiplicatively with options and languages, and epic 9's
"one Channel per market" (docs/roadmap.md, Epic 9 design notes) adds a
`ProductVariantPrice` row per variant per channel.

Why the matrix exists (ADR 0010, spike findings and decision 1): ProductOption
carries no price, so a hand-kept matrix was unworkable; generation kept the
native structure "so facets, collections, promotions and order machinery all
work". Decision 5 already took colors, length and embroidery off the variant
axes and onto OrderLine custom fields — Vendure's own guidance for
configurators (cited in ADR 0010; not re-verified for this ADR).

What reads the generated variants today:

| Consumer | Reads | Evidence |
| --- | --- | --- |
| Add-to-cart | the whole matrix via the paged `productVariants(slug)` shop query; picks the variant whose options match the axes, refuses when none matches | `backend/src/plugins/product/product.resolver.ts:258,309`, `src/lib/basket/lineInput.ts:118-157` |
| Server pricing | `variant.options` codes + variant list price as input to `valueConfiguredLine` | `backend/src/plugins/pricing/line-valuation.ts:32,66` |
| Line validity | `VARIANT_UNAVAILABLE` (variant disabled/deleted), `OPTION_NOT_OFFERED` | `backend/src/plugins/pricing/line-invalid-reason.ts:5,31,46,56`; site relinks by variant id in `src/lib/basket/stale.ts` |
| Set discounts | material axes from `variant.options` ("authoritative") | `backend/src/plugins/product-set/material-picks.ts:40`, `set-basket.service.ts:78-93`, `set-basket.ts:314-336` |
| Material collections | facet values on variants | `backend/src/plugins/material/material-facet-sync.ts:125,226`, prefix in `backend/src/plugins/product/facet-plan.ts:13` |
| Dashboard | order lines link to `/product-variants/:id`; generated products show a `generatedVariants` list | `backend/src/dashboard/product/` |

Already independent of variants: line selections and `lengthCm` custom fields
(`backend/src/vendure-config.ts:235,241`), emails and checkout summaries
(built from selections + definition labels), banned-combination checks (also
re-run server-side from the definition), live site prices (shared pricing
package). Inventory is not a consumer (`trackInventory` forced off).

**Material collections have no consumer.** Nothing in `src/` queries
collections (the only `collection` hits are Tina content-collection
comments), the site reads product-level facet values only for the type facet
(`src/lib/catalog/`), set discounts are promotions keyed by product ids
(ADR 0014), and the only references to the `material-` prefix are its
definition and the sync that maintains it. Search is build-time Pagefind
(ADR 0004); `DefaultSearchPlugin` serves the admin only.

## What matters (ranked)

1. **Production safety** — memory, sync load and outage risk bounded by
   catalog size, not by the product of options × languages × channels.
2. **Correctness** — prices, set discounts and validation stay right; placed
   orders keep their history.
3. **Owner workflow** — nothing the owner does in the dashboard gets harder.
4. **Maintainability** — fewer seams and less code that has to agree.
5. **Migration risk/effort** — few, reversible, independently shippable steps.
6. **Roadmap fit** — second market (epic 9), more languages.

## Options

**A. Do nothing / not now.** Keep generation, now fixed and fast.
(1) Safe at today's size, but the failure mode remains structural — the next
option, language or channel multiplies rows, and pacing rules for bulk writes
stay a human discipline. (2) Proven. (3) Unchanged. (4) Keeps two
representations of every choice (variant options *and* selections) that four
consumers must keep agreeing. (5) Zero. (6) Epic 9 multiplies price rows and
must decide where SK prices come from for every generated variant.

**B. Keep generation, cap it or generate lazily** (create a variant on first
add-to-cart). (1) Caps help; lazy creation moves writes onto the shop request
path — new concurrency and failure modes at checkout. (2) Same two
representations. (3) The variant list becomes partial and confusing.
(4) Adds code. (5) Medium. (6) Little gain. Dominated by A or C.

**C. One native variant per configurable product; choices only in
selections.** The sync maintains one variant (base price, names), no option
groups. Pricing, set discounts and validation read `selections` + definition.
(1) Rows scale with product count; the matrix-sized sync, loader and drift
detection go away. (2) Pricing already works from definition + selections;
set discounts and validation switch their axis source; banned combinations
are already re-checked from the definition. Placed orders keep their
(disabled) historical variants. (3) Order lines show selection labels instead
of a variant name; the generated-variants list disappears. Per-combination
disable via the dashboard is not a current feature (the sync does not manage
`enabled`; drift would revert it) — if wanted, it becomes a definition rule
like banned combinations. (4) Net removal: matrix generation, the paged
variant query, `pickVariant`, variant-option reads. (5) Needs a basket
migration and a dashboard change. (6) One price row per product per channel.

**D. Variant per material combination only** (drop priced selects/toggles
from the axes). (1) Shrinks babafeszek 1,152 → 49ish, but material ×
material still multiplies. (2) Keeps the dual representation. (4) Least
code change but keeps every seam. Only worth it if material-level native
variants had a consumer — they don't.

## Decision (proposed)

**Option C.** The variant matrix buys facet-based collections nobody reads,
at the cost of the system's main operational risk and a duplicated
representation of every choice. Would supersede **ADR 0010 decision 1**
(variants for the full matrix, prices = base + Σ option prices — becomes one
variant at the base price), the **variant part of decision 6** (Material/Color
facets on variants and facet-based material collections — dropped, or moved
to product level if a consumer appears), and the "Facets + Collections"
delivery step's variant scope. Decisions 2–5, 7, 8 stand; decision 5 extends
to every field.

## Rollout plan

Each step ships alone; the system is correct after each.

1. **Readers go selection-first.** Pricing (`line-valuation.ts`), set
   discounts (`material-picks.ts`, `set-basket.service.ts`, `set-basket.ts`)
   and validity (`line-invalid-reason.ts`) derive axes from `selections` +
   definition. Prove equivalence on today's matrix: for every generated
   variant, axes from its options == axes from selections. **Guard:** a test
   that greps `backend/src` for `variant.options` / `options.group` relation
   loads, with an allowlist of remaining uses that only shrinks.
2. **Site sends full selections** for axis fields (it already sends
   `selections`; confirm every axis is included) — still to the matched
   variant.
3. **Drop material collections** and their facet sync (no consumer, see
   Context). Migration deletes the `material-*` collections; facet values on
   historical variants are left alone.
4. **Single variant.** Sync creates/keeps one "configurable" variant per
   generated product and disables (soft-deletes) the rest; placed orders keep
   theirs. The site adds to the single variant; `productVariants(slug)` and
   `pickVariant` are removed. **Basket migration:** active orders whose lines
   point at a generated variant are relinked to the product's single variant
   with selections derived from the old variant's options; anything
   unresolvable is flagged `VARIANT_UNAVAILABLE` (existing reason, site
   already handles it). **Guard:** the sync refuses to create a second
   variant for a generated product (test).
5. **Dashboard.** Order lines show selection labels and link to the
   product; the generated-variants list is removed.
6. **Cleanup.** Matrix generation, drift hashing over variants, flat
   matrix loader, the allowlist (empty) — deleted.

Verification before prod for steps 3–4: `pnpm run db:pull-prod` into the
prod-parity sim, run the migration, compare every active order's totals
before/after (must be equal), check placed orders still render, and pace the
production run per the bulk-write rule in AGENTS.md (watch `job_record`).

## Open questions for the owner

- Do you ever want to disable a single combination (not ban it for all)?
- Should materials/colors be browsable on the future site (would need
  product-level facets, not variants)?
- Is a variant SKU per combination needed for anything external
  (invoicing, Barion, accounting) in epic 7?
