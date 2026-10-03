# ADR 0006: Per-field-type behaviour registry

- **Status:** accepted (in progress — interface defined; bodies + consumer
  rewiring + usage lint pending)
- **Date:** 2026-10

## Context

A product's configurable `Field` is a plain, serializable data record: it is
loaded from the Tina frontmatter, passed as island props, persisted to
localStorage, and snapshot through `$state.snapshot()`. Because it has no
methods of its own, "what a field of a given type does" is answered by a
`switch (field.type)` — and that switch has been **re-implemented in every
consumer** that needs a per-type answer:

| Concern              | Where the switch lived                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| value prefill/clamp  | `product/validation.ts` (`prefillField`, …)                                   |
| value resolution     | `product/field.ts` (`resolveFieldValue`)                                      |
| price contribution   | `pricing/price.ts` **and** `pricing/validCombinations.ts` (a duplicated copy) |
| choice enumeration   | `pricing/validCombinations.ts` (`fieldCombinations`)                          |
| deep-link fill       | `order/queryParams.ts` (`applyFieldParam`)                                    |
| persistence shape    | `order/storage.ts` (`toSavedField`)                                           |
| validation / errors  | `product/validation.ts` (`updateFieldWithErrors`)                             |
| order-email record   | `order/submit.ts` (`shouldSubmitField`, `formatFieldValue`)                   |
| basket-summary value | `CheckoutItem.svelte` (`fieldDisplay`)                                        |

Two consequences bite:

- **Drift.** The price part is computed in two places (`price.ts`
  `getFieldPrice` and `validCombinations.ts` `fieldPrice`). They are the same
  branches copy-pasted, so the live price and the build-time 0-Ft gate can
  disagree about what a field contributes.
- **No locality.** Adding or changing a field type touches ~8 files across four
  directories. There is no single place that says "this is everything a
  `material` field does."

## Decision

Each field type declares its behaviour **once**, in
`src/lib/product/behavior/<type>.ts`, and `behavior/index.ts` gathers them into
an exhaustive record:

```ts
export const FIELD_BEHAVIORS: Record<ProductFieldType, FieldBehavior> = {
  input,
  select,
  radio,
  color,
  material,
  toggle,
  embroidery,
};
```

`FieldBehavior` is the interface of every per-type _answer_ the system asks of
a field: `normalize`, `resolveValue`, `price`, `enumerate`, `fillFromParams`,
`toSaved`, `validate`, `hasError`, `clearErrors`, `formatValue`,
`includeInEmail`, `formatForEmail`.

Two of these are a pair with a subtle split:

- **`formatValue(field): string | undefined`** — the human-readable text of the
  current selection, or `undefined` when there is nothing to show. This is the
  value column of the basket summary (which hides valueless rows) and the
  non-empty part of the email line.
- **`formatForEmail(field): string`** — the email line text. For a non-empty
  selection it equals `formatValue`; the difference is the _empty_ state, which
  the record represents rather than hides (a toggle off reads "Nem", a blank
  custom field reads "Egyedi: ", a blank required option reads as an empty
  line). The email is a complete record; the summary is a glance.

The line _name_ is not a method: every type uses `field.label || field.name`,
so a per-type `stringifyName` would be seven identical implementations.

Two supporting pieces keep the surface small and cast-free:

- **`FieldOf<T> = Field & { type: T }`** — because `Field` is a discriminated
  union, this intersection reduces to the single member for a literal `T`.
- **`defineBehavior("material", { … })`** — wraps a per-type implementation into
  the uniform `FieldBehavior`, carrying the `fieldIs` type-guard so each module
  is written exclusively against its narrowed `FieldOf<T>`. No casts, per the
  AGENTS.md rule.

The change is behaviour-preserving: charged price, persisted basket shape,
deep-link scheme, and the order email stay byte-for-byte identical (the Vitest
snapshots are the safety net).

### What is deliberately _not_ in the registry

These are not per-type facts, so they stay where they already live:

- **`depends_on` visibility** — type-agnostic; `isFieldVisible` only reads the
  scalar `resolveValue` produces.
- **The length-source collapse** (the source field scales the per-meter price
  rather than adding to it) — a product-level decision, taken by the callers.
- **Banned-combination pruning** — a cross-field reachability rule the
  0-Ft gate applies to the choices `enumerate` returns (`materials.ts`).
- **The `_color` / `_colors` deep-link companions** — a product-level scheme,
  parsed in `order/queryParams.ts` around the per-type `fillFromParams`.
- **Email dependency indentation** — a pure walk of the `depends_on` graph.
- **Line layout** of the basket summary and the email — the name column
  (`field.label || field.name`), hiding of valueless rows, per-option price
  tags, and the email's dependency indentation. Presentational / graph-shaped;
  the per-type _value text_ is `formatValue`.

## Consequences

### Implementation coverage is a compile error

`Record<ProductFieldType, FieldBehavior>` is keyed by the same list that drives
`PRODUCT_FIELD_TYPES`. Adding a field type is a compile error until a behaviour
exists for it; removing a method from `FieldBehavior` is a compile error until
every behaviour implements it. This is the same enforcement already used by
`ProductType` and `ProductFieldType` — the "single source of truth" pattern
extended from _values_ to _behaviour_.

### Usage coverage is a lint error

Implementation coverage alone does not stop a new `switch (field.type)`
appearing in a consumer. Usage is enforced by a **type-aware ESLint rule** that
flags a `switch` whose discriminant's type is `ProductFieldType`, scoped to
`src/lib/` **excluding** `src/lib/product/behavior/`:

- It is **type-aware** (the repo already runs `strictTypeChecked`), so it
  catches the identifier form (`const { type } = field; switch (type)`) that a
  purely syntactic `switch (x.type)` selector would miss.
- It is **scoped to `src/lib/`**, so the presentational per-type renders in
  `src/components/blocks/order/` (which branch on type to _choose UI_) are not
  flagged.
- It has **no false positives** on the current tree: the only `switch`es on a
  field type in `src/lib/` are exactly the bypasses this refactor removes
  (`price.ts`, `validCombinations.ts`, `validation.ts`, `field.ts`,
  `queryParams.ts`, `storage.ts`, `data.ts`). The other `switch`es there
  (`state.sort`, `targetValue.kind`) are on non-field discriminants and are not
  matched.

A hit means "this is a per-type _answer_ — it belongs in the registry." The fix
is to add the answer as a `FieldBehavior` method (or reuse an existing one),
not to switch. This makes the registry the _only_ home for per-type domain
answers, which is the long-term-maintainability goal.

What the rule does **not** flag, by design:

- **Cross-field selections** like `fields.filter(f => f.type === "material")`
  in `materials.ts` / `setDiscount.ts` — these use the type as a _selector_,
  not a per-type answer, and are not `switch`es.
- **Svelte render** in `src/components/` — presentational, out of scope.
- **Test fixtures** that construct a specific type.

An optional belt-and-suspenders `scripts/test/no-field-type-switch.ts` CI guard
(matches the existing `no-tina-cloud-urls` convention) can AST-scan for the same
pattern as a backstop if the lint rule proves too permissive in practice.

### Migration

1. Implement the seven behaviours (faithful extraction; snapshots pin
   behaviour).
2. Rewire the consumers to `FIELD_BEHAVIORS[field.type].<method>(…)`, deleting
   the extracted switches. This removes the `price.ts`/`validCombinations.ts`
   duplication and the per-type `fieldDisplay` switch in `CheckoutItem.svelte`
   (its value column becomes `formatValue`).
3. Land the usage lint rule.
4. `npm test` + `npm run check` green; hydration run.
