# Tasks: add set support

## 1. Content model

- [x] 1.1 Add `product_groups` Tina collection (title, optional
      `discount_percent`, member product references) with slugified filenames
      and verify the schema builds with `npm run build:local`
- [x] 1.2 Add `getProductGroups` loader + Astro content collection entry and
      verify the first set (`babafeszek-szett`) loads through both paths
- [x] 1.3 Seed the first set content in `src/content/product_groups/` and
      verify it renders in the Tina admin

## 2. Set discount resolution

- [x] 2.1 Implement per-product best-set resolution (`resolveSetDiscount`:
      biggest percent wins, no stacking) and verify with unit tests in
      `src/lib/__tests__/setDiscount.test.ts`
- [x] 2.2 Implement material matching (exact, order-independent normalized
      material values) and verify with unit tests
- [x] 2.3 Implement global allocation (`allocateSetDiscounts`: one set consumes
      one unit of two different members, each unit at most once) and verify
      with unit tests covering partner caps and dominant-product cases
- [x] 2.4 Implement per-item status (`active` / `pending-partner` /
      `pending-material` with `canSync`) as lookups into the allocation and
      verify with unit tests
- [x] 2.5 Wire the set status into `calculatePriceForItem` (set replaces
      standalone; applied to the allocated fraction; `discountSource` recorded)
      and verify with unit tests for partial allocation and precedence

## 3. Basket

- [x] 3.1 Give basket lines a stable `uuid` and merge duplicate lines (same
      product, fields, materials) and verify with order tests
- [x] 3.2 Add the shared `OrderBasket` store (localStorage + `storage` event +
      `babasarok:basket-changed` cross-island event) and verify islands stay in
      sync (hydration test)
- [x] 3.3 Add the `NavBasket` header island (count badge, link to `/checkout`,
      hidden on the checkout page) and verify on a built page

## 4. Ordering UI

- [x] 4.1 Add `/checkout` page with `CheckoutForm` (lines, deals summary,
      delivery, contact, submit) and verify submission payload in
      `src/lib/__tests__/orderSubmit.test.ts`
- [x] 4.2 Remove the order form from the contact page, keep contact info +
      link to `/checkout`, and verify the page renders (hydration test)
- [x] 4.3 Embed the `ProductOrder` configurator on orderable product detail
      pages (sticky gallery layout) and verify on a built page
- [x] 4.4 Add set status UI (`SetPanel`, `SetSiblingCard`): pending-discount
      hints, "add related" members, one-click material sync, "Szett kedvezmény"
      label, and verify on a built page
- [x] 4.5 Implement deep-link prefill (`prefillFromParams`: fields, `count`,
      `m<i>` material slots, embroidery colors) and verify with
      `src/lib/__tests__/orderQueryParams.test.ts`

## 5. Cross-cutting

- [x] 5.1 Deduplicate duplicate products in the basket and apply discounts
      consistently across line, UI, and email and verify with unit tests
- [x] 5.2 Fix lint/rounding (round item totals; no floating-point totals) and
      verify `npm run lint` and the price unit tests pass
- [x] 5.3 Run the full gate: `npm run check`, `npm run lint`, `npm test`,
      `npm run test:hydration` (against a `dist/` build) and confirm all pass
