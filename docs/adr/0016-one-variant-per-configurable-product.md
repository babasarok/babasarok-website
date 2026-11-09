# ADR 0016: One native variant per configurable product — choices live only in line selections

- **Status:** accepted (accepted by the owner on 2026-11-09)
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

| Consumer                        | Reads                                                                                                                                                            | Evidence                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add-to-cart                     | the whole matrix via the paged `productVariants(slug)` shop query; picks the variant whose options match the axes, refuses when none matches                     | `backend/src/plugins/product/product.resolver.ts:258,309`, `src/lib/basket/lineInput.ts:118-157`                                                                 |
| Server pricing                  | `variant.options` codes (axis values, and a refusal when a material/choice selection disagrees with the variant) + the variant list price as the non-length base | `backend/src/plugins/pricing/line-valuation.ts:32,66`, `backend/src/shared/pricing/line-price.ts:119-279`                                                        |
| Line validity                   | `VARIANT_UNAVAILABLE` (variant disabled/deleted), `OPTION_NOT_OFFERED` via the same valuation                                                                    | `backend/src/plugins/pricing/line-invalid-reason.ts:5,31,46,56`; the site matches its just-added line by variant id + selections in `src/lib/basket/stale.ts:51` |
| Forbidden material combinations | **only** the matrix: banned variants are not generated; no server check reads `forbiddenMaterialCombinations` for order lines                                    | `backend/src/plugins/product/variant-plan.ts:191`; absent from `line-rejection.ts` and `shared/pricing/selection-validation.ts`                                  |
| Set discounts                   | material axes from `variant.options` ("authoritative")                                                                                                           | `backend/src/plugins/product-set/material-picks.ts:40`, `set-basket.service.ts:78-93`, `set-basket.ts:314-336`                                                   |
| Material collections            | facet values on variants                                                                                                                                         | `backend/src/plugins/material/material-facet-sync.ts:125,226`, prefix in `backend/src/plugins/product/facet-plan.ts:13`                                          |
| Dashboard                       | order lines link to `/product-variants/:id`; generated products show a `generatedVariants` list                                                                  | `backend/src/dashboard/order-lines/order-lines.tsx:74`, `backend/src/dashboard/product/`                                                                         |

Already independent of variants: line selections and `lengthCm` custom fields
(`backend/src/vendure-config.ts:235,241`), emails and checkout summaries
(built from selections + definition labels, ADR 0013 decision 7), the
selection validation at add/adjust (`line-rejection.ts`), live site prices
(shared pricing package, `src/lib/catalog/livePrice.ts`, which already
derives the variant price from the definition). Inventory is not a consumer
(`trackInventory` forced off). Stored line prices change only on add/adjust
(ADR 0013 decision 6), so moving the price inputs does not reprice baskets.

What the selections already carry (`src/lib/basket/lineInput.ts:18-58`):
one record per _visible_ field — toggles always (`igen`/`nem`), choices and
materials once picked. `pickVariant` (`lineInput.ts:118-132`) fills the
gaps: an unpicked choice/material or a custom value takes the first listed
option, an absent toggle `nem`. Those defaults are therefore the axis values
of today's lines whenever a selection is absent.

**Material collections have no consumer.** Nothing in `src/` queries
collections (the only `collection` hits are Tina content-collection
comments), the site reads product-level facet values only for the type facet
(`src/lib/catalog/`), set discounts are promotions keyed by product ids
(ADR 0014), and the only references to the `material-` prefix are its
definition and the sync that maintains it. Search is build-time Pagefind
(ADR 0004); `DefaultSearchPlugin` serves the admin only. (The product-sets
spec's "public top-level collections are material navigation" describes an
intent, not a consumer.)

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
representations of every choice (variant options _and_ selections) that four
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
set discounts and validation switch their axis source; forbidden material
combinations need a new server check from the selections (today only the
missing variant enforces them). Placed orders keep their
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

## Decision

**Option C.** The variant matrix buys facet-based collections nobody reads,
at the cost of the system's main operational risk and a duplicated
representation of every choice. Supersedes **ADR 0010 decision 1**
(variants for the full matrix, prices = base + Σ option prices — becomes one
variant at the base price), the **variant part of decision 6** (Material/Color
facets on variants and facet-based material collections — dropped, not moved
to product level; owner decision below), and the "Facets + Collections"
delivery step's variant scope. Decisions 2–5, 7, 8 stand; decision 5 extends
to every field.

## Rollout plan

Each step ships alone; the system is correct after each.

