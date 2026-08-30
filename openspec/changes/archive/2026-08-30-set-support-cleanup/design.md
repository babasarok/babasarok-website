# Design: set-support cleanup

## Context

Follow-up cleanups found by architectural review of the set-support work (the
`add-set-support` change). The architecture is sound; these items are
maintainability fixes. All are behavior-preserving: the charged price, the
displayed price, the persisted basket, and the deep-link scheme keep the same
externally visible behavior. Each item is independent; none are committed to
beyond this proposal.

## 1. Single home for the set UI

**Problem.** `OrderItem.svelte` carries a dead "add related" chip section and
pending-discount banner (with `onSyncToSet`), plus the props
`relatedProducts`, `onAddRelated`, `relatedDiscounts`,
`basketCountByProductId` and `onSyncToSet`. Its only consumer,
`ProductOrder.svelte`, renders the set UI via `SetPanel`/`SetSiblingCard`
instead and passes none of those props — and `CheckoutItem.svelte` does not
use `OrderItem` at all. The block is unreachable, duplicates the set-UI logic
`SetPanel` already implements, and will drift.

**Fix.** Delete the dead block and its props. `SetPanel`/`SetSiblingCard` stay
the single home for set UI. (The alternative — routing `ProductOrder` through
`OrderItem` and deleting `SetPanel`/`SetSiblingCard` — is rejected: `SetPanel`
is the layout the product page actually ships.)

**Affected:** `src/components/blocks/order/OrderItem.svelte`,
`src/components/blocks/order/ProductOrder.svelte`,
`src/components/blocks/order/SetPanel.svelte`,
`src/components/blocks/order/SetSiblingCard.svelte`.

## 2. Store the raw discount percent in `DiscountInfo`

**Problem.** `src/lib/orderSubmit.ts` (~line 147) and
`src/components/blocks/order/OrderItemPrice.svelte` (~line 59) both recover the
display percent by inverting `calculatePriceForItem`'s formula:
`(1 - discountInfo.discount) / (discountInfo.discountAppliedCount / product.count)`.
The round-trip breaks silently if either side changes, and assumes
`count >= 1`.

**Fix.** Store the raw `percent` in `DiscountInfo` alongside the multiplier,
and display it directly.

**Affected:** `src/lib/priceUtils.ts` (`DiscountInfo`),
`src/lib/orderSubmit.ts`,
`src/components/blocks/order/OrderItemPrice.svelte`.

## 3. Make set-discount resolution explicit in the pricing path

**Problem.** `calculatePriceForItem(product, setStatus?)` takes the set status
as an optional argument, so any caller that forgets it silently produces a
non-discounted price. `orderSubmit.ts` already calls
`resolveActiveSetDiscount` twice per item (once in `calculateOrderTotal`, once
in `formatProductString`), and a third call site is one refactor away.

**Fix.** Pass `basket` + `groups` (or a pre-resolved status map) into the
pricing path so resolution happens in exactly one place.

**Affected:** `src/lib/priceUtils.ts`, `src/lib/orderSubmit.ts`,
`src/components/blocks/order/CheckoutForm.svelte`,
`src/components/blocks/order/CheckoutItem.svelte`,
`src/components/blocks/order/ProductOrder.svelte`,
`src/components/blocks/order/OrderItemPrice.svelte`.

## 4. Consolidate product lookup maps

**Problem.** `slugByProductId` is built independently in
`src/pages/product/[id].astro` and `src/pages/checkout.astro`, and
`src/components/blocks/Header.astro` builds a parallel `productMeta` map
(title + slug) via `getCollection("product")` on every page.

**Fix.** A small shared helper (e.g. in `src/lib/data.ts`) returning the
product id → {title, slug} map, used by all three.

**Affected:** `src/lib/data.ts`, `src/pages/product/[id].astro`,
`src/pages/checkout.astro`, `src/components/blocks/Header.astro`.

## 5. `prefillFromParams` regex collision

**Problem.** In `src/lib/orderQueryParams.ts`, a field literally named e.g.
`foo_color` or `foo_custom_color` would be misread as an embroidery colour
param by the `/^(.+?)_(custom_color|color)$/` pattern (field lookup happens
first, but the pattern still matches any name ending in `_color`). The scheme
is a de-facto public URL API (deep links).

**Fix.** Resolve embroidery params by known embroidery field names instead of
a free-form prefix regex; if that proves too restrictive, document the
reserved suffixes in the scheme comment so content authors avoid colliding
field names.

**Affected:** `src/lib/orderQueryParams.ts`,
`src/lib/__tests__/orderQueryParams.test.ts`.

## 6. `mapProductToSaved` cast

**Problem.** `src/lib/orderStorage.ts` builds the persisted shape with
`as SavedProduct`, so the live→persisted mapping is only checked by zod at
write time, not by the type system.

**Fix.** Type the returned object explicitly (or add a small test that
`mapProductToSaved` output always parses against `savedProductSchema`).

**Affected:** `src/lib/orderStorage.ts`.

## 7. Hardcoded price colors

**Problem.** The set-support price/discount UI uses raw Tailwind palette
classes (`text-red-500`, `bg-green-600`, `text-green-700`, …) in
`SetPanel.svelte`, `SetSiblingCard.svelte`, `OrderItem.svelte`,
`OrderItemPrice.svelte`, `ProductOrder.svelte`, `CheckoutDeals.svelte`.
AGENTS.md asks to check the `@theme` tokens in `src/styles/global.css` before
hardcoding colors.

**Fix.** A pass to replace ad-hoc palette classes with `--color-*` tokens
(adding tokens where none exists).

**Affected:** the order-block components listed above,
`src/styles/global.css`.
