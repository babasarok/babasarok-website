# ADR 0011 — Native ownership of product identity, type and thread colors; translatable catalog text

Status: accepted

Decision 6 is implemented. `MaterialColor` gained a surrogate `id` (unique per
material + color code) in place of its composite primary key, because
`TranslatableSaver` and `Translation<T>` require a single `id` on the
translatable entity.

## Context

A review of epic 2 against "the Vendure way" (owner maintainability first)
found places where the canonical definition or Tina still owns data that a
native Vendure surface already edits better, plus two correctness gaps:

1. The definition owns the product's name and slug (`definition.label`,
   `definition.id`); the sync overwrites the stock product form's Name/Slug,
   so an owner rename in the obvious place is silently reverted, and the name
   is Hungarian-only.
2. The product type is a hard-coded enum in `packages/product-definition`
   (`PRODUCT_TYPE_VALUES`); a new type needs a deploy.
3. The embroidery thread-color palette lives only in Tina
   (`src/content/config/embroidery.json`); Vendure cannot validate an
   embroidery line's thread color, and Tina would outlive the cutover.
4. Deleting a generated product from the stock product list orphans its
   definition (the next sync throws).
5. `orderable: false` is not enforced on order lines.
6. All owner-entered catalog text (definition labels/tooltips/placeholders,
   option labels, material and color labels) is single-language; epic 8
   needs English.

## Decisions

### 1. The native Product owns its name and slug

- `ProductDefinitionSchema` drops `label`. `id` stays the immutable business
  key (materials, groups and order lines reference it); it seeds the slug on
  creation only.
- The configurator's create flow asks for the name, creates the native
  Product with it, then stores the definition. After creation the sync never
  writes Product name/slug; name/slug leave the drift hash.
- Generated variant names read the native Product's name per language
  (`"<product name> (<option values>)"`). A `ProductEvent` "updated" for a
  generated product enqueues its sync so variant names follow a rename.
- The configurator stops showing a label field; the stock form's Name/Slug
  (translatable, with the content-language selector) are the only place to
  edit them.
- Migration: a data migration moves nothing (the native names already equal
  the labels); the definition JSON drops `label` via the canonical schema
  (strict object — existing rows are rewritten by a one-off migration that
  deletes the key).

### 2. Product type is a native Facet

- A public Facet `babasarok-product-type` ("Terméktípus"), one FacetValue
  per type, assigned on the stock product page's Facet Values block (product
  level, not variants). The owner adds types in the stock Facets page.
- `type` leaves `ProductDefinitionSchema` and the configurator; the site's
  copy (`src/lib/product/productTypes.ts`) stays until cutover, which then
  reads the facet.
- The seed (and the prod hand-migration) creates the facet with the seven
  current values (codes = today's enum values, names = today's labels) and
  assigns each product its value.
- Owner-maintained, not sync-generated: the type is editorial, unlike the
  material/color facets.

### 3. Thread colors are a private native Facet

- A private Facet `babasarok-thread-color` ("Cérna színek"); one FacetValue
  per color: code = Tina `color_id`, name (translatable) = label.
- FacetValue custom fields `hex` (string, `validate`: `#rrggbb`, nullable) and
  `swatch` (relation → Asset, nullable). The storefront prefers the swatch,
  else the hex. "Exactly one" cannot be expressed per field; a value with
  neither is reported by the converge/seed script and rendered as a neutral
  chip.
- Edited on the stock facet-value page (custom fields render there natively:
  `@vendure/dashboard/src/app/routes/_authenticated/_facets/facets_.$facetId.values_.$id.tsx`).
- The order-line interceptor rejects an embroidery selection whose `colorId`
  is not a value code of this facet.
- `ThreadColorPaletteSchema` in the package is retired; the seed maps
  `embroidery.json` onto the facet.

### 4. Stock deletes of generated products cascade

- The product plugin subscribes to `ProductEvent` "deleted": if a definition
  references that native product, the definition is deleted in the same
  flow. Deleting from the configurator stays as is.

### 5. Non-orderable products cannot be ordered

- `ConfiguredOrderLineInterceptor` rejects adding or adjusting a line whose
  product's definition has `orderable: false` (clear `OrderInterceptorError`);
  the pricing strategy throws as the backstop, same pattern as the missing
  length guard.

### 6. Owner-entered catalog text is translatable

- **Materials and colors** use Vendure's translatable-entity pattern:
  `MaterialTranslation` (label, subtitle, description) and
  `MaterialColorTranslation` (label), saved through `TranslatableSaver`, read
  through `TranslatorService` for the request language. The materials page
  edits the current content language (the dashboard's content-language
  selector), like stock pages. Facet values mirrored from materials/colors
  get every translation.
- **Definition text** (field labels, tooltips, placeholders, suggestion
  labels, choice option labels): a `LocalizedText` schema — an object keyed
  by language code with `hu` required (the default channel language), other
  languages optional; resolution falls back to `hu`. The configurator edits
  the content-language selected in the dashboard and shows the `hu` value as
  a placeholder for untranslated fields.
- Generated option groups/options are written with one translation per
  language present in the definition/material translations.
- Migration: one data migration wraps every existing string as `{ hu: … }`
  in definitions and moves material/color labels into the translation tables.

## Consequences

- The owner edits names, slugs, types and thread colors on stock pages; the
  configurator only holds what stock Vendure cannot express.
- Epic 8 becomes "fill in English" rather than a schema change.
- The canonical package changes shape (`label`, `type` removed; text fields
  become `LocalizedText`); the seed adapters and every consumer follow.
- Tina loses its last catalog role (embroidery palette) at cutover.

## Order of work

4 and 5 (small, independent) → 1 → 2 and 3 (parallel) → 6 (touches every
text field; done last so it migrates the final shape once).
