# Product catalogue definition and Tina authoring plan

## Goal

Define the canonical Product catalogue with Zod, generate the Tina Product,
Material, and Product-group forms from catalogue-specific authoring registries,
and compile Tina's permissive stored shapes into one validated catalogue graph.

The result is the shared catalogue that the storefront and a future Vendure
backend can both trust. Materials compile first; Products resolve Material
references; Product groups compile last and resolve Product membership for deals
and related items. This work preserves current storefront behavior. Delivery
methods remain on their current path until Vendure replaces them.

## How to execute this plan

Implement **one numbered stage at a time**. At the start of a session, tell the
agent:

> Implement Stage N from `docs/product-definition-authoring-plan.md`. Stop when
> that stage's completion criteria pass. Do not begin the next stage.

Each stage must leave the repository type-checking and tested. Commit or review
the diff before starting the next stage. If a stage reveals that a later design
assumption is wrong, update this plan before continuing.

Existing untracked work is present under `src/product-definition/`. Preserve and
build on it; do not recreate or discard it.

## Decisions

### Zod is the canonical model

Canonical models are Zod schemas. TypeScript types are inferred with
`z.output<typeof Schema>`; there is no separately maintained interface for the
same shape.

```ts
export const MoneySchema = z.number().int().nonnegative();
export type Money = z.output<typeof MoneySchema>;
```

### Canonical and Tina source shapes are distinct

Tina v3 cannot express the canonical discriminated union. Tina stores an
editor-friendly flat superset; a codec compiles it into a canonical definition.

```text
Tina form → Tina source record → codec/compiler → ProductDefinition
```

Raw Tina records do not cross the compiler seam. Canonical modules do not import
Tina, Astro, Svelte, Vendure, generated GraphQL types, or browser globals.

### Generated Tina types define the trusted source contract

The compiler receives results directly from the generated Tina client during the
same build. Use those generated query-output types as the Tina source contract;
do not duplicate them with handwritten Zod source schemas. Validate the
compiler's constructed canonical value with the canonical Zod schema.

Every source property must have an explicit disposition so a newly generated
property causes a compile error until it is classified as canonical,
presentation-only, editor-only, or deliberately ignored. Use an exhaustive
record over the cleaned generated source type, for example:

```ts
const MATERIAL_SOURCE_FIELDS = {
  material_id: "canonical",
  label: "canonical",
  colors: "canonical",
  thumbnail: "presentation",
  categories: "presentation",
  shortDescription: "presentation",
  content: "presentation",
} satisfies Record<keyof TinaMaterialSource, SourceFieldDisposition>;
```

Add source Zod parsing only at an actually untrusted seam, such as accepting a
webhook payload or stored JSON outside the generated Tina client.

### The aggregate is a Product catalogue

Product behavior cannot be validated in isolation:

```text
Materials ──► Products ──► Product groups
                 │               │
                 │               ├── discounted Product sets
                 │               └── related items
                 └── material choices and forbidden combinations
```

Compile in that order. A successful catalogue contains no unresolved Tina paths
or generated reference objects; relationships use stable `MaterialId` and
`ProductId` values.

The global embroidery thread-color palette is another Product dependency. Parse
and validate it alongside Materials even if its Tina form is not generated in
the first implementation.

### Delivery methods are transitional

Delivery methods are operational commerce configuration, not Product catalogue
content. Keep the existing Tina collection working during this refactor, but do
not add it to the canonical Product catalogue or invest in a generated form.
Vendure will become the authority for delivery eligibility and prices. Record
any intentional interim change separately so it does not become part of this
architecture by accident.

### This is catalogue-specific tooling

Build a small catalogue authoring library, not an arbitrary Zod-to-Tina
converter. Support only the Zod and Tina constructs used by Products, Materials,
and Product groups. Generalize only after two or more real declarations require
the same operation.

### Use public Zod interfaces

The authoring generator must not inspect private Zod internals such as `_def`.
Pair a Zod schema with explicit Tina metadata through catalogue-specific
descriptors. Zod remains the validation source; descriptors supply information
that validation schemas do not carry, such as Hungarian editor labels, Tina
controls, references, item labels, and conditional visibility.

### Field-kind locality stays

