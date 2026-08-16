# Plan: `feat/set-support` follow-ups

Status: **proposed** — architectural review of the set-support branch against
`main`. Each item below is independent; none are committed to yet.

Context: the branch adds the product-page configurator, the persisted basket,
the `/checkout` page, and material-gated set discounts (see
[set-pricing-model.md](set-pricing-model.md)). The architecture is sound; the
items below are maintainability cleanups found in review.

## 1. Single source of truth for set-discount resolution

**Problem.** `resolveActiveSetDiscount` (used for *actual pricing*) and
`resolveSetDiscountStatus` (used for *UI state*) in `src/lib/priceUtils.ts`
each independently implement the same rule: collect memberships → filter
matching partners → biggest-percent-wins →
`count = min(sum of partner counts, item.count)`. The sync is currently
enforced only by comments ("Keep in sync with `resolveActiveSetDiscount`") and
tests. If the rule changes (e.g. the open question about differing material
counts in `set-pricing-model.md` §6), both must change identically, or the
displayed discount will disagree with the charged price.

**Fix.** Extract one shared core — e.g. a single `resolveSetDiscountStatus`
that pricing consumes via its `active` case — so there is exactly one
implementation of the rule. `resolveActiveSetDiscount` becomes a thin adapter
(or is removed and callers use the status directly).

**Affected:** `src/lib/priceUtils.ts`, `src/lib/orderSubmit.ts`,
`src/components/blocks/order/CheckoutForm.svelte`,
`src/components/blocks/order/CheckoutItem.svelte`,
`src/components/blocks/order/ProductOrder.svelte`,
`src/lib/__tests__/setDiscount.test.ts`.

## 2. Dead set-UI in `OrderItem.svelte`

**Problem.** `OrderItem.svelte` gained a whole "add related" chip section and a
pending-discount banner (with `onSyncToSet`), plus the props `relatedProducts`,
`onAddRelated`, `relatedDiscounts`, `basketCountByProductId` and `onSyncToSet`.
But the only consumer, `ProductOrder.svelte`, renders the set UI via
`SetPanel`/`SetSiblingCard` instead and passes none of those props — and
`CheckoutItem.svelte` doesn't use `OrderItem` at all. The block is unreachable
and duplicates the set-UI logic that `SetPanel` already implements; it will
drift.

**Fix.** Either delete the dead block and its props, or route `ProductOrder`
through it and delete `SetPanel`/`SetSiblingCard`. Pick one home for the set
UI.

**Affected:** `src/components/blocks/order/OrderItem.svelte`,
`src/components/blocks/order/ProductOrder.svelte`,
`src/components/blocks/order/SetPanel.svelte`,
`src/components/blocks/order/SetSiblingCard.svelte`.

## 3. Stop re-deriving the percent from the multiplier

**Problem.** `src/lib/orderSubmit.ts` (~line 147) and
`src/components/blocks/order/OrderItemPrice.svelte` (~line 59) both recover the
display percent by inverting `calculatePriceForItem`'s formula:
`(1 - discountInfo.discount) / (discountInfo.discountAppliedCount / product.count)`.
That round-trip breaks silently if either side changes, and assumes
`count >= 1`.

**Fix.** Store the raw `percent` in `DiscountInfo` alongside the multiplier,
and display it directly.

**Affected:** `src/lib/priceUtils.ts` (`DiscountInfo`),
`src/lib/orderSubmit.ts`, `src/components/blocks/order/OrderItemPrice.svelte`.

## 4. Make set-discount resolution explicit in the pricing path

**Problem.** `calculatePriceForItem(product, setStatus?)` takes the set status
as an optional argument, so any caller that forgets it silently produces a
non-discounted price. `orderSubmit.ts` already calls `resolveActiveSetDiscount`
twice per item (once in `calculateOrderTotal`, once in `formatProductString`),
and a third call site is one refactor away.

**Fix.** Pass `basket` + `groups` (or a pre-resolved status map) into the
pricing path so resolution happens in exactly one place. Note: overlaps with
item 1 — do together if both are picked.

**Affected:** `src/lib/priceUtils.ts`, `src/lib/orderSubmit.ts`,
`src/components/blocks/order/CheckoutForm.svelte`,
`src/components/blocks/order/CheckoutItem.svelte`,
`src/components/blocks/order/ProductOrder.svelte`,
`src/components/blocks/order/OrderItemPrice.svelte`.

## 5. Consolidate product lookup maps

**Problem.** `slugByProductId` is built independently in
`src/pages/product/[id].astro` and `src/pages/checkout.astro`, and
`src/components/blocks/Header.astro` builds a parallel `productMeta` map
(title + slug) via `getCollection("product")` on every page.

**Fix.** A small shared helper (e.g. in `src/lib/data.ts`) that returns the
product_id → {title, slug} map, used by all three.

**Affected:** `src/lib/data.ts`, `src/pages/product/[id].astro`,
`src/pages/checkout.astro`, `src/components/blocks/Header.astro`.

## 6. `prefillFromParams` regex collision

**Problem.** In `src/lib/orderQueryParams.ts`, a field literally named e.g.
`foo_color` or `foo_custom_color` would be misread as an embroidery colour
param by the `/^(.+?)_(custom_color|color)$/` pattern (field lookup happens
first, but the pattern still matches any name ending in `_color`). The scheme
is now a de-facto public URL API (deep links).

**Fix.** Either resolve embroidery params by known embroidery field names
instead of a free-form prefix regex, or document the reserved suffixes in the
scheme comment so content authors avoid colliding field names.

**Affected:** `src/lib/orderQueryParams.ts`,
`src/lib/__tests__/orderQueryParams.test.ts`.

## 7. `mapProductToSaved` cast

**Problem.** `src/lib/orderStorage.ts` builds the persisted shape with
`as SavedProduct`, so the live→persisted mapping is only checked by zod at
write time, not by the type system.

**Fix.** Type the returned object explicitly (or add a small test that
`mapProductToSaved` output always parses against `savedProductSchema`).

**Affected:** `src/lib/orderStorage.ts`.

## 8. Hardcoded price colors

**Problem.** The branch's price/discount UI uses raw Tailwind palette classes
(`text-red-500`, `bg-green-600`, `text-green-700`, …) in `SetPanel.svelte`,
`SetSiblingCard.svelte`, `OrderItem.svelte`, `OrderItemPrice.svelte`,
`ProductOrder.svelte`, `CheckoutDeals.svelte`. AGENTS.md asks to check the
`@theme` tokens in `src/styles/global.css` before hardcoding colors.

**Fix.** A pass to replace ad-hoc palette classes with `--color-*` tokens
(where a suitable token exists or is worth adding).

**Affected:** the order-block components listed above,
`src/styles/global.css`.
