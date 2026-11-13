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

| #   | Epic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Deploy Vendure, use it exactly how we used web3forms** — self-hosted backend receiving order requests, nothing more                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | done                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | **Implement the product catalog fully in Vendure with a good, manageable admin UX — this epic.** Includes set discounts. The delivery plan lives in [ADR 0010](adr/0010-native-generated-product-model.md) (product model: native-with-generation; dashboard configurator, facets/collections, promotions, set discounts) with the migration architecture in [ADR 0009](adr/0009-side-by-side-vendure-catalog-migration.md). Materials are already ported (PR #76). Variant matrix retirement: [ADR 0016 plan](#adr-0016-plan-one-variant-per-configurable-product)                                                                                                                                | in progress                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | **Move the Astro site over to Vendure** — show products from Vendure, place orders the new way against the epic-2 order-line fields and server pricing (quote/order handover). Plan: [Epic 3 plan](#epic-3-plan-site-cutover)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | done (2026-11-07)                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | **Remove the product Tina backend** — delete the product collections and their tooling once the site no longer reads them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | done (2026-11-06)                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | **Order resolution management** — the owner works orders in the Vendure dashboard. Its state design is part of epic 7's payment integration (that is when payment at placement — full or the 6 000 Ft deposit — gives the order a state that can progress to delivery); until then the owner tracks the steps manually, which is enough. See [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7)                                                                                                                                                                                                                                                                                       | not started                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | **Native delivery methods** — replace the email/request-era delivery handling with Vendure-native shipping; the checkout address becomes structured (native shipping-address columns: postcode, city, street, country — carrier labels need them)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | in progress (2026-11-11: the checkout is a multi-step wizard with the structured address, the house number in streetLine2; open: the GLS parcel-shop picker, carrier labels — see [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7))                                                                                                                                         |
| 7   | **Barion payment provider on the site** — including proper tax setup and invoicing integration to the Hungarian tax entity (NAV) — the invoicing flow it must support is recorded in [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7). Tax note: the channel is `pricesIncludeTax` (stored prices are gross — `ChannelSetupPlugin`); this step adds the 27% HU `TaxRate` so invoices show the extracted ÁFA without changing any stored price. Checkout gains an optional separate billing address ("differs from delivery") with company name and tax number, stored as the order's native billing address (`setOrderBillingAddress`) and reusing epic 6's structured address form | in progress (2026-11-11: the Számlázás step, the billing address and the taxNumber order field shipped; open: Barion (incl. the order-state design it forces — see [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7)), tax, NAV invoicing, payment-method selection, Meta purchase-tracking handle — see [Epic 7 design notes](#epic-7-design-notes-meta-purchase-tracking)) |
| 8   | **English translation of the site**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | in progress (ADR 0015): routing, Tina content and backend language plumbing merged; UI dictionaries in progress                                                                                                                                                                                                                                                                            |
| 9   | **Expand to Slovakia** — accept orders from Slovakia (delivery, tax, translations as needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | not started                                                                                                                                                                                                                                                                                                                                                                                |

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
    Stale-page UX (owner requirement, catalog data shown can be ~60 s old): a
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
- ✅ **S6 switch & verify** (2026-11-07) — the cutover PR (#86) merged to main
  and prod switched to the Vendure catalog (verified live on
  babasarok.net: /product/ serves Vendure data). The `[placeholder]` products
  are retired (2026-11-09): the `retire-placeholder-products` migration
  soft-deletes them, and the orders referencing them keep their lines
  (`backend/integration/retire-placeholders.test.ts`).

## Post-cutover follow-ups

- ✅ **Legacy path removal** (2026-11-06) — the quote-order plugin, its
  `submitQuoteOrder` mutation, CI roundtrip and legacy email handlers are gone
  (ADR 0013 decision 8); the legacy order-line custom fields stay so placed
  orders keep their stored snapshots. The redundant site-side pricing copy
  (`src/lib/pricing`) is gone too: the order island's unit price comes from the
  shared pricing package (`catalog/livePrice`) and only the display breakdown +
  set-grouping helpers remain, moved to `src/lib/order/`.
- ✅ **Legacy snapshot fields consolidated** (2026-11-12) — the legacy-era
  custom fields (order: `deliveryMethodName`, `deliveryPrice`,
  `deliveryFree`, `orderTotal`, `setDiscountSummary`; order line: `title`,
  `detailsJson`, `quotedUnitPrice`, `quotedLineTotal`) were archived into
  one private order note per legacy order and their columns dropped
  (`archive-legacy-order-snapshots` migration): the legacy orders' variants
  are 0-priced placeholders, so those notes are the only place that data
  existed. The `isLegacyQuoteOrder` discriminator and its three guards went
  with them: legacy orders are already placed, the state machine cannot
  re-enter `AddingItems`, and nothing creates legacy quote orders anymore.
- **Static catalog shells** ([ADR 0017](adr/0017-static-catalog-shells.md),
  proposed) — catalog pages stop waiting for the backend: HTML pages are
  prerendered, catalog islands load the catalog in the browser through a
  nanostores catalog store shared across ClientRouter navigations, and only the
  detail routes render on demand so crawlers get the item's meta.
- **Edge-cache verification** — on the deployed site, request
  `/search-index.json` and an asset preset URL twice: the second response shows
  `CF-Cache-Status: HIT`. Record whether asset URLs are edge-cached at all
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
  selections, at add/adjust and as a `FORBIDDEN_COMBINATION` reason
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
  - ✅ Buyer-visible server refusals are codes with values (the shared
    `Refusal` schema): `OrderLine.invalidReason`, add/adjust refusals and
    the checkout transition refusal. The site words them from its locale
    files (`refusals.*`). Emails and line-detail labels stay server-rendered
    per request language. Vendure's own default errors stay English
    server-side — the site maps them by `errorCode`.
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

## Epic 7 design notes (Meta purchase tracking)

Analysis parked until the payment work touches conversions, so it isn't
re-derived. Today the Meta `Purchase` event fires client-side when the order
is _placed_ (`CheckoutWizard.svelte`), before any payment. Once Barion
redirects buyers to the gateway, that overstates conversions — the honest
signal is a server-side Conversions-API purchase on payment confirmation,
and it can only attribute to a Meta user if the order carries the Meta
browser ids. Epic 7 (or a follow-up) should:

- store the Meta tracking handle (`_fbp` cookie, optionally `_fbc` from the
  landing `fbclid`) on the order — only when the buyer gave `marketing`
  consent (the pixel itself loads only after consent, `src/lib/tracking.ts`)
- dedupe the client- and server-side Purchase events with a shared
  `event_id`
- update the privacy notice before shipping: it discloses `_fbp`/`_fbc` as
  ad-measurement cookies (30 days / at most 365 days); persisting the handle
  on long-retained orders is a processing detail that must be stated, with a
  retention story

Sending the handle to the basket without a server-side consumer buys
nothing — do it with the Barion conversion work, not before.

## Owner post-order flow (epics 5, 6 and 7)

The owner's workflow after an order (árajánlat) comes in, recorded 2026-11-13
from the owner. It is done manually today (Számlázz.hu, MyGLS, AutoKassza);
epics 5–7 must support it and, where noted, automate parts of it. It branches
on the payment method the buyer chose at checkout:

**Előre utalás (advance bank transfer):**

1. A díjbekérő (payment request) for the full order total, itemized per
   order line, is issued in Számlázz.hu.
2. When the buyer pays, AutoKassza pairs the bank transfer with the
   díjbekérő and the owner gets a notification.
3. The owner issues the számla (final invoice) from the paid díjbekérő.
4. The GLS label is created in MyGLS and saved without printing, so the
   delivery data does not have to be looked up again when the product is
   done. Personal pickup follows the same flow without a label.

**Utánvét (cash on delivery) — the deposit flow:**

1. A díjbekérő is issued fixed at 6 000 Ft (Hungary), regardless of the
   order total — this is the előleg (deposit).
2. AutoKassza pairs the payment and notifies as above; the owner issues an
   előlegszámla (deposit invoice) for the 6 000 Ft, based on the díjbekérő.
3. The GLS label is saved the same way, but flagged as utánvét; the deposit
   is deducted from the amount the courier collects.
4. When the product/set is finished, the végszámla (final invoice) is issued
   with the 6 000 Ft deposit deducted — Számlázz.hu puts the deposit among
   the line items automatically (előleg beszámítása) — and the invoice's
   payment method is switched to utánvét; the remaining amount is what the
   courier must collect.

Every díjbekérő and invoice carries a +3-day payment deadline (settable in
Számlázz.hu).

**Why invoice issuance is manual today.** Számlázz.hu can auto-generate the
előlegszámla when a díjbekérő's payment succeeds, but the owner switched it
off: the rule is per-account, not per-branch, so an előre-utalás order (whose
full-total díjbekérő is paid) would get a deposit invoice too instead of its
final számla. Telling the two apart seems to need invoice prefixes
(előtagok) — beyond what she has worked out. Any automation we build must
branch on the payment method: full-total díjbekérő → final számla, 6 000 Ft
deposit díjbekérő → előlegszámla (and the végszámla only when the product is
done).

**Target order states (designed with epic 7's payment integration, not
before).** Manual tracking is enough until payments are native; the first
true test is the payment integration, which is when payment at placement
gives the order a state that can progress to delivery. The sketch:

- At placement the buyer pays through Barion — the full total (card) or the
  fixed 6 000 Ft deposit (utánvét). The payment lands as a native Payment
  and the order leaves `ArrangingPayment` the same way for both branches.
- Bank transfer stays a first-class branch (both utánvét and bank transfer
  are popular in Hungary; Barion does not absorb it): díjbekérő → AutoKassza
  pairing → the owner records the payment in the dashboard (the native
  manual-payment action) and reaches the same states with a manual trigger.
- Ready to ship: the fulfillment is created (`Shipped` is not a bare status
  change — the guards verify fulfillment states), and that transition is the
  trigger point for preparing the végszámla (utánvét) / számla (prepaid).
- Utánvét: when the courier collects the remainder on delivery, that amount
  is recorded as the second payment and the order settles
  (`PaymentSettled`) — settlement tied to the delivery event.

Design decision parked on epic 7: the default `checkPaymentsCoverTotal`
guard requires authorized/settled payments to cover the full total, so a
6 000 Ft deposit cannot enter `PaymentAuthorized` under defaults — either
relax the option (`configureDefaultOrderProcess`) or add a custom state
(which would also give "in production" a home). The settle-on-delivery leg
should go through `Modifying` (`Shipped → PaymentSettled` once the COD
payment is recorded), not `ArrangingAdditionalPayment`, whose exit guard
also demands full coverage.

What this implies per epic:

- **Epic 5 (order resolution):** the state design is part of epic 7's
  payment integration, not separate work — until then the owner tracks the
  steps manually, which is enough. Today's progression: díjbekérő issued →
  payment paired (AutoKassza) → invoice(s) issued → label saved → product
  finished → (utánvét) final invoice → shipped. The payment-paired
  notification must reach the owner.
- **Epic 7 (invoicing):** the Számlázz.hu integration needs díjbekérő,
  előlegszámla and végszámla with deposit set-off (előleg beszámítása),
  payment-method switching (átutalás ↔ utánvét), line-itemized payment
  requests and the configurable (+3-day) deadline. If issuance is automated
  (Számlázz.hu's auto-előlegszámla-on-payment setting exists but is unusable
  for the full-total branch — see above), the trigger must branch on the
  payment method, possibly via per-branch invoice prefixes. AutoKassza
  pairing and its notification stay outside Vendure unless the owner asks to
  replace it.
- **Epic 6 (delivery):** the open "carrier labels" item is exactly this —
  GLS labels created and saved (not printed) per order, with a COD flag on
  utánvét orders.
- **Epic 9 (Slovakia):** the 6 000 Ft deposit is a Hungary rule; the COD
  deposit for SK, if any, is decided there.

## Epic 6 design notes (GLS labels)

The backend slice: create the fulfillment from a placed order, generate the
GLS label, store the tracking code. No site changes — everything a label
needs (the structured address, the house number in `streetLine2`, the
recipient's `fullName` and `phoneNumber`) already ships in the checkout
(2026-11-11). The only site-facing epic-6 item, the GLS parcel-shop picker,
is a separate slice with its own data-modeling question (where the selected
shop lives on the order).

### The MyGLS API (GLS Hungary's integration surface, verified 2026-11-13

from https://api.mygls.hu, doc ver. 25.12.11)

In Hungary the shipping API is the **MyGLS API**, not the group-wide
ShipIT: REST/JSON first (SOAP exists; we will not use it), at
`https://api.mygls.hu/ParcelService.svc/json/<Method>` and
`.../MasterDataService.svc/json/<Method>` (versioned method names like
`GetPrintedLabels_20251022` pin behavior). **A test environment exists**:
`https://api.test.mygls.hu/`. The same API covers SK/RO/HR/CZ/SI/RS on
their own country domains (uniform path shape, only the TLD differs) —
but a country is **not** a URL swap: each market has its own GLS contract
(ügyfélszám, API password) and its own delivery methods (names, EUR
prices, available services) existing side by side with the Hungarian ones.
Model it as **per-market carrier accounts bound to Vendure channels**
(epic 9's one-channel-per-market option): each GLS account carries its
base URL, credentials, pickup address and available services; the GLS
fulfillment handler resolves the account from the order's channel, so
adding a market is configuration, not code. Accounts live in plugin
options (env-backed, box secrets — decided: a DB entity buys nothing,
since handler registration and the handler-arg options are boot-time
static, so accounts could not be added at runtime anyway; adding one is a
config entry + deploy). The handler validates its `account` arg against
the configured list at call time. The HU quirks (the full shipper address
transmitted per call) become properties of the HU account.

- **Auth — no API keys, no OAuth:** every request body carries `Username`
  (the MyGLS e-mail), `Password` (the SHA-512 hash of the password, as a
  byte array) and an optional `WebshopEngine` tag; the client number rides
  on each parcel. **Wire format verified against the test endpoint
  (2026-11-13):** in JSON the password hash is a _JSON number array_ of the
  64 bytes (base64 is only the XML format — the server's own deserializer
  rejects base64 in JSON); the endpoint answered a well-formed JSON error
  envelope. GLS's published sample credentials no longer authenticate
  ("Unauthorized."), so a real account is needed. GLS issues a dedicated
  API username/password + ügyfélszám for the MyGLS account — requested
  from GLS Hungary customer service (connect@gls-hungary.com,
  06-29-88-66-88) — or the existing MyGLS web login may work; the
  read-only `GetParcelStatuses` call against the test environment decides
  it with zero side effects. Off-repo onboarding step; the credentials
  become box secrets, never CI variables.
- **Label creation:** `PrintLabels` (one step) or `PrepareLabels` +
  `GetPrintedLabels`; the response is the **label PDF as a byte array**
  (`TypeOfPrinter`: `A4_2x2`/`A4_4x1` for A4 sheets, Thermo/ZPL variants
  for label printers; `HidePhoneNumberOnLabels` optional). Exactly the
  "save without printing" flow.
- **Utánvét:** the `COD` service code plus the parcel fields `CODAmount`,
  `CODReference` ("used for payment pairing" — the AutoKassza-friendly
  hook) and `CODCurrency`. `ModifyCOD` can change the amount after
  creation.
- **Tracking:** `GetParcelStatuses`/`GetParcelListStatuses` (polling, with
  `LanguageIsoCode`); GLS status codes include 5 = delivered,
  16 = not delivered (no cash), 23 = returned to sender — the delivered
  event feeds epic 7's settle-on-delivery leg.
- **Weights are not mandatory by default:** parcel properties (weight,
  dimensions, packaging) are optional except for Serbia and
  client-number-dependent cases. If GLS requires weights for the owner's
  client number, they get modeled like pricing: base weight per product +
  per-field additional weights in the canonical definition.
- **Parcel identity:** `ClientReference` (strongly recommended) carries our
  order code; the response's `PrintDataInfoList` returns the API's parcel
  ID and routing data (pickup PIN since 2025-10).
- GLS ships reference SDKs (C#/PHP/Java) "as reference examples" and asks
  production integrations to implement their own client — we write a small
  typed TS client in the backend against the JSON API.

Practical mapping: fulfillment created → `PrintLabels` with the order's
address (+ COD when utánvét, amount = total − deposit) → the tracking
number goes onto the fulfillment's native `trackingCode` and the PDF is
stored → a worker polls `GetParcelStatuses` and fires the delivered event
that epic 7's settle-on-delivery leg listens to. MyGLS (the web UI) stays
the manual fallback until the credentials exist. **No hooks exist:** the
API has no webhooks/callbacks — polling is the only tracking mechanism —
and no COD payout/settlement surface at all. GLS status 5 (delivered) is
therefore only a proxy for the COD money; the money-confirmed signal
stays bank-side: AutoKassza pairs the bank statement line via the
parcel's `CODReference`, and `PaymentSettled` happens on that, not on
delivery. The shipped→delivered update is automatic (the polling worker
transitions the fulfillment and then the order — `FulfillmentService.
transitionToState` does not move the order itself) under one rule:
**deliver only when the order's payments cover the total.** Prepaid
orders deliver on status 5; COD orders hold in `Shipped` until the COD
payment is recorded (`Shipped → Modifying → PaymentSettled`), because the
order's `Delivered` state can only transition to `Cancelled` — delivering
an unsettled COD order would dead-end it. This makes `Delivered` an
invariant: fully paid and physically delivered.

**Test mode (Stripe-style, per account `mode`: `test`/`live`/`fake`).**
The plugin's service depends on a narrow `GlsClient` interface.
`live` (`api.mygls.hu`) is prod only. `test` (`api.test.mygls.hu`) is the
intended developer surface — the doc's country table lists it for
"testing and development" and the published samples run against it — but
accounts must be provisioned on it by GLS (the owner's web credentials
get `Unauthorized.` there; the doc offers no self-serve path, only
"contact your local GLS representative"). Once provisioned, `test` is the
default for local dev and previews: real HTTP, real contract, no real
parcels, no COD money. The in-process **fake** exists only where the
testing rules demand it: unit tests of pure logic and the CI
backend-integration suite (network-free, no GLS secrets in CI) — and as
the interim until test-env access exists. Absent credentials default to
`fake` with a loud log line; prod fails to boot if its credentials are
missing. The only other real-network check is a hand-run smoke script
gated behind `GLS_SMOKE_API_URL` (read-only calls), like the catalog
contract test's env gating. A live label creates a real parcel
(`DeleteLabels` cleans up). **The epic's done-condition includes a manual
live verification, run by the owner:** one real label created through the
finished plugin's path, checked in MyGLS, then deleted — development
itself never touches the live API, so without this step nothing proves
her contract issues labels with the services and COD behavior she needs.

**Credential check (done 2026-11-13, read-only):** the MyGLS **web
credentials (email + password) authenticate on the live API** —
`GetParcelStatuses` returned the account-scoped `ErrorCode: 5 "Access
denied for this parcel ID"`, not `Unauthorized.` — so no separate API
credential set is needed. The account id (`100021942`, 9-digit like the
doc's sample) rides per-parcel as `ClientNumber`; it is not part of
authentication. The test env rejects the web login, so test-env access
goes into the GLS email. Wire format confirmed: the JSON password is the
SHA-512 digest as a 64-number array (base64 only in XML mode; the
server's deserializer rejects base64 in JSON), dates are WCF
`\/Date(ms)\/` strings.

**Open questions (design time):** which `TypeOfPrinter` the owner wants
(A4 PDF vs thermal), the COD max in her contract, whether her client
number requires weights, test-environment credentials.

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