Adding a field kind previously required edits across many workflows. Preserve
ADR 0006's locality: each field-kind module owns its canonical schema, Tina
source representation, source-to-canonical codec, and pure behavior. The
storefront renderer remains a separate required adapter because it is UI.

Callers use workflow-level Product configuration operations; direct registry
lookups are internal implementation details.

### Compilation is one-way by default

The required operation is Tina source → canonical definition. An encoder is
optional until migrations or write-back require it. Where an encoder exists,
the required law is:

```text
decode(encode(canonical)) = canonical
```

Byte-for-byte Tina source round-tripping is not required. Null removal,
normalization, reference resolution, and omission of irrelevant fields are
allowed when commerce semantics are preserved.

## Target modules

Names may be adjusted to match established repository naming, but preserve the
dependency direction.

```text
src/product-definition/
  model.ts                         Canonical Zod schemas and inferred types
  catalog.ts                       Catalogue aggregate and resolved indexes
  material.ts                      Material and Material-color schemas
  product-group.ts                 Set and related-items schemas
  compile.ts                       Ordered catalogue semantic compilation
  errors.ts                        Structured compiler issues

  authoring/
    descriptor.ts                  Zod schema + Tina metadata primitives
    result.ts                      CompileResult and issue helpers

  field-kinds/
    defineFieldKind.ts             Field-kind declaration helper
    registry.ts                    Exhaustive field-kind registry
    input.ts
    choice.ts
    toggle.ts
    material.ts
    embroidery.ts

  adapters/
    tina/
      source-types.ts              Clean generated Tina query-output aliases
      source-disposition.ts        Exhaustive handling of every source property
      product-form.ts              Generated Product fields
      material-form.ts             Generated Material fields
      product-group-form.ts        Generated Product-group fields
      compile-catalog.ts           Ordered Tina sources → canonical catalogue
      controls.tsx                 Tina-only dynamic controls, if needed
```

If Tina's build configuration cannot safely import files below `src/`, place the
Tina adapter under `tina/` while keeping the canonical modules under `src/`:

```text
tina/adapters/product-definition/
```

In either layout, dependency direction is:

```text
canonical Product modules ← Tina adapter
canonical Product modules ← storefront adapter
canonical Product modules ← future Vendure adapter
```

## Canonical model boundary

### Included

- Stable Product identity
- Product type and orderability
- Base and length-based pricing policy
- Configurable-field definitions
- Field visibility rules
- Material choices and cross-field material rules
- Stable references by domain ID
- A deterministic Product definition revision
- Human-readable labels needed to validate and snapshot an order
- Materials and their colors/patterns
- Product groups classified as discounted sets or related items
- Resolved Product-to-Material and Product-group-to-Product relationships
- A deterministic catalogue revision

### Excluded

- Tina IDs, GraphQL connection shapes, `material_path`, and editor metadata
- Astro entry IDs and `ImageMetadata`
- Svelte state and runes
- Buyer values, count, UUID, dirty state, and validation errors
- Vendure entity IDs and GraphQL types
- Payment, delivery, customer, and order state
- Long-form body, responsive image results, and page-only presentation data

Buyer selections belong in a later `product-configuration` model. Product sets,
materials, and thread colors belong in the catalogue model rather than being
copied into every Product definition. Product-group membership remains declared
on the group, matching `CONTEXT.md` and the Product-sets behavior spec.

## Compiler invariants

The compiler is responsible for facts that a local Zod object cannot establish.
It must eventually guarantee:

1. Product IDs are unique.
2. Field IDs are unique within a Product.
3. Option IDs are unique within a field.
4. Money values are non-negative integer forints.
5. Every field reference resolves.
6. Field dependency graphs are acyclic.
7. Equality predicates are valid for the referenced field kind.
8. Length pricing references a numeric-capable field.
9. Dynamic material color counts reference a numeric-capable field.
10. Every material and material-color reference resolves.
11. Product-group members resolve and are distinct.
12. Discounted sets contain at least two Products.
13. Every reachable orderable configuration has a positive price.
14. A revision changes whenever a commerce-relevant fact changes.
15. Material IDs are unique across the catalogue.
16. Material-color IDs are unique within their Material after source
    normalization.
17. Every Product Material option and forbidden combination resolves.
18. A Product group is compiled explicitly as either a discounted Product set
    or related items; downstream code does not reinterpret nullable discounts.

