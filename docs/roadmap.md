# Roadmap

The top-level plan for the shop platform. One line per epic here; detailed
plans live in the ADRs and specs they link to. Update statuses as epics
progress; change the epic list or the principles only with the owner.

**Top-level goal: being ready to expand outside of Hungary.** Every epic is
chosen with that in mind (tax/invoicing correctness, translations, multi-country
ordering).

## Principles (fixed — do not relitigate)

1. **Product information is never stored in Tina — at no point in the
   roadmap.** No Tina product collections are added or extended, no Tina
   authoring forms are built for the catalog, and no work item ever resumes
   Tina-side catalog tooling.
2. **The Astro site is untouched by backend work until epic 3.** Nothing under
   `src/` or `tina/` is modified for Vendure's benefit; the site keeps running
   on Tina exactly as it is until the site cutover epic.
3. **Vendure must support every product field Tina has today** (field kinds
   input/select/radio/color/toggle/embroidery/material, banned material
   combinations, length-based pricing, product groups/related products;
   per-product discounts are dropped by owner decision, see epic 2 status).
   Existing Tina product content was the catalog migration's source and
   remains the completeness yardstick; **trimming content files for schema
   validity is allowed** (both products and materials, minimal frontmatter
   edits — site code/tooling stays untouched).
4. **Length-based pricing is a hard requirement.** It is only phased out if it
   proves to be a really big problem — ADR 0010 shows it fits natively
   (OrderLine length + per-material per-cm prices), including un-splitting the
   rácsvédő products.
5. **Native Vendure as much as possible** unless product-management UX
   genuinely suffers (the structured model exists exactly because the stock
   variant editor cannot express this catalog).
6. **The seed machinery is temporary and preview-only.** Prod migration at
   cutover is a hand-migration run directly from the repo. (Done 2026-11-06:
   the prod hand-migration ran and the importers were removed.)
7. **Embroidery per-word stays a special case** (a priced input field kind,
   never a variant axis).

## Epics

