# Change: set-support cleanup

## Why

An architectural review of the set-support work (the `add-set-support` change)
found maintainability problems: an unreachable set-UI block that will drift, a
discount percent re-derived from a multiplier that breaks silently on a
round-trip, an optional argument that silently produces non-discounted prices,
duplicated product-lookup maps, a deep-link regex that can misread field names,
a type-unsafe storage mapping, and hardcoded Tailwind palette colors against
the `@theme` token convention. All are behavior-preserving cleanups, to be done
alongside or right after the set-support merge.

## What Changes

- Delete the dead set-UI block in `OrderItem.svelte` (unreachable "add related"
  chips, pending-discount banner, and their props); `SetPanel`/`SetSiblingCard`
  remain the single home for set UI.
- Store the raw discount `percent` in `DiscountInfo` next to the multiplier so
  the order email and the price display stop re-deriving it by inverting
  `calculatePriceForItem`'s formula.
- Make set-discount resolution explicit in the pricing path so a caller cannot
  silently omit the set status and produce a non-discounted price.
- Consolidate the product id → {title, slug} lookup maps built independently in
  `product/[id].astro`, `checkout.astro`, and `Header.astro` into one shared
  helper.
- Make the deep-link embroidery-color param parsing robust against product
  fields literally named `*_color`/`*_custom_color`.
- Type the `mapProductToSaved` output explicitly instead of an `as SavedProduct`
  cast checked only by zod at write time.
- Replace ad-hoc Tailwind palette classes in the order-block price/discount UI
  with `--color-*` tokens from `src/styles/global.css`.

## Capabilities

None — pure implementation cleanup; no specified behavior changes. (Declares
`skip_specs: true`.)

## Impact

- Domain logic: `src/lib/priceUtils.ts`, `src/lib/orderSubmit.ts`,
  `src/lib/orderStorage.ts`, `src/lib/orderQueryParams.ts`, `src/lib/data.ts`
- Order-block UI: `OrderItem.svelte`, `OrderItemPrice.svelte`,
  `ProductOrder.svelte`, `SetPanel.svelte`, `SetSiblingCard.svelte`,
  `CheckoutForm.svelte`, `CheckoutItem.svelte`, `CheckoutDeals.svelte`
- Pages/layout: `src/pages/product/[id].astro`, `src/pages/checkout.astro`,
  `src/components/blocks/Header.astro`
- Styling: `src/styles/global.css` (token additions where none exists)
- Tests: `src/lib/__tests__/orderQueryParams.test.ts`, storage and price tests