Structural Zod parsing and graph compilation are separate steps. Use Zod for
local shape validity; use explicit compiler passes for references, cycles,
reachability, and catalogue-wide invariants.

---

## Stage 1 — Characterize current behavior

### Work

1. Inventory every field in these Tina collections:
   - `product`
   - `product_materials`
   - `product_groups`
   - the global embroidery thread-color configuration used by Products
2. Classify every inventoried field as:
   - Product-level authored fact
   - Material or Material-color fact
   - Product-group fact
   - Common configurable-field fact
   - Field-kind-specific fact
   - Editor-only metadata
   - Page-only content
   - Deprecated or unused
3. Record the current source-to-runtime transformation performed in
   `src/lib/data.ts`, including null removal, reference resolution, dates,
   images, material colors, Product-group membership, field types, and length
   pricing.
4. Add representative fixtures for at least:
   - A Material with image-backed and hex-backed colors
   - A discounted Product set
   - A zero/absent-discount related-items group
   - Input
   - Select/radio/color with custom values
   - Toggle
   - Material with fixed color count
   - Material with field-referenced color count
   - Embroidery with flat and per-word pricing
   - Visibility dependency
   - Length-based pricing
   - Forbidden material combinations
5. Pin current observable behavior with tests before changing generation or
   compilation. Prefer extracted pure transformation tests. If extraction would
   itself be a behavioral refactor, use fixture assertions around the smallest
   existing callable seam and explain the limitation in the test.

### Completion criteria

- Every property currently declared in `tina/collections/product.ts`,
  `tina/collections/material.ts`, and `tina/collections/product-groups.ts`
  appears in the inventory exactly once.
- Every configurable field kind has at least one representative fixture.
- Materials and both Product-group meanings have representative fixtures.
- `delivery_methods` is listed as an explicitly deferred Vendure concern rather
  than silently included in the catalogue.
- Tests pin the current canonical meaning of those fixtures.
- `npm test`, `npm run check`, and `npm run lint` pass.
- No production behavior has changed.

---

## Stage 2 — Define the canonical catalogue Zod model

### Work

Build `src/product-definition/model.ts` using Zod and inferred output types.
Define, at minimum:

- Stable IDs and `MoneySchema`
- Material and Material-color definitions
- Product type
- Field visibility as `always | when-present | when-equal`
- Unit pricing and length pricing as a discriminated union
- Input field
- Choice field with `select | radio | color` presentation
- Toggle field
- Material field with `fixed | from-field` color count
- Embroidery field with `flat | per-word` pricing
- Product field discriminated union
- Product definition
- Product group as a discriminated union:
  - Discounted Product set with a positive fixed-forint amount
  - Related items with no discount
- Product catalogue aggregate containing Materials, Products, Product groups,
  and the embroidery thread-color palette

Use explicit semantic names in the canonical model. Examples:

- Tina `name` → canonical `id`
- Tina `items` → canonical `options`
- Tina `material_path` → canonical `materialId`
- Tina `color_count: "2"` → `{ kind: "fixed", count: 2 }`
- Tina `color_count: "meret"` →
  `{ kind: "from-field", fieldId: "meret" }`
- Tina Product-group `discount_amount > 0` → `discounted-set`
- Tina Product-group `discount_amount` absent or zero → `related-items`

Introduce a stable authored `product_group_id`. Existing Product-group files do
not have one; seed it from the current filename so existing catalogue filter IDs
remain stable. The canonical ID must not depend on future title or filename
changes.

Do not include runtime buyer values or compatibility aliases in the canonical
schema.

### Tests

- Each union accepts all valid members.
- Each union rejects properties that belong only to another member.
- Money rejects fractions, negative values, and non-numbers.
- Canonical material color-count variants reject ambiguous states.
- Canonical visibility variants reject a comparison value without a field ID.
- Discounted Product sets reject zero discounts.
- Related-items definitions have no discount property.
- Material colors require stable IDs and a usable appearance according to the
  behavior characterized in Stage 1.

### Completion criteria

- Canonical schemas contain no imports from Tina, Astro, Svelte, Vendure, or
  generated code.
- Every exported model type is inferred from its schema.
- No type assertion is used to make a schema and type appear compatible.
- Model tests pass with `npm test`.
- Existing consumers remain unchanged.

