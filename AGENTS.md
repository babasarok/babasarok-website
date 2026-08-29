# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Core Values

These are listed in priority order. When values conflict, prefer the one higher up.

1. **Maintainability** — Write code that is easy to read, reason about, and change
   later. Clarity beats cleverness. Optimise for the next person (or agent) who
   has to touch this code.

2. **Composability / Modularity** — Build small, focused, reusable pieces.
   Prefer composing components/utilities over duplicating or growing monoliths.
   A new shared visual pattern belongs in a small reusable component, not copied
   inline.

3. **Standardised over bespoke** — Reach for standard tooling and well-supported
   libraries before writing custom code. This includes preferring **Tailwind
   utilities over hand-written CSS**. Less bespoke code, more conventions.

4. **Build-time & no-JS first** — Prefer solutions that run at build time and ship
   no client-side JavaScript. Reach for runtime JS / client hydration only when a
   build-time or no-JS approach genuinely cannot do the job.

5. **No CSS in global scope** — Keep styling local (Tailwind utilities, scoped
   `<style>`, or a reusable component). Only add to global CSS when it is truly
   unavoidable, and treat it as a last resort.

6. **DRY** — Don't repeat yourself. Factor out repetition into shared components
   and utilities — but not at the expense of the values above it.

## Applying the values

- **Styling decisions:** Tailwind utility first → scoped component style →
  (last resort) global CSS. Before hardcoding a color, check the `@theme` block in
  [src/styles/global.css](src/styles/global.css) and use/add a `--color-*` token.
- **New shared UI:** create a small reusable component (see
  [src/components/ui/](src/components/ui/)) rather than duplicating markup or adding
  global utilities.
- **Rendering:** prefer Astro components and build-time rendering; only add a Svelte
  island / client hydration when interactivity actually requires it.

## Tooling

- **Framework:** Astro 6 + Svelte islands, Tailwind CSS 4, TinaCMS.
- **Dev:** `npm run dev`
- **Type/check:** `npm run check` (`astro check` + `sv check`)
- **Lint:** `npm run lint` · **Styles:** `npm run lint:style`
- **Format:** `npm run format` (Prettier)
- **Unit tests:** `npm test` (Vitest, `vitest run`) · watch with `npm run test:watch`.
  Specs live in `src/**/*.test.ts` (e.g. the order-form logic in
  [src/lib/**tests**/](src/lib/__tests__/)); fast pure-function tests, no build needed.
- **Hydration tests:** `npm run test:hydration` (Playwright; needs a `dist/` build).
- **Specs (OpenSpec):** spec-driven development lives in [openspec/](openspec/).
  Baseline behavior is in [openspec/specs/](openspec/specs/) (one capability
  folder per spec: `product-catalog`, `order-pricing`, `order-basket`,
  `order-submission`); in-flight work is in
  [openspec/changes/](openspec/changes/). Read the relevant spec before
  touching its behavior. Propose changes with `/opsx-propose` (opencode) or the
  CLI (`npx openspec ...`); validate with `npx openspec validate --all`.

## Gotchas

- **Install with `npm ci --ignore-scripts`** (or `npm install --ignore-scripts`).
  Plain `npm ci` aborts on `sharp`'s install script (it falls through to a
  from-source build that fails with `Please add node-addon-api`).
- **This repo is npm-managed.** Do not use pnpm/yarn.
