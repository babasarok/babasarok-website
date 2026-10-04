# Product definition and Tina authoring plan

## Goal

Define the canonical Product model with Zod, generate the Tina Product field form
from a Product-specific authoring registry, and compile Tina's permissive stored
shape into the canonical model.

The result is the shared Product definition that the storefront and a future
Vendure backend can both trust. This work preserves current storefront behavior;
moving checkout, payments, delivery, and monetary authority to Vendure is later
work.

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

### This is Product-specific tooling

Build a small Product authoring library, not an arbitrary Zod-to-Tina converter.
Support only the Zod and Tina constructs used by this Product model. Generalize
only after two or more real field kinds require the same operation.

### Use public Zod interfaces

The authoring generator must not inspect private Zod internals such as `_def`.
Pair a Zod schema with explicit Tina metadata through Product-specific
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
  catalog.ts                       Materials, thread colors, groups, catalogue
  compile.ts                       Product/catalogue semantic compilation
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
      source-schema.ts             Zod schema for Tina's stored Product shape
      product-form.ts              Generated Tina fields
      compile-product.ts           Tina source → canonical Product
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
copied into every Product definition.

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

Structural Zod parsing and graph compilation are separate steps. Use Zod for
local shape validity; use explicit compiler passes for references, cycles,
reachability, and catalogue-wide invariants.

---

## Stage 1 — Characterize current behavior

### Work

1. Inventory every Tina Product field and classify it as:
   - Product-level authored fact
   - Common configurable-field fact
   - Field-kind-specific fact
   - Editor-only metadata
   - Page-only content
   - Deprecated or unused
2. Record the current source-to-runtime transformation performed in
   `src/lib/data.ts`, including null removal, reference resolution, dates,
   images, material colors, field types, and length pricing.
3. Add representative fixtures for at least:
   - Input
   - Select/radio/color with custom values
   - Toggle
   - Material with fixed color count
   - Material with field-referenced color count
   - Embroidery with flat and per-word pricing
   - Visibility dependency
   - Length-based pricing
   - Forbidden material combinations
4. Pin current observable behavior with tests before changing generation or
   compilation. Prefer extracted pure transformation tests. If extraction would
   itself be a behavioral refactor, use fixture assertions around the smallest
   existing callable seam and explain the limitation in the test.

### Completion criteria

- Every property currently declared in `tina/collections/product.ts` appears in
  the inventory exactly once.
- Every configurable field kind has at least one representative fixture.
- Tests pin the current canonical meaning of those fixtures.
- `npm test`, `npm run check`, and `npm run lint` pass.
- No production behavior has changed.

---

## Stage 2 — Define the canonical Zod model

### Work

Build `src/product-definition/model.ts` using Zod and inferred output types.
Define, at minimum:

- Stable IDs and `MoneySchema`
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

Use explicit semantic names in the canonical model. Examples:

- Tina `name` → canonical `id`
- Tina `items` → canonical `options`
- Tina `material_path` → canonical `materialId`
- Tina `color_count: "2"` → `{ kind: "fixed", count: 2 }`
- Tina `color_count: "meret"` →
  `{ kind: "from-field", fieldId: "meret" }`

Do not include runtime buyer values or compatibility aliases in the canonical
schema.

### Tests

- Each union accepts all valid members.
- Each union rejects properties that belong only to another member.
- Money rejects fractions, negative values, and non-numbers.
- Canonical material color-count variants reject ambiguous states.
- Canonical visibility variants reject a comparison value without a field ID.

### Completion criteria

- Canonical schemas contain no imports from Tina, Astro, Svelte, Vendure, or
  generated code.
- Every exported model type is inferred from its schema.
- No type assertion is used to make a schema and type appear compatible.
- Model tests pass with `npm test`.
- Existing consumers remain unchanged.

---

## Stage 3 — Prototype the authoring descriptor with `input`

This is the architectural proof. Keep the existing Tina Product form active.

### Work

1. Implement the smallest descriptor primitives needed by an input field.
2. A descriptor must pair:
   - Its Zod source schema
   - Tina field metadata
   - A decoder to the canonical schema
3. Implement `defineProductFieldKind()` and the `input` field declaration.
4. Generate an inactive Tina field fragment for `input`; do not replace the
   collection yet.
5. Decode an input fixture into the canonical input definition.

The prototype must use public Zod APIs and explicit descriptors. It must not
attempt to walk arbitrary Zod schemas.

### Questions this stage must answer in code or tests

- Can Tina's `Collection["fields"]` types be satisfied without open index
  signatures or unsafe casts?
- Can a descriptor provide both a Zod source schema and Tina field declarations
  without duplicating field names?
- Can Tina-specific labels and controls stay outside the canonical schema?
- Can decoding produce a value accepted by the canonical Zod schema?