| #   | Epic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | **Deploy Vendure, use it exactly how we used web3forms** — self-hosted backend receiving order requests, nothing more                                                                                                                                                                                                                                                                                                                                                                                                                                                          | done                                         |
| 2   | **Implement the product catalog fully in Vendure with a good, manageable admin UX — this epic.** Includes set discounts. The delivery plan lives in [ADR 0010](adr/0010-native-generated-product-model.md) (product model: native-with-generation; dashboard configurator, facets/collections, promotions, set discounts) with the migration architecture in [ADR 0009](adr/0009-side-by-side-vendure-catalog-migration.md). Materials are already ported (PR #76). Variant matrix retirement: [ADR 0016 plan](#adr-0016-plan-one-variant-per-configurable-product)            | in progress                                  |
| 3   | **Move the Astro site over to Vendure** — show products from Vendure, place orders the new way against the epic-2 order-line fields and server pricing (quote/order handover). Plan: [Epic 3 plan](#epic-3-plan-site-cutover)                                                                                                                                                                                                                                                                                                                                                  | in progress — only S6 (prod cutover) remains |
| 4   | **Remove the product Tina backend** — delete the product collections and their tooling once the site no longer reads them                                                                                                                                                                                                                                                                                                                                                                                                                                                      | done (2026-11-06)                            |
| 5   | **Order resolution management** — the owner works orders in the Vendure dashboard: manual order-line stage changes (paid, order sent, fulfilled, …). Drives the later steps                                                                                                                                                                                                                                                                                                                                                                                                    | not started                                  |
| 6   | **Native delivery methods** — replace the email/request-era delivery handling with Vendure-native shipping; the checkout address becomes structured (native shipping-address columns: postcode, city, street, country — carrier labels need them)                                                                                                                                                                                                                                                                                                                              | not started                                  |
| 7   | **Barion payment provider on the site** — including proper tax setup and invoicing integration to the Hungarian tax entity (NAV). Tax note: the channel is `pricesIncludeTax` (stored prices are gross — `ChannelSetupPlugin`); this step adds the 27% HU `TaxRate` so invoices show the extracted ÁFA without changing any stored price. Checkout gains an optional separate billing address ("differs from delivery") with company name and tax number, stored as the order's native billing address (`setOrderBillingAddress`) and reusing epic 6's structured address form | not started                                  |
| 8   | **English translation of the site**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | not started                                  |
| 9   | **Expand to Slovakia** — accept orders from Slovakia (delivery, tax, translations as needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | not started                                  |

## Epic 3 plan (site cutover)

Architecture: [ADR 0012](adr/0012-site-reads-vendure-at-request-time.md)
(catalog pages render on demand in the Worker, islands ship from `dist`,
shared pricing package, basket is the Vendure active order). Principle 2
ends here: epic 3 changes `src/`. Tina product collections stay until epic 4.
Merge strategy (owner decision): backend and other invisible changes are PRs
against `feat/vendure-materials` (PR #76); customer-facing site changes are
PRs against `feat/site-cutover`, which branches from it. Order: merge #76 to
`main` → one-off prod migration of all products with full-size assets →
merge the fast-sync PR (which also removes the preview importers) →
merge `feat/site-cutover` → cleanups as follow-ups. A slice with both kinds
splits into two PRs.

- ✅ **S1 Shop-API catalog surface + site data layer** — the shop API exposes
  what the site renders (product definitions, materials and colors, thread
  colors, product groups, display fields, assets, `popularityRank`); the site
  gets a zod-validated shop-API client (`src/lib/vendure/`, `src/lib/catalog/`)
  with a contract test (`CATALOG_CONTRACT_API_URL`). No pages switched. Long
  product/material descriptions are S7
- ✅ **S2 Shared pricing package** — one pure workspace package used by the
  backend pricing strategy and the configurator; replaces the backend's own
  copy and the site's `src/lib/pricing` configurator pricing (ADR 0002)
- ✅ **S3 Product page from Vendure** (needs S1, S2) — on-demand product
  detail page, configurator fed by the canonical definition, Vendure asset
  images, edge caching
  detail page, configurator fed by the canonical definition, Vendure asset
  images, edge caching
- ✅ **S4 Catalog list, materials, search, sitemap** (needs S1) — on-demand
  product list (ADR 0004 dataset per request) and material pages; catalog
  sitemap and search replacements for the prerender-only integrations
- ✅ **S5 Vendure basket and checkout** (needs S1, S2) — the basket is the
  active order; checkout carries contact, address, delivery and message;
  `submitQuoteOrder` and client basket pricing retired from the site; emails
  built from the order. Backend contract: [ADR 0013](adr/0013-checkout-on-the-native-vendure-order-flow.md)
  - ✅ **S5a Backend** — native shipping methods and the free-delivery
    promotion (seeded), the checkout readiness gate, per-line
    `invalidReason` on the shop API, emails built from the order. The legacy
    `submitQuoteOrder` path stays until the cutover (deploy skew) and is
    **marked for removal in the cutover follow-up** (ADR 0013 decision 8). S5a lands in
    `feat/site-cutover` (it deploys site and backend together), so it may
    change the old checkout
  - ✅ **S5b Site** — basket and checkout islands on the shop API, `/checkout`
    form, `submitQuoteOrder` and the client basket pricing retired from the site
    (checkout E2E: `pnpm run test:checkout-e2e`; the set section waits for the
    shop API's set fields; the set section and per-line set state are wired
    to the shop API's `Order.setDiscounts` / `OrderLine.setState`, computed
    server-side by one service shared with the promotion (backend integration
    tests: `pnpm -C backend run test:integration`). Contact details are saved
    onto the active order and pre-filled from it, never kept in the browser)
    Stale-page UX (owner requirement, catalog pages are cached ~60 s): a
    changed price shows the server price on the line with a visible notice; a
    line whose option is no longer offered is marked with the reason and can be
    edited or removed, and checkout is blocked until it is resolved (never
    silently changed); a refused add-to-basket explains why and offers a reload
- ✅ **S7 Markdown descriptions** (after S1; parallel with S3/S4) — product
  and material long descriptions are stored as markdown so the site drives
  their styling; a dashboard markdown editor (Vendure's exported rich-text
  toolbar/image dialog + TipTap's markdown extension) replaces
  `Product.description` and edits a new translatable material description;
  images reference Vendure assets by their host-relative source path and the
  site renders them as asset-server preset URLs; raw HTML is disabled; the
  catalog import carried the Tina bodies
- ✅ **S6 catalog migration** (2026-11-06) — the prod hand-migration ran
  from a dev machine: 33/33 products, 11 materials, facets, display fields,
  groups and the szett promotion; the `[placeholder]` products stay until
  the switch (the live checkout targets them). The importers were removed
  with this change; prod's search index needed an admin `reindex` (the
  indexer's incremental `update-variants` job only indexes its first
  take-50 page — any future bulk write must reindex or page)
- ⬜ **S6 switch & verify** — merge the site cutover, flip prod to the
  Vendure catalog, retire the placeholders, run the epic-2
  Vendure-complete gate and the user / owner journey click-throughs

## Post-cutover follow-ups

- ✅ **Legacy path removal** (2026-11-06) — the quote-order plugin, its
  `submitQuoteOrder` mutation, CI roundtrip and legacy email handlers are gone
  (ADR 0013 decision 8); the legacy order-line custom fields stay so placed
  orders keep their stored snapshots. The redundant site-side pricing copy
  (`src/lib/pricing`) is gone too: the order island's unit price comes from the
  shared pricing package (`catalog/livePrice`) and only the display breakdown +
  set-grouping helpers remain, moved to `src/lib/order/`.
- **Edge-cache verification** — on the deployed site, request a catalog page
  (`/product`), a material page and an asset preset URL twice: the second
  response shows `CF-Cache-Status: HIT`; after 60 s a request is served stale
  (`UPDATING`/`STALE`) and refreshed; after 360 s with the backend stopped the
  page shows the error page. Record whether asset URLs are edge-cached at all
  (they are served by the VPS); if not, decide on a cache rule for `/assets`.

- **Popularity from real past orders** — derive `popularityRank` from actual
  order history instead of the curated Tina ordering (owner: nice to have, not
  a priority).
- **Product×material×color imagery** — photos of completed products keyed by
  (product, material, color): editor slots in the configurator (asset
  upload/picker per material+color row in the definition's material fields),
  storefront resolution when the site reads Vendure (definition image →
  material-color image → product featured asset). Modeled in ADR 0010
  decision 5; deliberately not a variant axis.

## Epic 2 status detail

Stacked PRs against `feat/vendure-materials` (the migration base branch, not
merged to main until the backend structure is settled):

- ✅ Materials ported — numeric ids, slug business keys, dashboard CRUD,
  data-preserving migration, preview seed (PR #76)
- ✅ Product architecture decided — native-with-generation (ADR 0010,
  spike-proven)
- ✅ Canonical product schema in `packages/product-definition` (PR #77)
- ✅ Products core (definition storage, batched variant sync with drift
  detection, migration, admin API — PR #77). The variant sync used to run
  ~1.5–3 variants/s inside Vendure's `ProductVariantService.create` (on the
  shared box, observed ~1/s with the whole matrix buffered in one
  uncommitted transaction — no observable progress for 20+ min on the
  1344-variant product); the bulk writer replaces it (see S6)
- ✅ Dashboard production pass (async job-queue sync — 576-variant save
  returns in ~130ms with background convergence; configurator page block on
  the stock product page; creation folded into the stock new-product page
  (Konfigurátoros termék switch in the block; unified Létrehozás button);
  UI review pass fixed a real
  data-loss bug in save; dashboard e2e 4 specs green — PR #77). Polish pass
  closed the four spike leftovers: the configurator block spans the full
  page width (dashboard-native `column: "full"`), the stock variants
  grid / generate-variants prompt / option-group editor hide on generated
  products (the generated flag rides the stock page's own extended query —
  no `pnpm patch` needed), drift details are listed under the stale badge,
  and zod validation messages are localized to Hungarian
- ✅ Facets + Collections — later removed with the variant matrix (ADR 0016
  step 4): no material/color facets or per-material collections remain
- ✅ Server-side pricing + promotions — a custom `OrderItemPriceCalculationStrategy`
  prices length/embroidery from order-line custom fields (`lengthCm`,
  `selections`), with an order interceptor rejecting unpriceable lines (no
  0 Ft lines); the szett discount is one Promotion per set (custom condition +
  order action, ADR 0014): the condition's args list the member products and
  the action's arg the flat Ft amount, so the sets are created and edited
  entirely in the Promotions section — membership no longer lives in
  Collections, the related-items groups are private top-level Collections
  (no grouping parent). The backend keeps its own
  copy of the pricing logic; `src/lib/pricing` is untouched until cutover
  (supersedes the price-authority part of issue #71). Per-product %
  discounts are dropped (owner decision: unused); they get no Vendure home
- ✅ Display fields — `shortDescription`, `tagline` (the Tina `categories`),
  `date` and `icon` as `Product` custom fields and gallery descriptions as an
  `Asset` custom field, editable in the stock dashboard and populated by the
  catalog import ([ADR 0010](adr/0010-native-generated-product-model.md))
- ✅ Native ownership of product identity — the native Product owns its name
  and slug ([ADR 0011](adr/0011-native-ownership-and-translatable-catalog.md)
  decision 1): the canonical definition dropped its `label` (data migration
  deletes the stored key), the configurator's create flow asks for the name,
  the slug is seeded from the definition id at creation only, generated
  variant names read the native name (a stock rename's `ProductEvent`
  re-enqueues the sync), and name/slug left the drift hash
- ✅ Native product type and thread colors —
  [ADR 0011](adr/0011-native-ownership-and-translatable-catalog.md)
  decisions 2 and 3: product type is the public `babasarok-product-type`
  facet (product level, owner-assigned), thread colors the private
  `babasarok-thread-color` facet with `hex`/`swatch` custom fields; `type`
  left the canonical definition (data migration) and `ThreadColorPaletteSchema`
  was retired; the order-line interceptor rejects unknown thread colors;
  the import seeded both, the owner maintains them on the stock dashboard
- ✅ Translatable catalog text — material/color labels, subtitle and
  description are Vendure translation entities and definition text is a
  `LocalizedText` (`hu` required, others optional, hu fallback), edited in the
  dashboard's content language; the generated variant carries the product
  name in every language
  ([ADR 0011](adr/0011-native-ownership-and-translatable-catalog.md)
  decision 6)
- ⬜ Vendure-complete gate — catalog fully manageable in the Vendure dashboard,
  nothing left that only Tina can do. Folded into epic 3 S6: the owner runs
  the gate on the cutover preview before the prod switch
- ✅ Variant sync self-heals after a crash/redeploy (restarts from zero)
- ⬜ Resume without redoing work (staged disabled-variant build, see
  `spike/sync-resume`) — revisit after real use. Note: if the bulk-writer
  sync (see S6, 2026-11-06) lands, full syncs drop to seconds and this
  matters much less

## ADR 0016 plan (one variant per configurable product)

Part of epic 2. Decision and rationale:
[ADR 0016](adr/0016-one-variant-per-configurable-product.md) (accepted
2026-11-09; supersedes ADR 0010 decision 1 and the variant/facet part of
decision 6). Each step ships alone:

All seven steps are implemented in PR #108; the two migrations
(`1794300000000-drop-material-facets-and-collections`,
`1794400000000-one-variant-per-product`) run at its deploy and were rehearsed
on a copy of production (`backend/integration/rehearse-one-variant.test.ts`).

- ✅ **1. Selections authoritative** — pricing, set discounts and line
  validity read the selections + definition (`axisCodes`)
- ✅ **2. Server refuses forbidden material combinations** from the
  selections, at add/adjust and as an `OPTION_NOT_OFFERED` reason
- ✅ **3. Variant agreement check retired**
- ✅ **4. Material collections and Material/Color facets dropped** (owner:
  no material/color browsing, now or later) — migration
- ✅ **5. Single variant** — the sync keeps one variant per generated
  product; a migration soft-deletes the matrix and moves active basket lines
  onto the new variant
- ✅ **6. Dashboard** — order lines show the product and its configuration;
  no generated-variants list
- ✅ **7. Cleanup** — matrix generation, option groups, drift hashing,
  `productVariants(slug)`, `pickVariant` and the material facet sync are
  gone

Remaining uses of the old way: none. The ESLint rule
(`eslint/variant-option-reads.ts`) blocks reading a variant's options again.

## Epic 8 plan (English / multi-language)

Owner requirement: the site will support multiple languages (English first).
Build on what exists; do not relitigate the catalog decision:

- Already translatable (ADR 0011 decision 6): material/colour labels and
  descriptions, definition text (`LocalizedText`, hu required, hu fallback),
  the generated variant's name (the product's). The shop API takes a
  `languageCode` per request and the site's API client already passes one.
- To translate for epic 8:
  - Site UI strings — every hardcoded Hungarian string in the site
    (checkout labels, basket/checkout messages incl. the set-state messages
    and the Hungarian error mappings in `src/lib/basket`, product-page and
    list labels, cookie banner). Extract to locale dictionaries; route
    per-locale (Astro i18n routing, hreflang).
  - Buyer-visible server messages — translate at the server per request
    language (one source of truth; the site renders what the server says).
    `OrderLine.invalidReason` is ready: each message carries a stable `code`
    and `ctx.languageCode` already reaches the shared rejection helper. The
    two free-text surfaces (the pricing package's invalid-configuration
    message and `checkoutRefusal`) get their Hungarian templates moved into
    the same per-language tables. Vendure's own default errors stay English
    server-side — the site maps them by `errorCode`, so that one map grows
    locale-keyed dictionaries.
  - Order emails — Hungarian templates need per-locale variants.
  - Native names — delivery methods, promotions and set-group titles are
    Vendure-translatable; give them English values.
  - Non-catalog Tina content (privacy, contact, blog, ÁSZF) needs per-locale
    content; the product collections are gone by epic 4 and must NOT return
    as a translation home (roadmap principle).
  - SEO surfaces — per-locale sitemap/search index, meta titles and
    descriptions.
- Prices stay HUF for English at first (EUR is epic 9's scope); do not couple
  the two epics.

## Epic 9 design notes (multi-market tax & pricing)

Analysis parked from the epic 7 tax work, so epic 9 (Slovakia) starts here
instead of re-deriving it. Verified against the Vendure docs (Taxes,
Channels) and core source.

**Already in place, correct for every option:** the channel is
`pricesIncludeTax` (stored prices are gross — `ChannelSetupPlugin`), the HU
zone is wired as `defaultTaxZone`/`defaultShippingZone`, and variants carry
Vendure's default "standard" `TaxCategory`. Gross prices are the right
invariant for both HU and SK (both are gross-display consumer markets), and
none of the options below changes stored prices.

**Options:**

1. **Single channel + `AddressBasedTaxZoneStrategy`** — smallest change: add
   the SK zone + SK TaxRates, swap the strategy (one config line). Only
   viable with one currency, and a gross Ft price re-extracted at the SK
   rate _changes the buyer's price_ — tax-inclusive prices don't translate
   across differing VAT rates. Cross-border VAT legality (distance
   selling/OSS) is not simply "buyer's country rate"; rates are data, so a
   custom strategy can encode the registration model chosen then.
2. **One Channel per market** (Vendure's region-specific pattern) — HU
   channel (Ft, 27%), SK channel (EUR, SK rates). The catalog is shared:
   every variant stays assigned to the default channel and a sub-channel
   references the same variants with its own `ProductVariantPrice` row per
   currency (`syncPricesAcrossChannels` if prices should stay linked).
   Materials, facets, collections and promotions are channel-aware the same
   way. Deciding factor: EUR for SK pushes here.

**Open questions to decide at epic 9:**

- **Where SK prices come from.** The configurator resync writes prices in
  the default channel's context only; a second channel needs a source for
  its price rows — manual per-channel pricing in the dashboard, a conversion
  rule applied at resync, or per-market prices in the canonical definition
  model. Do not create the SK channel before deciding.
- **Currency precision.** `MoneyStrategy` is process-global, not
  per-channel: `ForintMoneyStrategy`'s `precision: 0` would also render
  whole-euro prices on a SK channel. Likely acceptable (round prices), but a
  conscious decision, not an accident.
