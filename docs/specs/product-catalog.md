# Product catalog

Catalogue of handmade baby products that buyers can browse. Products are managed
as CMS content, each optionally carrying configurable fields (options,
embroidery, material picks), and are listed on a single searchable,
filterable product list with a detail page per product.

> **Transition note (ADR 0009/0010).** During the Vendure migration the
> commerce model above is owned by the canonical product definition stored in
> Vendure: `product_id` ↔ the definition's `id` (the native product's
> `productId`), `can_be_ordered` ↔ `orderable`, field kinds map to `input`,
> `choice` (presentation `select`/`radio`/`color`), `toggle`, `material` and
> `embroidery`, and `banned_combinations` ↔ `forbiddenMaterialCombinations`.
> The native Product owns its name and slug (ADR 0011 decision 1): the
> preview seed writes the Tina `title` into the native product's name, the
> slug is seeded from the definition's `id` at creation only (the preview seed
> then sets it to the Tina content file name, the current site URL — 8 of 33
> differ from the product id), and the definition sync never writes the
> product's name or slug. Generated variant names list
> the labelled field values ("`Anyag: Pamut · Méret: Nagy · Masni`"): a toggle
> shows its bare label when on and is omitted when off; a variant with nothing
> to list carries the product's name, so a rename on the stock product form
> propagates to those variants; a stock product save re-syncs only when such
> a variant exists. The product type is a value of the public
> `babasarok-product-type` facet on the native product (ADR 0011 decision 2),
> not a definition field. Editorial content still maps to the native product
> at cutover: body → `description`, `thumbnail` → featured asset, `images` →
> assets. The remaining display fields are native Vendure custom fields (the
> display-field
> gap of ADR 0010, resolved): `shortDescription`, `tagline` (the Tina
> `categories` "Alcím"), `date` ("newest first" sorting), `popularityRank` (nullable int, 1 = most
> popular; the curated "Népszerű" sort, unranked products after ranked ones)
> and `icon` (an Asset relation) on `Product`, plus a `galleryDescription` custom field on `Asset`
> for the per-image gallery text — all editable in the stock dashboard, and
> the preview seed populates them from Tina content (thumbnails and gallery
> images upload as real assets). They stay outside the canonical
> configurator model. "Configurator" in this spec means the
> buyer-facing order form; the admin-side editor is the dashboard's product
> configurator editor.

## Requirements

### Product content model

The system SHALL model each product as CMS content carrying at least: an
identifier (`product_id`), title, a single product type drawn from a fixed
set of classification values, a tagline (free-text subtitle), short
description, body content, images (thumbnail plus optional gallery entries
with descriptions), a base price, and a `can_be_ordered` flag.

- **Scenario: Product with configurable options**
  - WHEN a product defines configurable fields (radios, selects, toggles,
    colors, free inputs, embroidery) with per-option prices
  - THEN the product's shape includes those fields with their labels, types,
    options and prices so the order form can render and price them
- **Scenario: Product with material fields**
  - WHEN a product requires materials
  - THEN the product's shape includes `material` fields, each carrying its own
    label, colour count, and its own set of available material choices (with
    per-choice prices), so the order form can collect one material (and its
    colors) per field; any forbidden cross-field material combinations are
    listed at the product level

### Product list: search, filtering, and sorting

The system SHALL provide a single product list page showing all non-hidden
products (no pagination), each entry linking to the product detail page, with
its tagline as the category line. A product is hidden when its canonical
definition sets `hiddenInProductList`; a product without a known type is
listed and only drops out of type filters. A product without a definition
(e.g. a quote-order placeholder) is not a storefront product: it appears in no
list, search, sitemap or home block, and its detail page is a 404. The page is
rendered on demand and cached at the edge (60 s, 300 s stale-while-revalidate),
and an unreachable backend shows the error page instead of partial data. With:

- **Text search** over product title and short description.
- **Filtering by product type**: multiple selections within the type
  dimension are OR-combined.
- **Filtering by product set**: a product matches the set filter when it is
  a member of a selected set; multiple set selections are OR-combined.
- **Sorting**: by the `popularityRank` order (default), newest first,
  or by name (title, ascending). Products without a curated popularity
  position follow the ordered ones, name-ascending among themselves.

