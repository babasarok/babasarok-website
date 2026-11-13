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
| 5   | **Order resolution management** — the owner works orders in the Vendure dashboard: manual state changes and notes are good enough for tracking. Automated order-state tracking folds into epic 7's payment integration. See [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7)                                                                                                                                                                                                                                                                                                                                                                                                        | done (manual tracking; automation is epic 7)                                                                                                                                                                                                                                                                                                                                               |
| 6   | **Native delivery methods** — replace the email/request-era delivery handling with Vendure-native shipping; the checkout address becomes structured (native shipping-address columns: postcode, city, street, country — carrier labels need them)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | in progress (2026-11-11: the checkout is a multi-step wizard with the structured address, the house number in streetLine2; open: the GLS parcel-shop picker, carrier labels — see [ADR 0018](adr/0018-gls-labels-via-mygls-api.md))                                                                                                                                                        |
| 7   | **Barion payment provider on the site** — including proper tax setup and invoicing integration to the Hungarian tax entity (NAV) — the invoicing flow it must support is recorded in [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7). Tax note: the channel is `pricesIncludeTax` (stored prices are gross — `ChannelSetupPlugin`); this step adds the 27% HU `TaxRate` so invoices show the extracted ÁFA without changing any stored price. Checkout gains an optional separate billing address ("differs from delivery") with company name and tax number, stored as the order's native billing address (`setOrderBillingAddress`) and reusing epic 6's structured address form | in progress (2026-11-11: the Számlázás step, the billing address and the taxNumber order field shipped; open: Barion (incl. the order-state design it forces — see [Owner post-order flow](#owner-post-order-flow-epics-5-6-and-7)), tax, NAV invoicing, payment-method selection, Meta purchase-tracking handle — see [Epic 7 design notes](#epic-7-design-notes-meta-purchase-tracking)) |
| 8   | **English translation of the site**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | done (ADR 0015)                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | **Expand to Slovakia** — accept orders from Slovakia (delivery, tax, translations as needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | not started                                                                                                                                                                                                                                                                                                                                                                                |

## Epic 3 plan (site cutover)

Done (2026-11-07): the site reads the Vendure catalog at request time
([ADR 0012](adr/0012-site-reads-vendure-at-request-time.md)), orders go
through the native order flow ([ADR
0013](adr/0013-checkout-on-the-native-vendure-order-flow.md), the
order-basket and order-submission specs), the catalog pages became static
shells ([ADR 0017](adr/0017-static-catalog-shells.md)), and the
`[placeholder]` products are retired. Slice history lives in the PRs.

## Post-cutover follow-ups

- ✅ **Legacy path removal** (2026-11-06) — the quote-order plugin and
  its mutation are gone; the behavior lives in the order-submission spec's
  "Legacy orders".
- ✅ **Legacy snapshot fields consolidated** (2026-11-12) — archived into
  private order notes, columns dropped (`archive-legacy-order-snapshots`).
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

Done — the catalog is fully native: materials (PR #76), the canonical
definition + core + dashboard configurator (PR #77), server-side pricing
with the szett promotions (ADR 0014), display fields, native
name/slug/type/thread-color ownership and translatable text (ADR 0011).
The behavior lives in the [product-catalog
spec](specs/product-catalog.md) and ADRs 0010–0014 and 0016; per-product
% discounts are dropped (owner decision). Still open: **resume without
redoing work** (staged disabled-variant build, `spike/sync-resume`) —
revisit after real use; the bulk-writer sync made full syncs take
seconds, so this matters much less.

## ADR 0016 plan (one variant per configurable product)

Done in PR #108 (both migrations rehearsed on a production copy); the
decision and rationale live in
[ADR 0016](adr/0016-one-variant-per-configurable-product.md). Nothing
remains of the old way; the ESLint rule (`eslint/variant-option-reads.ts`)
blocks reading a variant's options again.

## Epic 8 plan (English / multi-language)

Done. The architecture lives in
[ADR 0015](adr/0015-multi-language-site-architecture.md) (routing, Tina
content and backend language plumbing, the translatable catalog text of
ADR 0011); the site's UI strings and the buyer-visible server refusals
(coded values, worded per locale) live in the locale dictionaries and the
order-basket/order-submission specs. Prices stay HUF for English — EUR is
epic 9's scope; do not couple the two epics.

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

The owner's workflow after an order (árajánlat) comes in, recorded
2026-11-13 from the owner. Done manually today (Számlázz.hu, MyGLS,
AutoKassza); it branches on the payment method chosen at checkout:

**Előre utalás:** a díjbekérő for the full total, itemized per order
line, in Számlázz.hu → AutoKassza pairs the bank transfer and notifies
the owner → the számla (final invoice) is issued from the paid díjbekérő
→ the GLS label is created in MyGLS and saved unprinted, so the delivery
data is ready when the product is done (personal pickup: same flow
without a label).

**Utánvét:** a díjbekérő fixed at 6 000 Ft (Hungary) — the előleg
(deposit) → AutoKassza pairs; the előlegszámla (deposit invoice) is
issued for the 6 000 Ft → the GLS label is saved flagged as utánvét; the
courier collects the total minus the deposit → when the product/set is
finished, the végszámla (final invoice) is issued with the deposit set
off — Számlázz.hu puts the deposit among the line items automatically and
the payment method switches to utánvét. Every díjbekérő and invoice
carries a +3-day payment deadline.

Invoice issuance stays manual because Számlázz.hu's auto-előlegszámla
setting is per-account, not per-branch; any automation must branch on the
payment method (invoice prefixes are the suspected mechanism).

Implications: **epic 5** is done as manual tracking — the owner works orders in the dashboard with state changes and notes; the automated state design (payment at placement — full, or the 6 000 Ft deposit on utánvét — giving the order a state that can progress to delivery) folds into **epic 7**'s payment integration; bank transfer stays a first-class branch (the owner records the payment in the dashboard). **Epic 7** must support the three invoice kinds with deposit set-off, payment-method switching and the branch-aware trigger; AutoKassza stays outside Vendure. **Epic 6**'s carrier labels: [ADR 0018](adr/0018-gls-labels-via-mygls-api.md). **Epic 9** decides the SK deposit rule separately.

## Epic 6 (GLS labels) plan

Decision: [ADR 0018](adr/0018-gls-labels-via-mygls-api.md) (proposed) —
the MyGLS API (REST/JSON) behind a full plugin at
`backend/src/plugins/gls/`: env-backed accounts, one fulfillment handler
that creates the label and the COD fields, and a polling worker that
drives shipped → delivered (only when the payments cover the total).
Slices S1–S5 and the open questions live in the ADR; the done-condition
is the owner-run live verification. No site changes; the GLS parcel-shop
picker stays a separate slice.

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
