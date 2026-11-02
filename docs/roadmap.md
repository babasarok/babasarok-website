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
   per-product discounts are dropped by owner decision, see epic 2 status). Existing Tina product content is test data for
   the temporary preview seed and the completeness yardstick; **trimming
   content files for schema validity is allowed** (both products and
   materials, minimal frontmatter edits — site code/tooling stays untouched).
4. **Length-based pricing is a hard requirement.** It is only phased out if it
   proves to be a really big problem — ADR 0010 shows it fits natively
   (OrderLine length + per-material per-cm prices), including un-splitting the
   rácsvédő products.
5. **Native Vendure as much as possible** unless product-management UX
   genuinely suffers (the structured model exists exactly because the stock
   variant editor cannot express this catalog).
6. **The seed machinery is temporary and preview-only.** Prod migration at
   cutover is a hand-migration run directly from the repo.
7. **Embroidery per-word stays a special case** (a priced input field kind,
   never a variant axis).

## Epics

| #   | Epic                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | **Deploy Vendure, use it exactly how we used web3forms** — self-hosted backend receiving order requests, nothing more                                                                                                                                                                                                                                                                                                                                              | done        |
| 2   | **Implement the product catalog fully in Vendure with a good, manageable admin UX — this epic.** Includes set discounts. The delivery plan lives in [ADR 0010](adr/0010-native-generated-product-model.md) (product model: native-with-generation; dashboard configurator, facets/collections, promotions, set discounts) with the migration architecture in [ADR 0009](adr/0009-side-by-side-vendure-catalog-migration.md). Materials are already ported (PR #76) | in progress |
| 3   | **Move the Astro site over to Vendure** — show products from Vendure, place orders the new way against the epic-2 order-line fields and server pricing (quote/order handover)                                                                                                                                                                                                                                                                                      | not started |
| 4   | **Remove the product Tina backend** — delete the product collections and their tooling once the site no longer reads them                                                                                                                                                                                                                                                                                                                                          | not started |
| 5   | **Order resolution management** — the owner works orders in the Vendure dashboard: manual order-line stage changes (paid, order sent, fulfilled, …). Drives the later steps                                                                                                                                                                                                                                                                                        | not started |
| 6   | **Native delivery methods** — replace the email/request-era delivery handling with Vendure-native shipping                                                                                                                                                                                                                                                                                                                                                         | not started |
| 7   | **Barion payment provider on the site** — including proper tax setup and invoicing integration to the Hungarian tax entity (NAV). Tax note: the channel is `pricesIncludeTax` (stored prices are gross — `ChannelSetupPlugin`); this step adds the 27% HU `TaxRate` so invoices show the extracted ÁFA without changing any stored price                                                                                                                           | not started |
| 8   | **English translation of the site**                                                                                                                                                                                                                                                                                                                                                                                                                                | not started |
| 9   | **Expand to Slovakia** — accept orders from Slovakia (delivery, tax, translations as needed)                                                                                                                                                                                                                                                                                                                                                                       | not started |

## Post-cutover follow-ups

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
  detection, migration, admin API; seed 33/33 products / 11/11 materials —
  PR #77; previews now import a curated 7-product subset covering every
  implemented feature, so deploys fit Cloudflare's 30-minute limit — see
  `backend/scripts/import-products.ts`). Known issue feeding the dashboard
  step: sync runs ~1.5–3 variants/s inside Vendure's
  `ProductVariantService.create` (on the shared box, observed ~1/s with the
  whole matrix buffered in one uncommitted transaction — no observable
  progress for 20+ min on the 1344-variant product); big matrices need
  minutes, so dashboard saves must go async (job queue)
- ✅ Dashboard production pass (async job-queue sync — 576-variant save
  returns in ~130ms with background convergence; configurator page block on
  the stock product page; creation folded into the stock products list
  action bar, standalone section removed; UI review pass fixed a real
  data-loss bug in save; dashboard e2e 4 specs green — PR #77). Polish pass
  closed the four spike leftovers: the configurator block spans the full
  page width (dashboard-native `column: "full"`), the stock variants
  grid / generate-variants prompt / option-group editor hide on generated
  products (the generated flag rides the stock page's own extended query —
  no `pnpm patch` needed), drift details are listed under the stale badge,
  and zod validation messages are localized to Hungarian
- ✅ Facets + Collections — material/color facet values on generated variants,
  auto-managed per-material collections, and event-driven re-sync of affected
  products on material (create/rename/color/delete) changes; facets and
  collections live in the stock dashboard, `convergeMaterialFacets` /
  `pnpm -C backend run converge-facets` converges pre-facet databases
- ✅ Server-side pricing + promotions — a custom `OrderItemPriceCalculationStrategy`
  prices length/embroidery from order-line custom fields (`lengthCm`,
  `selections`), with an order interceptor rejecting unpriceable lines (no
  0 Ft lines); the szett discount is a Vendure Promotion (custom condition +
  order action) whose argless condition reads the private "Szettek"
  collection's children — groups are private Collections (members via the
  native `product-id-filter`, the set discount a `setDiscount` custom field
  edited in the stock dashboard); the seed upserts the collections and the
  promotion idempotently. The backend keeps its own
  copy of the pricing logic; `src/lib/pricing` is untouched until cutover
  (supersedes the price-authority part of issue #71). Per-product %
  discounts are dropped (owner decision: unused); they get no Vendure home
- ✅ Display fields — `shortDescription`, `tagline` (the Tina `categories`),
  `date` and `icon` as `Product` custom fields and gallery descriptions as an
  `Asset` custom field, editable in the stock dashboard and populated by the
  preview seed ([ADR 0010](adr/0010-native-generated-product-model.md))
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
  `import-facets` seeds both
- ✅ Translatable catalog text — material/color labels, subtitle and
  description are Vendure translation entities and definition text is a
  `LocalizedText` (`hu` required, others optional, hu fallback), edited in the
  dashboard's content language; generated options, variants and mirrored
  facet values carry every language
  ([ADR 0011](adr/0011-native-ownership-and-translatable-catalog.md)
  decision 6)
- ⬜ Vendure-complete gate — catalog fully manageable in the Vendure dashboard,
  nothing left that only Tina can do
- ⬜ Hardening follow-ups (from the epic 2 branch review): an order line whose
  definition changed after it was added (made non-orderable, option removed)
  fails every recalculation until removed — price or flag it instead; the variant sync runs the whole matrix in one transaction —
  commit per batch; `ConfiguredOrderLineInterceptor`, `ServerPricingStrategy`
  and the set condition's group parsing have no tests

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