---

## Stage 3 — Prove one live generated Material form

This is the architectural proof. Material is the first end-to-end example
because it is a Product dependency and exercises nested color lists, images,
hex values, IDs, labels, and presentation-only content without field-kind
discrimination.

### Work

1. Define a cleaned alias for the generated Tina Material query output.
2. Add an exhaustive disposition record covering every generated Material
   source property.
3. Implement the smallest descriptor primitives needed by the Material form.
4. A descriptor pairs canonical Zod intent with Tina field metadata; it does not
   duplicate the generated Tina query-output type.
5. Generate the complete Material collection fields, including nested colors.
6. Compile a generated-client-shaped Material fixture into the canonical
   Material schema and parse the result with Zod.
7. Replace `tina/collections/material.ts` fields with the generated fields.
8. Verify the generated Material form in Tina before extending the utility.

The prototype must use public Zod APIs and explicit descriptors. It must not
attempt to walk arbitrary Zod schemas or recreate Tina's generated output type.

### Questions this stage must answer in code or tests

- Can Tina's `Collection["fields"]` types be satisfied without open index
  signatures or unsafe casts?
- Can canonical Zod intent and Tina field declarations share names and metadata
  without a second source schema?
- Can Tina-specific labels and controls stay outside the canonical schema?
- Does adding a property to the generated source alias break the exhaustive
  disposition record?
- Can compilation produce a value accepted by the canonical Zod schema?

If Tina's public types make a narrow justified assertion unavoidable, isolate it
inside the Tina adapter, document the upstream mismatch, and do not let the
assertion affect canonical types. This is an exception requiring review, not the
default design.

### Completion criteria

- The complete Material form is generated and active in Tina.
- Existing Material content opens, edits, saves, and reloads without shape
  changes.
- Generated field names and Tina metadata have snapshot tests.
- A generated-client-shaped Material fixture compiles to canonical Material.
- Every Material source property has an explicit disposition.
- No Zod private internals are accessed.
- `npm test`, `npm run check`, and `npm run lint` pass.

Stop and revise the design if this stage requires a generic schema walker,
multiple broad casts, a duplicate Tina source schema, or duplicated source field
names.

---

## Stage 4 — Implement field-kind and remaining catalogue declarations

### Work

Add declarations for:

- Choice (`select`, `radio`, and `color` presentation)
- Toggle
- Material
- Embroidery

Each field-kind declaration provides:

1. Canonical Zod schema member
2. Tina field metadata
3. Source-to-canonical compiler
4. Existing pure behavior, adapted rather than rewritten where possible

Keep presentation distinctions explicit without duplicating domain semantics.
Select, radio, and color may share one canonical choice kind while the Tina
source codec accepts their existing discriminants.

Build an exhaustive registry. Adding a canonical field kind must cause a compile
error until its authoring declaration exists.

Also define authoring declarations for:

- Product group
- Product-group Product reference

These declarations use the same schema-plus-Tina-metadata primitives but do not
belong in the configurable-field-kind registry.

### Tests

- Existing source fixtures decode into canonical definitions.
- Missing required source properties produce field-specific compiler issues.
- Irrelevant Tina properties do not appear in canonical output.
- Invalid local values fail at the source or canonical Zod parse step.
- The registry covers every current field kind.
- Product-group declarations generate Tina field metadata independently of the
  current handwritten collection.
- Product, Product-group, and supporting source-property disposition records are
  exhaustive over their cleaned generated Tina types.

### Completion criteria

- All seven current Tina types are represented: input, select, radio, color,
  material, toggle, and embroidery.
- Every Stage 1 fixture decodes successfully or has an explicitly documented
  expected error.
- The canonical output contains no nullable list members.
- The current handwritten Product and Product-group forms remain active.
- `npm test`, `npm run check`, and `npm run lint` pass.

---

## Stage 5 — Generate the complete Tina catalogue forms

### Work

1. Generate the flat Tina v3 Product-field superset from the field-kind
   registry:
   - Discriminant selector
   - Common fields
   - Variant-specific fields
2. Generate applicability behavior so variant-specific controls are shown only
   for the selected kind.
3. Preserve custom dynamic controls for:
   - Length-pricing source field
   - Dependency source field
   - Dependency expected value
   - Material color-count source
