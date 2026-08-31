# Design: extract a pure pricing & validation core

## Context

The order-domain logic is sound; the problem is **reachability**, not
correctness. Everything below is behavior-preserving: identical computed price,
identical validation outcomes, identical persisted basket, identical deep-link
scheme, identical order email. The single new constraint is that the extracted
core must be importable by a non-Svelte, non-browser runtime (Node/Worker) so a
future backend can reuse it verbatim. The existing Vitest suite in
`src/lib/__tests__/` is the safety net and should pass with only import-path
changes.

Guiding value (AGENTS.md): _standardised over bespoke_ and _composability_ — one
shared implementation, not a client copy and a server copy that drift.

## 1. The boundary: what is "pure core" vs. what stays out

**Problem.** The pricing/validation functions are mostly pure already, but they
import types from `types.svelte.ts`, and `.svelte.ts` modules are compiled by
the Svelte toolchain (runes such as `$state`). Importing them from plain Node or
a Worker bundle pulls in the Svelte runtime, which breaks the build off the
browser.

**Fix.** Define a folder (proposed `src/lib/pricing/`) whose modules import only:
other core modules, standard TS/JS, and Zod (already a runtime-agnostic dep). It
must NOT import `svelte`, `svelte/*`, `astro:*`, `$app/*`, or touch DOM globals
(`window`, `document`, `localStorage`).

Core members (moved or re-homed). Names marked ✓ already landed via the lib
reorganization; the rest is the remaining purity work:

```
src/lib/pricing/
  types.ts            <- pure interfaces from types.svelte.ts (IProduct, Field, ...)
  fieldTypes.ts       <- productFieldTypes.ts                             ✓
  fieldVisibility.ts  <- fieldVisibility.ts                              ✓
  fieldValue.ts       <- fieldValue.ts                                   ✓
  materials.ts        <- materialUtils.ts                                ✓
  price.ts            <- priceUtils.ts (calculatePriceForItem, length-based)  ✓
  setDiscount.ts      <- set-discount fns (allocateSetDiscounts, materialsMatch,
                         canSyncMaterials, resolveSetDiscountStatus, ...)   ✓
  validation.ts       <- validation.ts (sanitizeItem, validateItem, isItemValid)  ✓
  format.ts           <- price-string helpers lifted from order/submit.ts
  index.ts            <- barrel re-export
```

(Exact filenames/splits are a detail; the invariant is the import boundary, not
the tree shape.)

**Stays out of core (browser/reactive/IO):** `order/basket.svelte.ts` (runes +
`localStorage` + custom events), `order/storage.ts` (localStorage envelope),
`data.ts` (Tina client / build-time loaders), `order/submit.ts` (the `fetch` to
Web3Forms and `FormData` assembly — but its pure formatting moves into
`format.ts`), all `*.svelte` components, and the Astro pages.

## 2. Splitting `types.svelte.ts`

**Problem.** The file mixes pure type declarations with any reactive state
helpers under a `.svelte.ts` extension, so pure types are only reachable through
the Svelte build.

**Fix.** Move the pure interfaces / discriminated unions into
`src/lib/pricing/types.ts`. If any runtime reactive wrapper (`$state`) lives in
the same file, keep just that in a `.svelte.ts` that re-exports the pure types
for backward-compatible imports. Type-only interfaces have no runtime, so this
is a mechanical move; verify with `npm run check` (astro-check + sv-check).

## 3. `orderSubmit.ts`: separate pricing/format from transport

**Problem.** `orderSubmit.ts` interleaves pure formatting (`formatProductString`,
`formatFieldValue`, `formatMaterialLine`, `fieldIndentDepth`, price lines) with
side-effecting transport (`buildOrderFormData`, `submitOrder`'s `fetch`).

**Fix.** Move the pure formatters into `pricing/format.ts` (imported by the core
and re-imported by `orderSubmit.ts`); leave `buildOrderFormData` and
`submitOrder` in place. A backend can then render the same human-readable order
lines without pulling in `fetch`/`FormData` specifics.

## 4. Enforcing the boundary

**Problem.** Without a guard, a future edit can quietly re-introduce a
`svelte`/DOM import into the core and silently re-break server reuse.

**Fix (pick one; lint preferred):**

- ESLint `no-restricted-imports` (or `import/no-restricted-paths`) scoped to
  `src/lib/pricing/**` forbidding `svelte`, `svelte/*`, `astro:*`, `$app/*`; or
- a tiny Vitest test that imports the core barrel and asserts it evaluates under
  the plain Node environment (no Svelte runtime), plus a source scan for
  forbidden specifiers.

Recommendation: the ESLint rule (static, no runtime cost, matches
_standardised over bespoke_), optionally backed by the import smoke test.

## 5. Import churn / compatibility

To keep the diff reviewable and avoid a big-bang rename, either:

- **(a)** add a `@pricing/*` (or `@core/*`) tsconfig path alias and update
  imports to it; or
- **(b)** keep thin re-export shims at the old `src/lib/<name>.ts` paths that
  `export * from "./pricing/<name>"`, then migrate consumers incrementally.

Recommendation: **(a)** a path alias plus a single sweep of imports — shims are
DRY debt that tend to linger. Do the sweep in one commit so `npm run check`
gates it.

## Non-goals

- No pricing/discount/validation behavior change of any kind.
- No new backend, no Stripe/Medusa/Shopify wiring — this only makes the core
  _reusable_; consuming it server-side is a later change.
- No change to Tina schema, content files, styles, or the persisted basket
  shape.

## Risks

- **Hidden Svelte/DOM coupling** surfaced only at extract time (e.g. a util that
  reads `window`). Mitigation: the boundary guard catches it immediately; move
  the offending IO out of core.
- **Import-path breakage** across many files. Mitigation: single sweep gated by
  `npm run check` + full `npm test`; behavior tests unchanged.
- **`.svelte.ts` type move** accidentally dropping a runtime helper. Mitigation:
  sv-check + the existing hydration test.