The active search text, selected types, selected sets, and sort order SHALL
be expressed in URL query parameters; the page SHALL apply them on load and
update them as the visitor changes the view, so any filtered view is
shareable. Dimensions are AND-combined with each other and with the search
text. When no product matches, the list SHALL show an empty state with a way
to clear the filters. When JavaScript is unavailable, the page SHALL render
the full product list (in the default popularity order) with search,
filtering, and sorting inert.

- **Scenario: Browsing the catalogue**
  - WHEN a visitor opens the product list
  - THEN they see all non-hidden products in the curated popularity order,
    without pagination
- **Scenario: Text search**
  - WHEN a visitor types a search term
  - THEN the list narrows to products whose title or short description
    matches, without a page reload
- **Scenario: Filtering by type**
  - WHEN a visitor selects one or more product types
  - THEN the list shows only products of the selected types, combined with
    any other active dimension
- **Scenario: Filtering by set**
  - WHEN a visitor selects a product set
  - THEN the list shows only the member products of the selected sets
- **Scenario: Sorting by popularity**
  - WHEN a visitor opens the product list without an explicit sort parameter,
    or selects popularity sorting
  - THEN the list is ordered by ascending `popularityRank`, with unranked
    products following it, alphabetically
- **Scenario: Sorting by name**
  - WHEN a visitor selects name sorting
  - THEN the list is ordered alphabetically by title, ascending
- **Scenario: Deep link to a filtered view**
  - WHEN a visitor opens a product list URL carrying search, filter, or sort
    parameters
  - THEN the list is displayed with those already applied
- **Scenario: No matching products**
  - WHEN no product matches the active search and filters
  - THEN an empty state is shown with an affordance to clear the filters
- **Scenario: No JavaScript**
  - WHEN the product list is rendered without JavaScript
  - THEN the full product list is shown and search, filtering, and sorting
    are inert

### Material pages and home product block

The material list is one on-demand page (no pagination; the former
`/material/page/N/` URLs redirect to `/material`) of all materials ordered by
label, each linking to `/material/<slug>/`. A material page shows the label,
subtitle, thumbnail, colors, the plain-text description and previous/next
links; an unknown slug answers 404 uncached. The home page's product block is
a server island showing the `itemCount` (from `product.json`) most popular
listed products; its title and button stay prerendered. Catalog images come
from the asset server's presets as webp (`card-sm`, `card-lg`, `hero-sm`,
`hero-md`, `hero-lg`; plain asset URLs still serve the original, any other
preset or size is rejected).

### Catalog sitemap and search

`/sitemap-catalog.xml` (on demand, cached 1 h; 503 when the backend is
unreachable, never an empty sitemap) lists the product and material detail
pages and is referenced from `/sitemap-index.xml`. The header search dialog
merges Pagefind results (blog, static pages) with matches from
`/search-index.json` (on demand, cached 60 s: listed products and materials,
searched client-side ignoring case and accents), products first, then
materials; a catalog hit replaces a Pagefind hit for the same URL.

### Product detail page

The system SHALL render a detail page per product showing its title, an image
gallery (thumbnail plus gallery images with descriptions), its body content,
and sharing links to social networks. For orderable products the page SHALL
additionally embed an order configurator for that product.

- **Scenario: Viewing a product**
  - WHEN a visitor opens a product's detail page
  - THEN the page shows the gallery, the description content, and share links
    built from the product's canonical URL
- **Scenario: Viewing an orderable product**
  - WHEN a visitor opens the detail page of a product that can be ordered
  - THEN the page embeds an order configurator for that product alongside the
    gallery

### Product configurator fields

The system SHALL support configurable product fields of the types radio,
select, toggle, color, free input, and embroidery. Fields may carry prices
(additional cost when selected/enabled; embroidery priced per word or flat),
and a field's visibility MAY depend on another field's value (`depends_on`);
fields hidden by an unmet condition MUST NOT contribute to the price or to the
order.

- **Scenario: Conditional field**
  - WHEN a field depends on another field that is not selected
  - THEN the field is not visible and does not affect the item's price or the
    submitted order