4. Reuse the already active generated Material collection as the reference
   implementation.
5. Generate the complete Product-group collection form, including Product
   references and fixed-forint discount authoring.
6. Detect incompatible source-key collisions while assembling each form.
7. Snapshot the generated Tina configurations in a stable, readable projection;
   omit function identities from snapshots and assert their behavior separately.
8. Compare generated and current forms property by property using the Stage 1
   inventory.

### Completion criteria

- Every inventoried Product, Material, and Product-group field is generated or
  explicitly retired with user approval.
- Field ordering, labels, descriptions, requirements, defaults, references, and
  applicability match current behavior.
- The generator rejects duplicate source keys with incompatible definitions.
- No generated field uses private Tina internals.
- Existing handwritten Product and Product-group forms remain active until
  parity is demonstrated.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 6 — Replace the handwritten Tina catalogue forms

### Work

1. Replace the configurable `fields` section of
   `tina/collections/product.ts` with generated output.
2. Keep the generated Material form from Stage 3 active and covered by its
   parity tests.
3. Replace `tina/collections/product-groups.ts` fields with generated output.
4. Add `product_group_id` to existing Product-group content, seeded from each
   current filename, and make it required for new groups.
5. Keep unrelated Product collection fields unchanged until their generated
   equivalents have explicit parity coverage.
6. Remove handwritten declarations proven redundant by parity tests.
7. Verify editing existing Products, Materials, and Product groups in Tina.

### Browser verification

Drive the Tina editor in Chromium using the repository's CDP instructions.
Verify at least:

- Type switching shows the correct controls.
- Values survive save and reload.
- Existing Products open without schema errors.
- Dynamic sibling-field selectors populate correctly.
- Material references and list editing work.
- Material color image/hex editing works.
- Discounted and no-discount Product groups preserve their meaning.
- Product-group Product references save and reload.
- Existing Product-group filter IDs remain unchanged after introducing
  `product_group_id`.
- Embroidery pricing mode works.

### Completion criteria

- Tina writes the same source representation for representative Product,
  Material, and Product-group edits.
- Generated fields are active in all three collection definitions.
- Removed handwritten code has no remaining callers.
- Tina browser checks pass for every field kind.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 7 — Compile the complete Product catalogue

### Work

1. Define cleaned generated Tina query-output aliases and exhaustive property
   disposition records for Products, Materials, thread colors, and Product
   groups.
2. Compile and index Materials first, validating Material and color identity.
3. Compile Products second, resolving Material options and forbidden
   combinations to stable `MaterialId` values.
4. Compile Product groups third, resolving membership to stable `ProductId`
   values and classifying each as a discounted Product set or related items.
5. Resolve all references in explicit compiler passes; no canonical output
   contains Tina file paths or generated reference objects.
6. Return structured issues carrying:
   - Product ID
   - Field ID where applicable
   - Source path
   - Stable issue code
   - Human-actionable Hungarian or English message, consistent per audience
7. Compute deterministic Product and catalogue revisions after successful
   compilation.
   Canonicalize key and collection ordering where order is not semantically
   meaningful before hashing.

Do not throw on the first catalogue issue. Accumulate independent issues so one
build reports every Product an editor needs to repair.

### Tests

- Duplicate Product and field IDs
- Missing and cyclic field references
- Invalid length sources
- Invalid material color-count sources
- Missing materials and colors
- Duplicate Material and Material-color IDs
- Invalid Product-group members
- Missing or duplicate stable Product-group IDs
- Duplicate Product-group members
- Product groups with fewer than two distinct members when required by their
  meaning
- Reachable zero-price configurations
- Stable revision under irrelevant source normalization
- Changed revision after every commerce-relevant mutation

### Completion criteria

- Every compiler invariant listed above is tested or explicitly deferred with a
  linked issue and reason.
- Real repository content compiles successfully.
- Compilation order is Materials → Products → Product groups.
- Compiler output is deterministic.
- Errors identify authored locations rather than generated transport paths.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 8 — Introduce canonical output beside current runtime data

### Work

1. Compile canonical definitions during the current Product loading path.
2. Keep current `CmsEnhancedProduct` output temporarily.
3. Compare current and canonical commerce semantics for every real Product:
   - Identity
   - Orderability
   - Base and length pricing
   - Field definitions and options
   - Material choices and prices
   - Visibility
   - Forbidden combinations