1. **Selections are authoritative for pricing, set discounts and line
   validity.** One shared function derives the axis values from the
   selections and the definition with `pickVariant`'s defaults (absent toggle
   → `nem`, absent choice/material or custom value → first listed option; a
   listed value the field does not offer is refused). Pricing computes the
   non-length base as base price + visible axis option prices — the walk
   length-priced products already use — instead of the variant list price;
   the set gate reads its material picks from the same derivation. The
   variant still exists and is still checked for agreement with the
   selections (the existing refusal, kept so nothing a buyer can do changes),
   in one allowlisted module. Buyer-visible behaviour is unchanged, except
   that during a sync lag the server now charges the definition's price (what
   the configurator showed) instead of the stale variant price. The site's live
   price and its variant pick read the same selections through the same
   function, so a hidden axis field takes its default everywhere. **Guard:** an ESLint
   `no-restricted-syntax` rule blocks variant-option reads (`variant.options`,
   `productVariant.options`, `options`/`options.group` relation loads) with
   an allowlist of the remaining uses (listed below); a unit test fails when
   an allowlisted file no longer needs its entry or when an entry is added.
2. **Server refuses forbidden material combinations** from the selections at
   add/adjust and as an `OPTION_NOT_OFFERED` reason — today only the absent
   variant enforces them, which step 5 removes.
3. **Variant agreement check retired.** With 1–2 in place the server no
   longer needs the variant to agree with the selections; drop the check
   (allowlist shrinks).
4. **Drop material collections and the Material/Color facets** (no
   consumer, see Context; owner: no material/color browsing, now or later):
   a migration deletes the `material-*` collections, the sync stops writing
   facet values on variants, and the material facet sync and
   `convergeMaterialFacets` go away; the facet values go with their facets.
5. **Single variant.** The sync keeps one variant per generated product at
   the base price and soft-deletes the rest; placed orders keep theirs. The
   site adds to the single variant; `productVariants(slug)` and `pickVariant`
   are removed. **Basket migration:** lines of active (not placed) orders
   that point at a generated variant are relinked to the product's single
   variant; their selections already carry everything step 1 reads and their
   stored prices stay (ADR 0013 decision 6). Lines that cannot be relinked
   surface as `VARIANT_UNAVAILABLE`, which the site already handles.
   **Guard:** Vendure refuses a second variant with the same (empty)
   option combination, and the sync refuses a product with more than one
   live variant (tests).
6. **Dashboard.** Order lines show selection labels and link to the
   product; the generated-variants list is removed.
7. **Cleanup.** Matrix generation, option groups, drift hashing over
   variants, the flat matrix loader, the allowlist (empty) — deleted.

Verification before prod for steps 4–5: on a local copy of production
(`pnpm run db:pull-prod`, run by the owner), run the migration, compare every
active order's line prices and totals before/after (must be equal), check
placed orders still render in the dashboard, and pace the production run per
the bulk-write rule in AGENTS.md (watch `job_record`).

### Remaining uses of the old way

None: all steps landed in PR #108. The ESLint rule
`eslint/variant-option-reads.ts` stays and blocks reading a variant's
options again.

## Owner answers (2026-11-09)

- **No per-combination disable.** Not needed now; when it is, it becomes an
  entry in the definition's `forbiddenMaterialCombinations` — no separate
  per-combination switch.
- **No material/color browsing on the site, now or later.** Step 4 drops the
  material collections and the Material/Color facets outright; they do not
  move to the product level.

- **No path back to the matrix.** Nothing is kept for a revert or "just
  in case": no compatibility layers, no dual paths beyond a step's own
  transition, no matrix preserved for invoicing. Each step deletes what it
  makes dead (code, helpers, tests, docs) and shrinks the guard allowlist.

## Invoicing identifiers (researched 2026-11-09)

No source requires a distinct item code per option combination, so nothing
in the rollout depends on one. An invoice line carries the product's name
and SKU with the selection labels as its description.

- VAT Act (2007. évi CXXVII. tv.) § 169 (1) f): the product's name
  (megnevezés) and quantity are mandatory; tariff numbers (VTSZ/SZJ) are at
  the issuer's choice ([njt.jog.gov.hu](https://njt.jog.gov.hu); NAV guide
  [3012-2018](https://nav.gov.hu/pfile/file?path=%2Fszabalyzok%2Futmutatok%2F3012-2018_20181112_a.pdf)).
- NAV Online Számla 3.0: `productCodes` and `lineDescription` are both
  `minOccurs="0"` in `invoiceData.xsd`
  ([nav-gov-hu/Online-Invoice](https://github.com/nav-gov-hu/Online-Invoice)).
- Barion: `Items[].SKU` is optional — per the research (docs.barion.com,
  Item); not re-verified.
- Számlázz.hu's item `azonosito` is optional
  ([docs](https://docs.szamlazz.hu/hu/agent/generating_invoice/xml)); Billingo
  v3 items have no product-code field
  ([API](https://api.billingo.hu/)).
- Warranty decree 151/2003: a name/type suitable for identification
  ([njt](https://njt.jog.gov.hu/jogszabaly/2003-151-20-22)).

Should a per-line identifier ever be wanted, it is computed from the product
and the line's selections.