- **Scenario: Embroidery option**
  - WHEN a buyer enables an embroidery field with text and a thread color
  - THEN the embroidery contributes its price (per word or flat) to the item
    price and the text with the resolved color label appear in the order

### Product availability for ordering

The system SHALL expose only products whose `can_be_ordered` flag is set to
the ordering UI; other products are browse-only. The server enforces the flag
at order time: adding or adjusting a basket line for a browse-only product is
rejected with a clear error, and the pricing step refuses to price such a line
as the backstop (ADR 0011 decision 5).

- **Scenario: Non-orderable product**
  - WHEN a product's `can_be_ordered` flag is not set
  - THEN the product is not offered as an option in the order form
- **Scenario: Non-orderable product rejected at the basket**
  - WHEN a basket add or adjust targets a product whose `orderable` flag is
    not set
  - THEN the mutation is rejected with a clear Hungarian error naming the
    product by its native name

### Product page order configurator

The product page configurator SHALL let the buyer set the quantity, choose
field options and materials, see the live item price (including any set
discount status), add the line to the basket, and add related set members.
It SHALL surface the item's set status (active discount, pending partner,
pending material with one-click sync) per the product-sets capability.

- **Scenario: Adding to the basket from the product page**
  - WHEN a buyer configures a product on its page and adds it
  - THEN the basket gains the line and the nav basket reflects the new count
- **Scenario: Adding a related set member**
  - WHEN a buyer is configuring a set member and another member of the same
    set is suggested
  - THEN the buyer can add the related member without leaving the page

### Product page deep links

The product page configurator SHALL support prefilling a new line from URL
query parameters: quantity (`count`), and field values keyed by field name
(including embroidery enablement and thread color, and material field
selections with their `<name>_colors` companion). Prefilled values SHALL be
validated against the product's options like normal selections.

- **Scenario: Deep link with preselected options**
  - WHEN a visitor opens a product page whose URL query prefills options and
    materials
  - THEN the configurator starts with those selections and the computed price
- **Scenario: Unknown or invalid prefilled values**
  - WHEN a query parameter references an unknown field, option, or material
  - THEN it is ignored and the configurator starts unselected for that part

### Facets and collections (Vendure catalog)

> Transition note (ADR 0010 delivery step 4). The Vendure-native catalog
> owns browsing facets and collections. Colors are order-line selections,
> not variant axes — the Color facet describes the colors a variant can be
> ordered in, derived from the variant's chosen materials.

The Vendure catalog SHALL expose two sync-owned facets on generated product
variants: **Anyag** (`babasarok-material`, one value per material, code =
material slug) and **Szín** (`babasarok-color`, one value per
material-color, code = `<material-slug>--<color-id>`). Facet value names
follow the material/color labels.

Every generated variant SHALL carry the facet values of the materials its
configuration picks, plus every color facet value of those materials. The
facet assignment is part of the definition sync: native-side facet edits
count as drift and are overwritten by the next sync.

Material writes SHALL propagate automatically, without a definition save:

- **Scenario: Material created or renamed**
  - WHEN a material is created or its label changes
  - THEN its facet values and the per-material collection follow (created or
    renamed to the material's label)
- **Scenario: Material colors change**
  - WHEN colors are added to, renamed on, or removed from a material
  - THEN the material's color facet values follow, and every product
    definition referencing the material re-syncs, so its variants carry the
    correct color facets
- **Scenario: Material edit the sync does not read**
  - WHEN a material update leaves its label and its colors' ids and labels
    unchanged (e.g. only the description or images change)
  - THEN no product definition re-syncs
- **Scenario: Automatic sync meets native edits**
  - WHEN a sync triggered by a material change or a stock product rename
    (not by a definition save) finds the native options, variants or prices
    edited outside the sync
  - THEN it writes nothing and marks the definition's sync failed with the
    drift message; stock product updates that carry no name never trigger a
    sync, and an automatic sync whose plan already equals the native state
    writes nothing
- **Scenario: Material deleted**
  - WHEN a material that no definition references is deleted
  - THEN its facet values and its collection are deleted with it

For every material the catalog SHALL maintain an auto-managed collection
(slug `material-<material-slug>`, named after the material) containing the
variants that carry that material's facet value (facet-value filter,
containsAny). Its filter is written at creation and not overwritten
afterwards; renames propagate, manual content edits are the owner's.

