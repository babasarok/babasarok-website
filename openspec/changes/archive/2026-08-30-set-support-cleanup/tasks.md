# Tasks: set-support cleanup

All items are behavior-preserving; each ends with the usual verification
(`npm run check`, `npm test`, `npm run lint`).

## 1. Single home for the set UI

- [x] 1.1 Delete the dead set-UI block (chips, pending-discount banner,
      `onSyncToSet`) and its props from `OrderItem.svelte`; verify
      `ProductOrder`/`SetPanel`/`SetSiblingCard` still render the set UI and
      the check passes

## 2. Raw percent in `DiscountInfo`

- [x] 2.1 Add `percent` to `DiscountInfo` (set and standalone) and set it at
      every construction site
- [x] 2.2 Display `percent` directly in `OrderItemPrice.svelte` and use it in
      `orderSubmit.ts` instead of inverting the multiplier; verify with the
      existing price/email unit tests (also fixed the same inversion in
      `CheckoutItem.svelte`)

## 3. Explicit set-discount resolution in the pricing path

- [x] 3.1 Thread the basket allocation (or a pre-resolved status map) into
      `calculatePriceForItem` so callers cannot omit it (added
      `resolveActiveSetDiscounts(basket, groups)` helper; threaded the
      pre-resolved map through `calculateOrderTotal`/`buildOrderFormData`)
- [x] 3.2 Remove the duplicate `resolveActiveSetDiscount` calls in
      `orderSubmit.ts` (`calculateOrderTotal` + `formatProductString`); verify
      totals and email strings are unchanged via unit tests

## 4. Consolidate product lookup maps

- [x] 4.1 Add a shared product id → {title, slug} helper (e.g. in
      `src/lib/data.ts`)
- [x] 4.2 Use it in `product/[id].astro`, `checkout.astro`, and
      `Header.astro`; verify pages build and the nav basket still resolves
      titles

## 5. Deep-link embroidery param robustness

- [x] 5.2 Add a regression test for a field literally named `*_color` in
      `src/lib/__tests__/orderQueryParams.test.ts`

## 6. Type-safe saved-product mapping

- [x] 6.1 Type `mapProductToSaved`'s return explicitly (or add a test that its
      output parses against `savedProductSchema`)

## 7. `@theme` tokens for price colors

- [x] 7.1 Replace ad-hoc Tailwind palette classes in the order-block UI with
      `--color-*` tokens, adding tokens to `src/styles/global.css` where
      needed; verify with `npm run lint:style`