4. Compare current and canonical semantics for every real Material and Product
   group:
   - Stable IDs and labels
   - Material colors and appearances
   - Product membership
   - Discounted-set versus related-items meaning
5. Fail tests or local builds on semantic disagreement.
6. Do not expose raw Tina data to new consumers.

### Completion criteria

- Every real Product has a canonical definition.
- Every real Material and Product group has a canonical definition.
- Semantic comparison passes for the full current catalogue.
- Existing pages and islands still consume their previous shape.
- The dual path is clearly marked as a temporary migration with a removal stage.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 9 — Migrate consumers and remove the old commerce shape

Migrate by workflow, keeping each change independently reviewable:

1. Product configuration creation and restoration
2. Validation and visibility
3. Item pricing
4. Query-parameter prefilling
5. Basket persistence
6. Set pricing
7. Order formatting/submission
8. Storefront Product configurator props

During migration, separate immutable Product definitions from buyer-owned
configuration state. Do not reproduce `IProduct extends CmsEnhancedProduct` in
the new model.

For each workflow:

- Adapt through the canonical Product interface.
- Preserve observable behavior with existing tests.
- Remove the old path as soon as all callers migrate.
- Keep the field-kind registry internal to Product configuration workflows.

### Completion criteria

- No commerce module imports `CmsEnhancedProduct` or generated Tina types.
- No pure module imports `.svelte.ts`, Astro, Tina, Vendure, or browser globals.
- Mutable buyer values are not stored on immutable field definitions.
- The temporary semantic comparison and old commerce transform are deleted.
- Product catalog, pricing, set-discount, storage, and submission tests pass.
- `npm test`, `npm run check`, `npm run lint`, `npm run build:local`, and
  `npm run test:hydration` pass.

---

## Stage 10 — Record the architecture

### Work

After implementation evidence exists, add an ADR covering:

- Zod as the canonical Product model
- Tina as the authoring source adapter
- Flat Tina source shape compiled to a discriminated canonical shape
- Catalogue-specific descriptors rather than generic Zod introspection
- Field-kind locality
- Immutable Product definition versus mutable buyer configuration
- Adapter dependency direction
- Vendure as the future transactional authority

Update `CONTEXT.md` if implementation introduces stable domain terms not already
defined, especially **Product definition**, **Product configuration**, and
**published Product revision**.

### Completion criteria

- The ADR describes the implemented architecture rather than the original plan.
- Domain terms match code and behavioral specs.
- Superseded ADR statements are amended or explicitly superseded.

## Guardrails for every stage

- Preserve existing user behavior unless the stage explicitly changes a spec.
- Keep `docs/specs/` synchronized with intentional behavioral changes.
- Use integer forints in canonical commerce models.
- Parse untrusted runtime input with Zod at seams; Tina generated-client output
  is trusted statically and canonical compiler output is parsed with Zod.
- Return or accumulate structured compiler issues; reserve thrown errors for
  programmer faults and failed build publication.
- Keep generated Tina code deterministic and snapshot-testable.
- Prefer exhaustive records and discriminated unions over casts.
- Preserve current content compatibility until a deliberate migration exists.
- Keep payment and delivery work outside this refactor.

## Explicit non-goals

- A universal Zod-to-Tina converter
- Automatic generation of arbitrary Tina React controls
- Vendure entity-schema generation
- Creating one Vendure variant per Product configuration
- Payments or delivery implementation
- Generating or migrating the Tina `delivery_methods` collection; Vendure will
  replace its pricing and eligibility authority
- TinaCMS 4 migration
- Byte-for-byte round trips of normalized Tina records
- Replacing Tina as the Product authoring source

## Future Vendure seam

This plan is complete when the canonical Product definition can be imported by a
Node backend without storefront dependencies. The later Vendure adapter will:

1. Publish validated Product definitions with their revision.
2. Store buyer selections on an Order line or related custom entity.
3. Validate selections against the published definition.
4. Recalculate prices server-side with the same pure field behavior.
5. Ignore client-provided totals.

Tina remains the authoring authority. Vendure becomes the transactional
authority for published sellability, basket totals, delivery, payment, and
orders.
