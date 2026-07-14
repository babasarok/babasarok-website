# Plan: `embroidery` field type + discriminated field union

Goal: let editors offer name embroidery on most products without duplicating a
toggle + text + thread-color trio onto every product. We add a single new field
`type: "embroidery"` that bundles all three, with the thread-color palette held
in one global collection (reusing the material-color components).

Before we can give embroidery a sane value shape, we first make `fields` a
proper discriminated union so each field type can carry the value type it
actually needs.

---

## Phase 1 — Central type list + tag `fields` by `type` ✅ done

Today every field is one flat shape and every value is
`ValueWithError = { value: string; is_custom?; error? }`. That forces string
values everywhere and leaves embroidery with nowhere to put `enabled` / `text` /
`color`.

**Key decision:** the **Tina config is the source of truth** — the content
schema can't express more than Tina stores, so we don't try to. Instead of a
schema-level discriminated union, the field `type` is a plain enum drawn from one
central list, and the **discriminated union lives on the form/runtime side**,
where it tags the fields we actually control so each can carry its own value
shape.

### 1a. Central type list

[src/lib/productFieldTypes.ts](../src/lib/productFieldTypes.ts) is the single
source of truth: `PRODUCT_FIELD_TYPES` (value + label), the derived
`ProductFieldType` union, `PRODUCT_FIELD_TYPE_VALUES` (for `z.enum`), and an
`isProductFieldType` guard. Consumers:

- [tina/collections/product.ts](../tina/collections/product.ts) — the `type`
  select `options` map from `PRODUCT_FIELD_TYPES` (relative import; Tina's
  esbuild ignores the `@/` alias).
- [src/content.config.ts](../src/content.config.ts) — the field shape is one
  `z.object` with `type: z.enum(PRODUCT_FIELD_TYPE_VALUES)` plus the shared keys.
- [src/lib/data.ts](../src/lib/data.ts) — `CmsField.type` is `ProductFieldType`;
  `toProductFieldType` narrows Tina's loose `type: string` via
  `isProductFieldType`.

### 1b. Reconcile in `data.ts`

Tina's generated `CmsProduct["fields"]` stays **flat**. `CmsField` re-tags just
its `type` to `ProductFieldType`, and the `getProducts` mapper builds the shared
shape once then sets the narrowed `type`. The diff assertion
`AssertTrue<IfEquals<ProductDiff, never>>` still resolves to `never`. No Tina
codegen needed — only the zod schema and enhanced type changed. Verified with
`npm run check`, `npm run lint`, and the unit tests.

## Phase 2 — Per-type value types (`toggle` → boolean) + the form-side union

The discriminated union is introduced **here**, on the runtime side: derive the
`Field` type in [src/lib/types.svelte.ts](../src/lib/types.svelte.ts) by
distributing over the central `ProductFieldType`, giving each tag the value type
it needs:

- `input` / `select` / `radio` / `color` → `value?: ValueWithError` (string) —
  unchanged.
- `toggle` → `value?: { value: boolean; error? }` — **changes** from the
  `"true"`/`"false"` string it stores today.

Touch points that assume the toggle string and must switch to boolean:

- [src/components/blocks/order/OrderItemFields.svelte](../src/components/blocks/order/OrderItemFields.svelte)
  — `Switch` `checked` / `onchange` currently read/write `"true"`/`"false"`.
- [src/lib/priceUtils.ts](../src/lib/priceUtils.ts) — `getFieldPrice` toggle
  branch.
- [src/lib/validation.ts](../src/lib/validation.ts) — `prefillField`
  (`{ value: "false" }` → `{ value: false }`) and `updateFieldWithErrors`.
- [src/lib/orderSubmit.ts](../src/lib/orderSubmit.ts) — `formatFieldValue`
  toggle branch.
- [src/lib/fieldVisibility.ts](../src/lib/fieldVisibility.ts) — a toggle used as
  a `depends_on` target now compares against a boolean; decide how
  `depends_on.value` (a string in the schema) maps (e.g. `"true"` ⇢ `true`).
- Tests in [src/lib/**tests**/](../src/lib/__tests__/) + `fixtures.ts`
  (`makeField` toggle value).

Doing this as its own phase keeps the (mechanical, well-tested) toggle change
separate from the new feature.

## Phase 3 — Add the `embroidery` field type

### 3a. Thread-color collection (global, MaterialColor-compatible)