Convergence for databases that predate the facet sync SHALL be idempotent
and re-run safe: the `convergeMaterialFacets` admin mutation (or
`pnpm -C backend run converge-facets` against a running server + worker)
brings every material's facet values and collection in line and re-syncs
every referencing product. A missing facet value fails a product sync with a
clear error pointing at the convergence step, rather than silently creating
or skipping.

- **Scenario: Facet value missing at sync time**
  - WHEN a product sync cannot resolve a facet value it should assign
  - THEN the sync fails with an error naming the value and the convergence
    step, and the dashboard shows the failed sync state

### Owner-maintained facets (product type, thread colors)

The Vendure catalog SHALL carry two facets the owner maintains on stock
dashboard pages (ADR 0011 decisions 2 and 3); no sync writes them.

- **Terméktípus** (`babasarok-product-type`, public): one value per product
  type, code = the type id (`racsvedo`, `takaro`, `lepedo`, `parna`,
  `babafeszek`, `zsak`, `kiegeszito`). A product's type is its value on the
  stock product page's Facet Values block (product level, not variants);
  new types are added on the stock Facets page without a deploy. The
  canonical definition carries no `type`.
- **Cérna színek** (`babasarok-thread-color`, private): one value per
  embroidery thread color, code = the color id, name (translatable) = label.
  Each value has the custom fields `hex` (nullable, `#rrggbb`) and `swatch`
  (nullable Asset relation), edited on the stock facet-value page. A value
  with neither is rendered as a neutral chip and reported by the seed.

The seed (`import-facets`, then `import-products` for the assignment) creates
both facets idempotently from the Tina `type` values and
`src/content/config/embroidery.json`; existing facets/values are left as the
owner edited them. Production runs the same scripts once by hand.

- **Scenario: Owner adds a product type**
  - WHEN the owner creates a value in the product-type facet
  - THEN it can be assigned to products on the stock product page, with no
    deploy

### Translatable catalog text

Owner-entered catalog text SHALL be translatable (ADR 0011 decision 6):

- Material and color text (label, subtitle, description; color label) is
  stored per language in Vendure translation entities. The materials page
  edits the dashboard's current content language and shows the Hungarian text
  as the placeholder for an untranslated field. A material needs a Hungarian
  label; other languages are optional.
- Definition text (field labels, tooltips, placeholders, suggestion labels,
  choice option labels) is a `LocalizedText`: an object keyed by language code
  with `hu` required and other languages optional. Ids, codes and patterns are
  not text. The configurator edits the current content language and shows the
  Hungarian text as the placeholder; saving a definition without `hu` is
  rejected.
- Generated option groups, options and variants, and the facet values and
  per-material collections mirrored from materials, are written with one
  translation per language present. A variant's name uses the native
  product's name in that language.
- Server messages that name a definition field or option use the request
  language.

- **Scenario: Untranslated text falls back to Hungarian**
  - WHEN text is resolved for a language that has no entry for it
  - THEN the Hungarian text is used
- **Scenario: Editing a non-default content language**
  - WHEN the owner switches the content language to English and edits a field
    label
  - THEN only the English entry changes, the Hungarian text shows as the
    placeholder while English is empty, and clearing the English entry
    removes it
- **Scenario: Material translated**
  - WHEN a material is saved with an English label
  - THEN its material facet value, its collection and its generated option
    carry the English name next to the Hungarian one

### Definition lifecycle with the native product

The system SHALL delete a product's canonical definition when the native
product behind it is deleted through the stock product list or the API
(ADR 0011 decision 4), so no orphan definition remains whose next sync would
fail. Deleting through the configurator keeps removing both.

- **Scenario: Stock delete of a generated product**
  - WHEN the native product a definition generated is deleted in the stock
    dashboard or via the API
  - THEN the definition is deleted with it, in the same flow
- **Scenario: Configurator delete**
  - WHEN a product is deleted through the configurator
  - THEN both the definition and the native product are removed, as before

