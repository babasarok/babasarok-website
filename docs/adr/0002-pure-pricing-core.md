# ADR 0002: Pure, runtime-agnostic pricing & validation core

- **Status:** accepted (partially implemented — see open tasks)
- **Date:** 2026-08-31

## Context

All pricing, discount, and order-validation logic originally ran only in the
browser (Svelte-flavoured modules, runes). That was fine while orders were
merely emailed (ADR 0001), but any future backend (a Worker, Stripe checkout,
or a commerce platform pricing made-to-order line items) must recompute the
**same** price and re-run the **same** validation server-side, or totals and
rules will drift. Logic coupled to the Svelte build cannot be imported into a
Node/Worker runtime.

## Decision

Isolate a pure core spanning `src/lib/product/` (field model, materials,
validation) and `src/lib/pricing/` (price, set discounts, which imports
`product/`), with these invariants:

1. Core modules import only other core modules, standard TS/JS, and
   Zod — never `svelte`/`svelte/*`, `astro:*`/`$app/*`, or DOM globals
   (`window`, `document`, `localStorage`).
2. `src/lib/pricing/types.ts` holds the pure interfaces/discriminated unions,
   decoupled from the Tina/`data.ts`-derived types; any reactive (`$state`)
   wrapper stays in a `.svelte.ts` that re-exports the pure types.
3. Pure price/field/material formatters live in `pricing/format.ts`; only the
   `fetch` + `FormData` transport stays in `order/submit.ts`.
4. The boundary is enforced by an ESLint `no-restricted-imports` rule scoped
   to the core folders (a plain-Node smoke test is an optional backstop).

The change is behavior-preserving: charged price, displayed price, persisted
basket shape, deep-link scheme, and order email stay byte-for-byte identical;
the Vitest suite is the safety net.

## Consequences

- A server runtime can import the core verbatim; server-side pricing is a
  later change, not a rewrite.
- The directory reorganization (splitting `priceUtils` into
  `pricing/price.ts` + `pricing/setDiscount.ts`, moving the product-config
  domain into `src/lib/product/`, re-pointing all consumers) has landed.
  Remaining work: splitting `types.svelte.ts`, lifting formatters into
  `pricing/format.ts`, the barrel, and the ESLint guard.
- Import shims at old paths were rejected in favor of a path-alias + single
  import sweep (shims are DRY debt that tends to linger).
- Hidden Svelte/DOM coupling is a real risk at extraction time; the lint guard
  is what keeps the boundary from silently regressing.