- New global Tina collection `tina/collections/embroidery.ts` (like `config`,
  `ui.global = true`, create/delete disabled), backed by a **single JSON file**
  in `src/content/config` named `embroidery.json` (kept generic so it can hold
  more embroidery settings later, not just colors).
- The existing `config` Astro collection loads
  `glob({ pattern: "**/*.json", base: "src/content/config" })`, which would
  swallow the new file. **Amend the globs so each collection owns its file:**
  narrow `config` to `config.json` and give the new collection its own
  `embroidery.json` pattern (same base dir).
- The file holds a `colors` property with the list inside, mirroring
  `material.colors[]` so the components are reusable:
  `{ colors: [{ color_id, label, hex?, image? }] }`.
- Add the matching Astro collection in `content.config.ts`, a `getThreadColors()`
  loader in `data.ts` that runs images through `optimizeImage(SWATCH_WIDTH)`
  (same as `transformMaterial`), and its own `AssertTrue<IfEquals<…>>` guard.

### 3b. Value shape

`ProductMaterialValue` isn't a good fit — it carries `material_id` (irrelevant
here) and a `colors[]` array (embroidery selects exactly one). So embroidery
gets a dedicated single-color value; `Color.svelte` still reuses cleanly (it
takes one color object + `selected` + `onclick`), we just track one `color_id`
instead of an array:

```ts
interface EmbroideryColorValue {
  color: string;         // selected thread color_id ("" = none)
  custom_color?: string; // backend-supported; no UI for now
  error?: string;
}

interface EmbroideryValue {
  enabled: boolean;
  text: ValueWithError;        // text + regex + error
  color: EmbroideryColorValue; // single color, no material_id
}
```

`embroidery` variant of `Field` → `value?: EmbroideryValue`. Keeping `text` /
`color` populated across `enabled` toggles preserves the editor's input when
they turn embroidery off and back on.

### 3c. Wiring

| Module | Change |
|---|---|
| `tina/collections/product.ts` | Add `{ value: "embroidery", label: "Hímzés" }` to the type options; hide `items` for this type. Exclude embroidery fields from the `depends_on` field picker — they can't be depended on (see Design notes). |
| `data.ts` | `narrowField` builds the embroidery variant. Thread colors loaded separately and passed to the island. |
| `contact.astro` → `OrderForm` → `OrderItem` → `OrderItemFields` | Pass a `threadColors` prop down (global, not per product). |
| `OrderItemFields.svelte` | New `{:else if field.type === "embroidery"}` branch: a `Switch` (enabled) that slide-reveals a `TextInput` + a **single-select** `Color` grid fed by `threadColors`. No "Egyéb" custom-color UI for now; `custom_color` stays in the value so it can be surfaced later. |
| `validation.ts` | When `enabled`: require `text` (+ regex) and `color`; when disabled: clear sub-errors. |
| `priceUtils.ts` | Add the flat `field.price` only when `enabled`. |
| `orderSubmit.ts` | When enabled, render text + color label (respecting indent); when disabled, omit the line entirely. |
| Tests | `fixtures.ts` (`makeField` embroidery, `makeThreadColors`); unit tests for enabled/disabled pricing, validation, submit text. |

---

## Design notes

These are settled and already reflected in the phases above; kept here for the
non-obvious rationale:

- **Custom thread color** is intentionally not exposed in the UI yet, but
  `custom_color` lives in the value shape so it can be turned on later without a
  data migration.
- **Single color, no `material_id`** — embroidery picks exactly one thread, so it
  gets its own `EmbroideryColorValue` rather than reusing the material shape.
- **Values persist across the toggle** — `text` / `color` are not cleared when
  `enabled` flips off, so an editor's input survives an accidental off/on.
- **Not a `depends_on` target** — embroidery has a composite value, so letting
  another field depend on it would force the visibility code to decide what
  "the value" is (enabled? text? color?) and add edge cases to the picker and
  matcher. If something genuinely needs to react to embroidery state, model that
  coupling *inside* `EmbroideryValue` instead. So embroidery is excluded from the
  dependency picker.
- **Multiple embroidery fields per product are allowed.** Restricting to one was
  considered (see below) but nothing technically requires it, and a product may
  legitimately want more than one embroidered element.

---

## Suggested order of work

1. ~~Phase 1 (central type list + `data.ts` reconcile + `npm run check`).~~ ✅ done
2. Phase 2 (toggle → boolean + form-side union, update touch points + tests).
3. Phase 3a (thread-color collection + loader + plumbing).
4. Phase 3b/3c (embroidery value, UI, validation, pricing, submit, tests).