If Tina's public types make a narrow justified assertion unavoidable, isolate it
inside the Tina adapter, document the upstream mismatch, and do not let the
assertion affect canonical types. This is an exception requiring review, not the
default design.

### Completion criteria

- One `input` declaration generates its inactive Tina fragment and decodes its
  fixture.
- Generated field names and Tina metadata have snapshot tests.
- No Zod private internals are accessed.
- The current Tina collection is still active and behavior is unchanged.
- `npm test`, `npm run check`, and `npm run lint` pass.

Stop and revise the design if this stage requires a generic schema walker,
multiple broad casts, or duplicated source field names.

---

## Stage 4 — Implement every field-kind declaration

### Work

Add declarations for:

- Choice (`select`, `radio`, and `color` presentation)
- Toggle
- Material
- Embroidery

Each declaration provides:

1. Canonical Zod schema member
2. Tina source Zod schema
3. Tina field metadata
4. Source-to-canonical decoder
5. Existing pure behavior, adapted rather than rewritten where possible

Keep presentation distinctions explicit without duplicating domain semantics.
Select, radio, and color may share one canonical choice kind while the Tina
source codec accepts their existing discriminants.

Build an exhaustive registry. Adding a canonical field kind must cause a compile
error until its authoring declaration exists.

### Tests

- Existing source fixtures decode into canonical definitions.
- Missing required source properties produce field-specific compiler issues.
- Irrelevant Tina properties do not appear in canonical output.
- Invalid local values fail at the source or canonical Zod parse step.
- The registry covers every current field kind.

### Completion criteria

- All seven current Tina types are represented: input, select, radio, color,
  material, toggle, and embroidery.
- Every Stage 1 fixture decodes successfully or has an explicitly documented
  expected error.
- The canonical output contains no nullable list members.
- Current production Tina form remains active.
- `npm test`, `npm run check`, and `npm run lint` pass.

---

## Stage 5 — Generate the complete Tina configurable-field form

### Work

1. Generate the flat Tina v3 superset from the field-kind registry:
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
4. Detect incompatible source-key collisions while assembling the form.
5. Snapshot the generated Tina configuration in a stable, readable projection;
   omit function identities from snapshots and assert their behavior separately.
6. Compare generated and current forms property by property using the Stage 1
   inventory.

### Completion criteria

- Every inventoried current field is generated or explicitly retired with user
  approval.
- Field ordering, labels, descriptions, requirements, defaults, references, and
  applicability match current behavior.
- The generator rejects duplicate source keys with incompatible definitions.
- No generated field uses private Tina internals.
- Existing Tina form remains active until parity is demonstrated.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 6 — Replace the handwritten Tina field form

### Work

1. Replace only the configurable `fields` section of
   `tina/collections/product.ts` with generated output.
2. Keep unrelated Product collection fields unchanged.
3. Remove handwritten declarations proven redundant by parity tests.
4. Verify editing existing Products and creating each field kind in Tina.

### Browser verification

Drive the Tina editor in Chromium using the repository's CDP instructions.
Verify at least:

- Type switching shows the correct controls.
- Values survive save and reload.
- Existing Products open without schema errors.
- Dynamic sibling-field selectors populate correctly.
- Material references and list editing work.
- Embroidery pricing mode works.

### Completion criteria

- Tina writes the same source representation for representative existing edits.
- Generated fields are the active collection definition.
- Removed handwritten code has no remaining callers.
- Tina browser checks pass for every field kind.
- `npm test`, `npm run check`, `npm run lint`, and `npm run build:local` pass.

---

## Stage 7 — Compile complete Products and catalogues

### Work

1. Define the Tina Product source schema independently from generated GraphQL
   types. Generated types may describe transport, but Zod validates runtime
   input.
2. Compile Product-level facts and all field declarations into a canonical
   Product definition.
3. Define catalogue schemas for materials, thread colors, and Product groups.
4. Resolve references in explicit compiler passes.
5. Return structured issues carrying:
   - Product ID
   - Field ID where applicable
   - Source path
   - Stable issue code
   - Human-actionable Hungarian or English message, consistent per audience
6. Compute a deterministic commerce revision after successful compilation.
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
- Invalid Product-group members
- Reachable zero-price configurations
- Stable revision under irrelevant source normalization
- Changed revision after every commerce-relevant mutation

### Completion criteria

- Every compiler invariant listed above is tested or explicitly deferred with a
  linked issue and reason.
- Real repository content compiles successfully.
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
4. Fail tests or local builds on semantic disagreement.
5. Do not expose raw Tina data to new consumers.

### Completion criteria

- Every real Product has a canonical definition.
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
- Product-specific descriptors rather than generic Zod introspection
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
- Parse untrusted runtime input with Zod at seams.
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
