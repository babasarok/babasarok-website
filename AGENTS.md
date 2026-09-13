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
   utilities over hand-written CSS**, and **native HTML elements and native JS
   features/APIs** wherever possible — e.g. a `<dialog>` for an overlay, not a
   hand-rolled div. Less bespoke code, more conventions. Look them up on MDN if needed.

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
- **No sidestepping type-checking:** no type casts, non-null assertions, or
  index-signature prop bags (`[key: string]: unknown`) that silence the compiler.
  When a component should accept HTML element attributes, extend its props
  interface with the element's attribute types instead of an open index
  signature.
- **No silencing lint/check warnings:** fix eslint and svelte-check warnings
  (including a11y ones) properly. `eslint-disable` / `svelte-ignore` comments
  are a last resort and must carry a concrete justification for why the rule
  cannot be met.

## UI development

- **Verify every UI change in a live browser before calling it done.** Confirm
  with screenshots and measured geometry (`getBoundingClientRect`,
  `getComputedStyle` via `browser_eval`) — never trust assumed CSS behavior.
- **Browser:** the `opencode-chrome-devtools` plugin drives Chromium over CDP.
  Start it detached: `chromium --remote-debugging-port=9222
--user-data-dir=/tmp/chrome-cdp` (add `--window-size=390,844` for a mobile
  viewport), then `browser_navigate` to a `dev`/`preview` URL. Note the tools
  have no key-press — real-key behaviors (e.g. Escape on `<dialog>`) verify
  the handler side (e.g. the `close` event) instead.
- **Browser defaults bite:** the UA stylesheet caps `<dialog>` at
  `max-width/max-height: calc(100% - 42px)` (override with `max-w-none
max-h-none`); `width: 100%` on a `position: fixed` element stops short of
  the scrollbar (use `w-screen`); any transformed ancestor becomes the
  containing block for fixed descendants.
- **Animate visible elements only.** Svelte transitions start at mount; a
  transition on an element inside a `display:none` ancestor (e.g. a closed
  `<dialog>`) measures wrong and fires twice. Open the dialog with
  `showModal()` in a `$effect.pre` so content mounts after it is visible.
- **Verifying animations:** patch `Element.prototype.animate` in the page to
  record keyframes/durations while driving the UI, and screenshot mid-flight.

## Tooling

- **Framework:** Astro 6 + Svelte islands, Tailwind CSS 4, TinaCMS.
- **Dev:** `npm run dev`
- **Build:** `npm run build:local` (skips the TinaCMS cloud schema check). Plain
  `npm run build` fails whenever the local CMS schema is ahead of the pushed
  GitHub schema, so use `build:local` for local verification. It fails while a
  `tinacms dev` server is running (datalayer port 9000); pass
  `--datalayer-port <other>` to the `tinacms build` invocation in that case.
- **Type/check:** `npm run check` (`astro check` + `sv check`)
- **Lint:** `npm run lint` · **Styles:** `npm run lint:style`
- **Format:** `npm run format` (Prettier)
- **Unit tests:** `npm test` (Vitest, `vitest run`) · watch with `npm run test:watch`.
  Specs live in `src/**/*.test.ts` (e.g. the order-form logic in
  [src/lib/**tests**/](src/lib/__tests__/)); fast pure-function tests, no build needed.
- **Hydration tests:** `npm run test:hydration` (Playwright; needs a `dist/` build
  via `npm run build:local`). Its webServer reuses an already-running server on
  port 4321, so a running `astro dev` is tested instead of the dist — a stale-HMR
  dev server yields spurious island failures, so rule out the server before
  debugging the test.
- **Behavior specs:** normative specs live in [docs/specs/](docs/specs/) (one
  file per capability: `product-catalog`, `order-pricing`, `order-basket`,
  `order-submission`, `product-sets`). Read the relevant spec before touching
  its behavior and keep it in sync when behavior changes.
- **ADRs:** architectural decisions live in [docs/adr/](docs/adr/); read the
  ones touching your area and surface conflicts rather than overriding them.

## Gotchas

- **Install with `npm ci --ignore-scripts`** (or `npm install --ignore-scripts`).
  Plain `npm ci` aborts on `sharp`'s install script (it falls through to a
  from-source build that fails with `Please add node-addon-api`).
- **This repo is npm-managed.** Do not use pnpm/yarn.

## Agent skills

Prioritize using free subagent(s) whenever possible.

### Issue tracker

Issues live in GitHub Issues for `Gr3q/babasarok-website` (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels, 1:1 with their names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
