# Tasks: rearchitect set discounts

Each core task is TDD-friendly: update `setDiscount.test.ts` for the new
semantics first, then implement until green. Every task ends with the usual
verification (`npm run check`, `npm test`, `npm run lint`).

## 1. Material matching (subset rule)

- [ ] 1.1 Rewrite `normalizeMaterialValues` to expose a `Map<material_id,
      {colors, custom_color}>` (or equivalent) and add a `materialsSubset(small,
      large)` helper; verify with new unit tests for containment
- [ ] 1.2 Redefine `materialsMatch(a, b)` as `subset(a,b) || subset(b,a)`;
      update `materialsMatch` tests: subset matches, equal-count still exact,
      non-subset (blanket fabric absent from nest) does not match — verify
      `npm test` for `materialsMatch`

## 2. Per-unit allocation engine

- [ ] 2.1 Introduce the instance type (`{ setTitle, percent, members: { uuid,
      count }[] }`) and change `allocateSetDiscounts` to return both the per-item
      `SetDiscountStatus` map and the ordered instance list
- [ ] 2.2 Implement per-unit, biggest-percent-first allocation: sort sets by
      percent desc; for each set repeatedly build a maximal, pairwise-compatible
      instance (≥2 distinct members, one unit each, basket order), consuming
      units globally — verify the maximal, leftover-cap, repeated-instance,
      partner-cap, and biggest-percent-first scenarios from the spec as tests
- [ ] 2.3 Recompute per-item `active` / `pending-partner` / `pending-material`
      (+`canSync`) statuses from the new allocation and instances — verify the
      pending-state scenarios as tests
- [ ] 2.4 Update `resolveActiveSetDiscount(s)` and `calculatePriceForItem` to
      derive each line's discounted unit fraction from the instances; verify the
      count-2-across-two-sets caveat and a priced-basket test

## 3. Basket-level display

- [ ] 3.1 Compute instances once in `CheckoutForm.svelte` and render a "set
      discounts" section listing each instance (title, `-percent%`, member line
      chips with unit counts); verify in the running checkout UI
- [ ] 3.2 Remove the per-line discount label/props from `CheckoutItem.svelte`
      and refocus `CheckoutDeals.svelte` on pending opportunities + the active
      instance list; verify `npm run check`
- [ ] 3.3 Re-express `SetPanel.svelte` / `ProductOrder.svelte` set status against
      instances, keeping "add related" candidates and pending-partner /
      pending-material (one-click sync); verify on a product page

## 4. Submission

- [ ] 4.1 In `orderSubmit.ts`, drop the per-item discount-source line and add a
      basket-level set-discount summary derived from the instances; verify the
      order-submit formatter tests

## 5. Verify end to end

- [ ] 5.1 Run `npm run check`, `npm test`, `npm run lint`, `npm run lint:style`
      — all green with the rewritten expectations
- [ ] 5.2 Build and run `npm run test:hydration` to confirm the order/checkout
      islands hydrate and price identically to the allocation
- [ ] 5.3 Run `npx openspec validate rearchitect-set-discounts --strict` and fix
      any spec/delta issues
