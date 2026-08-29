# Tasks: extract a pure pricing & validation core

All items are behavior-preserving; each ends with the usual verification
(`npm run check`, `npm test`, `npm run lint`). The existing Vitest suite must
pass with only import-path edits — no expected-value changes.

## 1. Establish the core boundary

- [ ] 1.1 Create the `src/lib/pricing/` module home and add a `@pricing/*` (or
      `@core/*`) path alias in `tsconfig.json`
- [ ] 1.2 Audit the target modules (`priceUtils`, `validation`,
      `fieldVisibility`, `fieldValue`, `materialUtils`, `productFieldTypes`,
      `types.svelte.ts`, price formatters in `orderSubmit.ts`) for any
      `svelte`/`svelte/*`, `astro:*`, `$app/*`, or DOM (`window`/`document`/
      `localStorage`) usage; list what must move out

## 2. Split the domain types

- [ ] 2.1 Move the pure interfaces / discriminated unions from
      `types.svelte.ts` into `src/lib/pricing/types.ts`
- [ ] 2.2 If any `$state` reactive wrapper remains, keep it in a `.svelte.ts`
      that re-exports the pure types; verify with `npm run check`

## 3. Move pricing, discounts, validation, helpers into core

- [ ] 3.1 Move `priceUtils.ts` (price calc + length-based) → `pricing/price.ts`
      and the set-discount functions → `pricing/discounts.ts`
- [ ] 3.2 Move `validation.ts`, `fieldVisibility.ts`, `fieldValue.ts`,
      `materialUtils.ts`, `productFieldTypes.ts` into the core, updating their
      internal imports to core-relative
- [ ] 3.3 Lift the pure price/field/material formatters out of `orderSubmit.ts`
      into `pricing/format.ts`; leave `buildOrderFormData`/`submitOrder`
      (the `fetch` + `FormData`) in `orderSubmit.ts`, importing from core
- [ ] 3.4 Add a `pricing/index.ts` barrel re-exporting the public API

## 4. Re-point consumers

- [ ] 4.1 Update imports in `orderBasket.svelte.ts`, `orderStorage.ts`,
      `orderSubmit.ts`, `orderQueryParams.ts`, `orderProduct.ts`, `data.ts`
- [ ] 4.2 Update imports in `src/components/blocks/order/*`
- [ ] 4.3 Update imports in `src/pages/product/[id].astro`,
      `src/pages/checkout.astro`, `src/pages/contact.astro`
- [ ] 4.4 Update imports in `src/lib/__tests__/*`

## 5. Enforce the boundary

- [ ] 5.1 Add an ESLint `no-restricted-imports` rule scoped to
      `src/lib/pricing/**` forbidding `svelte`, `svelte/*`, `astro:*`, `$app/*`
      and DOM globals
- [ ] 5.2 (Optional) Add a Vitest smoke test that imports the core barrel under
      the plain Node environment and asserts it evaluates without a Svelte
      runtime

## 6. Verify no behavior drift

- [ ] 6.1 Run `npm run check`, `npm test`, `npm run lint`, `npm run lint:style`
      — all green with unchanged test expectations
- [ ] 6.2 Build and run the hydration test (`npm run test:hydration`) to confirm
      the order/checkout islands still hydrate and price identically
