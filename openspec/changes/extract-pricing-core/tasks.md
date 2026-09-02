# Tasks: extract a pure pricing & validation core

All items are behavior-preserving; each ends with the usual verification
(`npm run check`, `npm test`, `npm run lint`). The existing Vitest suite must
pass with only import-path edits — no expected-value changes.

> **Note:** the directory reorganization already landed the `src/lib/pricing/`
> module home, the `priceUtils` → `price.ts` + `setDiscount.ts` split, the moves
> of `validation`/`fieldVisibility`/`fieldValue`/`materials`/`fieldTypes`, and
> re-pointed every consumer. Those items are checked off below. The remaining
> work is the actual **purity boundary**: decoupling the core types from
> `data.ts`/`astro:content`, the formatter lift, the barrel, and the guard.

## 1. Establish the core boundary

- [x] 1.1 Create the `src/lib/pricing/` module home (folder exists; members
      moved in). Consumers use `@/lib/pricing/*` imports — a dedicated
      `@pricing/*` alias is still optional/pending.
- [ ] 1.2 Audit the core modules (`pricing/price`, `pricing/setDiscount`,
      `product/validation`, `product/fieldVisibility`, `product/fieldValue`,
      `product/materials`, `product/fieldTypes`, plus the types they import) for
      any `svelte`/`svelte/*`, `astro:*`, `$app/*`, or DOM
      (`window`/`document`/`localStorage`) usage; the known offender is the
      `../types.svelte` → `data.ts` (`astro:content`) chain

## 2. Split the domain types (the main remaining boundary work)

- [ ] 2.1 Move the pure interfaces / discriminated unions from
      `types.svelte.ts` into `src/lib/pricing/types.ts`, decoupled from the
      Tina/`data.ts`-derived types so the core no longer imports `astro:content`
- [ ] 2.2 If any `$state` reactive wrapper remains, keep it in a `.svelte.ts`
      that re-exports the pure types; verify with `npm run check`

## 3. Move pricing, discounts, validation, helpers into core

- [x] 3.1 `priceUtils.ts` split into `pricing/price.ts` (price calc +
      length-based) and `pricing/setDiscount.ts` (set-discount resolution)
- [x] 3.2 `validation.ts`, `fieldVisibility.ts`, `fieldValue.ts`,
      `materialUtils.ts` (→ `product/materials.ts`), `productFieldTypes.ts`
      (→ `product/fieldTypes.ts`) moved into `src/lib/product/` (the
      product-config domain that `pricing/` imports) with core-relative imports
- [ ] 3.3 Lift the pure price/field/material formatters out of `order/submit.ts`
      into `pricing/format.ts`; leave `buildOrderFormData`/`submitOrder`
      (the `fetch` + `FormData`) in `order/submit.ts`, importing from core
- [ ] 3.4 Add a `pricing/index.ts` barrel re-exporting the public API

## 4. Re-point consumers

- [x] 4.1 Imports updated in `order/basket.svelte.ts`, `order/storage.ts`,
      `order/submit.ts`, `order/queryParams.ts`, `order/product.ts`, `data.ts`
- [x] 4.2 Imports updated in `src/components/blocks/order/*`
- [x] 4.3 Imports updated in `src/pages/product/[id].astro`,
      `src/pages/checkout.astro`, `src/pages/contact.astro`
- [x] 4.4 Imports updated in `src/lib/__tests__/*` (plus `tina/collections/`,
      `src/content.config.ts`, `astro.config.ts`)

## 5. Enforce the boundary

- [ ] 5.1 Add an ESLint `no-restricted-imports` rule scoped to
      `src/lib/pricing/**` and `src/lib/product/**` forbidding `svelte`,
      `svelte/*`, `astro:*`, `$app/*` and DOM globals
- [ ] 5.2 (Optional) Add a Vitest smoke test that imports the core barrel under
      the plain Node environment and asserts it evaluates without a Svelte
      runtime

## 6. Verify no behavior drift

- [ ] 6.1 Run `npm run check`, `npm test`, `npm run lint`, `npm run lint:style`
      — all green with unchanged test expectations
- [ ] 6.2 Build and run the hydration test (`npm run test:hydration`) to confirm
      the order/checkout islands still hydrate and price identically
