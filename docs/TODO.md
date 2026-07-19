# TODO

## field value typing (fragile string coercions)

Several places reinterpret a field's stored **string** value as something else,
with no schema/type link enforcing it. Each is marked `FRAGILE` in code:

- **`depends_on.value`** is always a string, but a target field's value may be a
  boolean (toggle) or string, so [src/lib/fieldVisibility.ts](../src/lib/fieldVisibility.ts)
  stringifies before comparing.
- **Color-count-by-field-reference** parses another field's string value as a
  number in [src/lib/materialUtils.ts](../src/lib/materialUtils.ts).
- **`length_based_pricing_source`** parses the referenced field's string value as
  a number (cm) in [src/lib/priceUtils.ts](../src/lib/priceUtils.ts).

Symptoms: a non-numeric / mistyped value silently degrades to `undefined` or a
non-match instead of surfacing an error, and cross-field references (`depends_on`,
color count, length source) are untyped strings that can point at a field of the
wrong kind.

Plan a better model, e.g.:

- Probably length-based pricing configuration should live in the product schema, not in the field schema, so that the source field can be typed as numeric.
- A typed accessor that resolves a field reference to its value **and** validates
  the referenced field's `type` (numeric source must be `input`/`radio`, etc.).
- Represent field values as a tagged union (`{ kind: "string"; ... } | { kind:
"number"; ... }`) so consumers narrow instead of coercing.
- Validate cross-field references at load time (in `data.ts`) so a bad reference
  fails the build rather than silently no-op'ing at runtime.

## Add address field to some of the delivery methods

Product requirement. Can be done by adding a boolean to the delivery method schema, and then conditionally rendering an address field in the checkout form.

## Allow seeing colors in the order form bigger

Explore some ideas for a better color picker. Mobile-friendliness is also important. Using different components between Mobile and Desktop is also an option, but it would be nice to have a single component that works well on both. Multi-select is still needed.

- a modal with a larger swatch and the color name?
- a modal with all color options, with a larger swatch and the color name?
- link to the material page?
