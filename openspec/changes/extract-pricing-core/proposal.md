# Change: extract a pure pricing & validation core

## Why

The pricing, discount, and validation logic (`priceUtils`, `validation`,
`fieldVisibility`, `fieldValue`, `materialUtils`, `productFieldTypes` and the
order-domain types) currently runs only in the browser, where the computed
price is trusted because the order is merely emailed via Web3Forms. Any future
backend (a Worker/Stripe checkout, or a commerce platform that prices
made-to-order line items) must recompute the **same** price and re-run the
**same** validation server-side, or totals and rules will drift. Today that
logic is coupled to Svelte-flavoured modules (`*.svelte.ts`, runes) and cannot
be imported outside the Svelte/browser build. This change isolates a pure,
dependency-free core so both the browser (display) and a server (authoritative
price + validation) can share one implementation. It is the single
highest-leverage, platform-agnostic prep step for the e-commerce migration and
is valuable even if that migration is deferred.

## Status update (directory reorganization landed)

A behavior-preserving lib reorganization has already created the
`src/lib/pricing/` module home and moved the members into it:
`priceUtils.ts` was split into `pricing/price.ts` + `pricing/setDiscount.ts`;
the product-configuration domain (`validation`, `fieldVisibility`, `fieldValue`,
`materialUtils` → `materials`, `productFieldTypes` → `fieldTypes`) moved into a
sibling `product/` folder that `pricing/` imports. Every consumer (islands,
pages, tests, `tina/`, `data.ts`) was re-pointed. `npm run check`, `npm test`
(130 passing) and `svelte-check` are green with no expected-value changes.

That closes the mechanical _move + re-point_ portion of this change. What
remains is the part that actually makes the core **pure and runtime-agnostic**:
the `product/` (and thus `pricing/`) modules still import `../types.svelte` (a
`.svelte.ts` file that in turn imports `astro:content` via `data.ts`), so the
boundary is not yet enforceable off the browser.

## What Changes (remaining)

- Make the `src/lib/product/` + `src/lib/pricing/` core a **pure boundary** with
  **zero** imports of Svelte runes, DOM/`window`, Astro, or any browser-only
  API. Today this fails only through the `types.svelte.ts` → `data.ts`
  (`astro:content`) chain.
- Split `types.svelte.ts`: move the pure interfaces / discriminated unions
  (e.g. `IProduct`, `Field`, material and price types) into a plain `types.ts`
  in the core and decouple them from the Tina/`data.ts`-derived types so the
  core no longer pulls in `astro:content`; keep any genuinely reactive
  (`$state`) wrapper in a `.svelte.ts` that re-exports the pure types.
- Lift the pure price/field/material formatters out of `order/submit.ts` into
  `pricing/format.ts`, leaving only the `fetch` + `FormData` transport behind.
- Add a `pricing/index.ts` barrel for the public API (optional `@pricing/*`
  path alias in place of the current `@/lib/pricing/*` imports).
- Add a guard (lint rule or a small test) that fails if the core imports any
  forbidden runtime (`svelte`, `svelte/*`, `astro:*`, DOM globals), keeping the
  boundary intact.
- **No behavior change:** the charged price, the displayed price, the persisted
  basket shape, the deep-link scheme, and the order email stay byte-for-byte
  identical. The existing Vitest suite is the safety net.

## Capabilities

None — this is a behavior-preserving refactor (module boundary + import moves);
no specified behavior changes. Declares `skip_specs: true`.

## Impact

- Core (already relocated): `src/lib/pricing/price.ts`,
  `src/lib/pricing/setDiscount.ts`, and the product-config domain in
  `src/lib/product/` (`validation.ts`, `fieldVisibility.ts`, `fieldValue.ts`,
  `materials.ts`, `fieldTypes.ts`).
- Remaining core work: split `src/lib/types.svelte.ts` into a pure
  `src/lib/pricing/types.ts` decoupled from `data.ts`; lift price-formatting
  helpers from `src/lib/order/submit.ts` into `src/lib/pricing/format.ts`; add
  `src/lib/pricing/index.ts`.
- Consumers (already re-pointed): `src/lib/order/*`, `src/lib/data.ts`,
  `src/components/blocks/order/*`, `src/pages/product/[id].astro`,
  `src/pages/checkout.astro`, `src/pages/contact.astro`, `src/lib/__tests__/*`,
  `tina/collections/product.ts`, `src/content.config.ts`, `astro.config.ts`.
- Tests: add the boundary guard.
- Tooling: `eslint.config.ts` (import-restriction rule),
  `tsconfig.json` path alias if one is introduced.
- No change to Tina schema, content, styles, or runtime output.