### Single save on the product page

The stock product page's action bar SHALL carry one Update button for a
generated product, replacing the stock one (the Enabled switch is kept). It
saves the page form (name, slug, description, enabled …) when that is dirty
and valid, and the configurator editor when it has unsaved changes; each
shows its own errors, and one failing does not stop the other. The
configurator block has no save button of its own (delete, the sync status and
the drift-conflict force-save remain); on a non-generated product the button
behaves as the stock one. Navigating away or reloading with unsaved
configurator changes asks for confirmation, like the stock form does.

- **Scenario: Rename and configurator edit**
  - WHEN a generated product's name and a configurator field are both
    edited and Update is clicked once
  - THEN both are persisted and the sync starts
- **Scenario: Nothing changed**
  - WHEN neither the page form nor the configurator has changes
  - THEN the Update button is disabled
- **Scenario: Leaving with configurator changes**
  - WHEN a configurator field is edited and not saved
  - AND the user navigates away or reloads the page
  - THEN a confirmation is asked before the changes are discarded

### Variant sync progress

The system SHALL report the progress of a running variant sync as finished
out of total work units (variant creates, updates and removals), readable
while the sync's single transaction is still open. The configurator's sync
status SHALL show it next to the pending label.

- **Scenario: Running sync**
  - WHEN a sync is pending and its job has reported progress
  - THEN the configurator shows "Szinkronizálás… 340 / 1400", refreshed by its
    existing poll
- **Scenario: No progress reported yet**
  - WHEN a sync is pending but its job has not started or reported
  - THEN the configurator shows the plain pending label

### Sync recovery

The worker SHALL, on start, fail the sync jobs a previous worker left
running and re-queue every definition whose sync is pending without a queued
job. The re-queued sync restarts from zero (the interrupted transaction rolled
back) and runs as an automatic sync, so it never overwrites native drift.
This assumes a single worker. The worker's stop grace period SHALL exceed
Vendure's 20 s shutdown wait so a redeploy defers the running job.

- **Scenario: Worker killed mid-sync**
  - WHEN the worker dies while a sync runs and a worker starts again
  - THEN the leftover running job is marked failed and the definition syncs
    again without a new save
- **Scenario: Pending sync already queued**
  - WHEN a worker starts and a pending definition has a queued job
  - THEN no second job is queued

### Shop API catalog surface

The system SHALL expose, on the Vendure shop API, everything the storefront
renders for the catalog, without making private data public. The site reads it
with plain query documents validated by zod schemas (`src/lib/catalog/`), over
an injected-`fetch` transport (`src/lib/vendure/`) that sends the request
language as `?languageCode=` (currently `hu`).

- `Product.productDefinition: JSON` — the stored canonical definition
  (`null` for a native product without one), loaded once per request for all
  products of that request. The site validates it with the shared
  `@babasarok/product-definition` schema and resolves its `LocalizedText`
  with `resolveText`. Products without generated variants are still listed;
  the page decides orderability.
- `materials` / `material(slug)` — materials with request-language
  `label`/`subtitle`/`description`, thumbnail and colors (`id`, `label`,
  `hex`, `asset`).
- `productGroups` — a projection of the private "Szettek" and
  "Kapcsolódó termékek" child collections: `id` (slug), `kind` (`set` |
  `related`), `label`, `discount` (sets only) and `productIds` (definition
  ids). Groups with fewer than two known members, and sets without a positive
  discount, are omitted. The collections themselves stay private.
- `threadColors` — the values of the private thread-color facet (`id` = the
  facet value code, `label`, `hex`, `swatch`); the facet itself stays hidden
  from the shop's `facets`.
- The native `Product` custom fields (`shortDescription`, `tagline`, `date`,
  `popularityRank`, `icon`) and `Asset.galleryDescription` are public.

- **Scenario: Popularity order**
  - WHEN products are sorted by popularity
  - THEN ranked products come first by ascending `popularityRank` and
    unranked products follow in their existing order
- **Scenario: Invalid definition**
  - WHEN a response's `productDefinition` does not match the canonical schema
  - THEN the catalog read fails instead of rendering partial data

Out of scope for now: long product and material descriptions.
