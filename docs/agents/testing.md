# Test authoring

Read [maintenance.md](maintenance.md) first: it explains why every rule must
be guarded by a check. This document covers _where_ a check lives. Read it
before adding or changing a test or a check, or before shipping behaviour that
needs one.

## The order

Reach for each level in this order, and fall back to the next one only when
the current one genuinely can't do the job:

1. **Types** — runs on every keystroke, covers every call site, can't be
   skipped. Brands, discriminated unions, narrowed props, un-exported helpers,
   `satisfies`, types shared through `packages/`.
2. **Other author-time checks** — ESLint rules, zod schemas for external data,
   build-time integrations (`integrations/`), CI diffs of generated files.
3. **Unit tests** — pure functions, Vitest in `node`.
4. **Component tests** — Svelte islands through `@testing-library/svelte` on
   `jsdom`, Astro components through the
   [Container API](https://docs.astro.build/en/reference/container-reference/).
5. **Backend integration tests** — the shop/admin API against a real Vendure
   server and database, no browser.
6. **E2E tests** — Playwright, site and backend together.

Valid reasons to fall back a level:

- **Can't express it** — e.g. a type can't narrow a computed string, so that
  check is an ESLint rule.
- **Tests the wrong thing** — e.g. asserting on implementation details where
  behaviour matters, or a jsdom test of something that depends on layout.
- **Hard to maintain** — a judgement call, not a rule: discuss it with the
  owner (would a refactor make the earlier level viable?) instead of deciding
  alone, and record the agreed reason in the test file's header comment.

Types win even when using them means refactoring the code under test — see
[Types first](maintenance.md#types-first-even-if-it-costs-a-refactor).

## Test seams, not code twice

A test above the unit level earns its place by covering a **seam**: a place
where two independently changing parts meet and can disagree, which no lower
level sees. Name the seam in the test's header comment. Examples here:

- the site's request shapes vs. the shop API's schema (types/codegen, then a
  contract test);
- our pricing/promotion strategies vs. Vendure's order calculator (line ids,
  quantities, promotion ordering) — backend integration;
- the browser session (bearer token, storage, reload, in-app navigation) vs.
  the active order — E2E;
- a cached page vs. the live catalog (stale data reaching the basket) —
  backend integration for the server verdict, E2E for one journey.

Logic both sides share through `packages/` (e.g. pricing) is one behaviour
with one owner: unit-test it there, don't re-prove it across the seam.

## Designing for the earlier levels

- Keep decisions pure: inject measurements, storage, the current URL and
  network I/O instead of reading `window`/`document`/`localStorage` inside the
  decision. The layer around it then stays thin enough that a component or
  E2E test only proves the wiring.
- Validate anything read from storage, the URL or the network with a zod
  schema — the schema is the author-time check and the parse is unit-testable.
- One behaviour, one owner: if a type or a lower level enforces a rule, don't
  re-test it higher up.
- No coverage targets: every test guards a behaviour that could break.

## What each level is for

| Level       | Good for                                                                          | Not for                                                  |
| ----------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Types       | Illegal states, required props, "only built through X"                            | Runtime data (pair it with a zod schema)                 |
| ESLint      | Patterns types can't see (`.astro`/`.svelte` markup, forbidden imports)           | Anything a type could express                            |
| Unit        | Pure decisions, parsing, formatting, allocation, pricing                          | DOM wiring, layout, Vendure behaviour                    |
| Component   | Rendered output, event wiring, island state transitions                           | Layout/scroll (jsdom has none), routing, real navigation |
| Integration | Our Vendure plugins inside Vendure's order flow, migrations, seeding, emails      | Pure logic a unit test covers; anything in the browser   |
| E2E         | Real browser behaviour: islands hydrating, sessions, navigation, cross-page flows | Anything a cheaper level can already prove               |

## Where tests live

| Kind                 | Location / naming                                                         | Run with                      |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Site/package unit    | next to the code, `src/**/*.test.ts`, `packages/*/src/**/*.test.ts`       | `pnpm test`                   |
| Backend unit         | next to the code, `backend/src/**/*.test.ts`                              | `pnpm -C backend test`        |
| Component            | next to the component, `*.test.ts` + `// @vitest-environment jsdom`       | `pnpm test`                   |
| Backend integration  | not set up yet — agree the harness with the owner first                   | —                             |
| Site E2E (hydration) | `tests/*.spec.ts`                                                         | `pnpm run test:hydration`     |
| Dashboard E2E        | `tests/dashboard/*.spec.ts`, shared steps in `tests/dashboard/helpers.ts` | `pnpm run test:dashboard-e2e` |
| Checkout E2E         | `tests/checkout/*.spec.ts`, page actions in `tests/checkout/pages.ts`     | `pnpm run test:checkout-e2e`  |

Playwright only collects `*.spec.ts`; `*.test.ts` belongs to Vitest.

## Writing E2E tests

- **Specs read as a sequence of helper calls.** Locators, `page.evaluate`,
  routing and request bookkeeping live in the suite's helpers module (page
  objects when a page gets several actions), not in the spec. Check the
  helpers for an existing action or assertion before adding one.
- **Locators prefer `getByRole` / `getByTestId`.**
- **Environment-dependent UI comes from the environment**, never from
  assumptions (e.g. the dashboard UI language is English while the content
  language is Hungarian).
- **Prove the test can fail**: run a new regression check once against the
  old code and see it go red.
- **Cover the interaction paths a user takes**, not only direct URL loads:
  in-app navigation, reload, back, a second tab.

### Running them

- **Hydration tests** need a `dist/` build (`pnpm run build:local`). Their
  webServer reuses an already-running server on the port, so a running
  `astro dev` is tested instead of the dist — a stale-HMR dev server yields
  spurious island failures, so rule out the server before debugging the test.
- **Dashboard E2E** needs a `dist/` build and the local postgres container.
  It boots the Vendure API on :4000 (`pnpm -C backend run e2e:server`, fresh
  `babasarok_e2e` database, fixed seed in `backend/e2e.env`) and the built site
  on :4100 — stop the dev backend first, the ports must be free; the servers
  are never reused.

## Tooling

Install a testing dependency **on demand**, the first time a test actually
needs it — don't pre-install. Known choices:

- Svelte component tests: `@testing-library/svelte` + `jsdom`.
- Astro component tests: `experimental_AstroContainer` ships with `astro`.
- Backend integration: `@vendure/testing` (Vendure's own test server).
