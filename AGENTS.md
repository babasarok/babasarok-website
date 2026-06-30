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
- **Tests:** `npm run test:hydration` (Playwright)
