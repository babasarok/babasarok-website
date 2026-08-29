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

## What Changes

- Introduce a pure core module boundary (proposed `src/lib/pricing/`) that
  contains the pricing engine, set-discount resolution, field visibility/value
  helpers, material helpers, field-type metadata, the order-domain **data
  types**, and the plain-text order formatter's price section — with **zero**
  imports of Svelte runes, DOM/`window`, Astro, or any browser-only API.
- Split `types.svelte.ts`: move the pure interfaces / discriminated unions
  (e.g. `IProduct`, `Field`, material and price types) into a plain `types.ts`
  in the core; keep only genuinely reactive (`$state`) wrappers in `.svelte.ts`,
  which re-export the pure types.
- Re-point `orderBasket.svelte.ts`, the `src/components/blocks/order/*` islands,
  `orderSubmit.ts`, `orderStorage.ts`, `orderQueryParams.ts`, `data.ts`, the
  Astro order/checkout pages, and the unit tests at the new core module paths.
- Add a guard (lint rule or a small test) that fails if the core imports any
  forbidden runtime (`svelte`, `svelte/*`, `astro:*`, DOM globals), keeping the
  boundary intact.
- **No behavior change:** the charged price, the displayed price, the persisted
  basket shape, the deep-link scheme, and the order email stay byte-for-byte
  identical. The existing Vitest suite is the safety net and must pass with only
  import-path edits.

## Capabilities

None — this is a behavior-preserving refactor (module boundary + import moves);
no specified behavior changes. Declares `skip_specs: true`.

## Impact

- Core (new home): `src/lib/priceUtils.ts`, `src/lib/validation.ts`,
  `src/lib/fieldVisibility.ts`, `src/lib/fieldValue.ts`,
  `src/lib/materialUtils.ts`, `src/lib/productFieldTypes.ts`,
  `src/lib/types.svelte.ts` (type portion), price-formatting helpers from
  `src/lib/orderSubmit.ts`.
- Consumers re-pointed: `src/lib/orderBasket.svelte.ts`,
  `src/lib/orderStorage.ts`, `src/lib/orderSubmit.ts`,
  `src/lib/orderQueryParams.ts`, `src/lib/orderProduct.ts`, `src/lib/data.ts`,
  `src/components/blocks/order/*`, `src/pages/product/[id].astro`,
  `src/pages/checkout.astro`, `src/pages/contact.astro`.
- Tests: `src/lib/__tests__/*` import paths; add the boundary guard.
- Tooling: `eslint.config.ts` (optional import-restriction rule),
  `tsconfig.json` path alias if one is introduced.
- No change to Tina schema, content, styles, or runtime output.
