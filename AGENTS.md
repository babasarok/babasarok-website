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
  Prefer the generated utility (`text-brown-500`) over the arbitrary-value
  `text-(--color-brown-500)` syntax for `--color-*` tokens; reserve `var()` /
  `(--var)` for tokens outside the Tailwind namespace (e.g. `--nav-product-hover`)
  and fallbacks (e.g. `text-(--color-link, --color-foreground)`). Don't add new
  global CSS files without checking the existing structure of `global.css` and
  its imports.
- **Imports:** use the `@/*` path alias for imports from `src/`.
- **New shared UI:** create a small reusable component (see
  [src/components/ui/](src/components/ui/)) rather than duplicating markup or adding
  global utilities.
- **Rendering:** prefer Astro components and build-time rendering; only add a Svelte
  island / client hydration when interactivity actually requires it. Once JS is
  genuinely unavoidable, prefer one cohesive hydrated island over a server
  component plus a detached `<script>` that reaches into it via DOM selectors.
  Prefer Astro's built-in features (content collections, middleware, SSR) over
  reinventing them in a framework component. When solving something with an
  older-but-safe approach, flag newer standard APIs that could replace it as a
  possible TODO.
- **Data fetching:** in Astro frontmatter (the `---` block), not in client-side code.
- **Astro component shape:** define a `Props` interface at the top of each
  `.astro` component (for caller type-checking, even when not destructured).
- **No sidestepping type-checking:** no type casts, non-null assertions, or
  index-signature prop bags (`[key: string]: unknown`) that silence the compiler.
  When a component should accept HTML element attributes, extend its props
  interface with the element's attribute types instead of an open index
  signature. Prefer `satisfies` over type assertions where possible, and
  discriminated unions over enums. If a cast seems genuinely unavoidable, raise
  it and ask for directions instead of working around it silently.
- **Validate external data with zod:** anything read from storage, the URL or
  the network gets a zod schema — the schema is the author-time check and the
  parse is unit-testable. zod is already installed.
- **No silencing lint/check warnings:** fix eslint and svelte-check warnings
  (including a11y ones) properly. `eslint-disable` / `svelte-ignore` comments
  are a last resort and must carry a concrete justification for why the rule
  cannot be met.

## Code style

Formatting is Prettier's job; these are the conventions it can't express.

- **Flat functions:** structure functions as guard clauses, one after another.
  Handle the exit/exception case first and `return` immediately, then continue
  the main path top-to-bottom. Prefer an early `return` over `else` branches,
  e.g.:

  ```ts
  function toggle(key: string): void {
    if (set.has(key)) {
      set.delete(key);
      return;
    }

    set.add(key);
  }
  ```

- **Function declarations:** use the `function` keyword for named, standalone
  function declarations — don't convert them to arrow functions. Prefer arrow
  functions for inline callbacks (array methods, event handlers).
- **Blank lines around blocks:** a statement spanning more than one line —
  multiline calls, object/array literals, control-flow blocks
  (`if`/`for`/`while`/`switch`/`try`), function declarations, multiline
  JSX/template literals — gets one blank line before and after; two adjacent
  multiline statements are separated by exactly one blank line. Exception: no
  blank line at block edges (immediately after the opening `{` or before the
  closing `}`).

  ```ts
  function f() {
    const obj = {
      a: 1,
      b: 2,
    };

    if (obj.a > 0) {
      doThing();
    }

    return obj;
  }
  ```
- **Ternaries are a last resort:** use a guard clause if possible, otherwise an
  `if`/`else` block. A ternary is acceptable only when it is clearly the most
  readable option — i.e. it fits on one line, or both branches of the
  `if`/`else` assign the same variable.

## UI development

- **Do NOT verify UI changes in a live browser.** The user runs the site and
  tests UI behavior manually; the agent never spawns the dev server, a build,
  or a browser to "prove" a change works. The agent runs only static checks
  (`npm run check`, `npm run lint`, `npm test`) and ends the reply by telling
  the user exactly what to click through when verifying the change.
- **Browser defaults bite:** the UA stylesheet caps `<dialog>` at
  `max-width/max-height: calc(100% - 42px)` (override with `max-w-none
max-h-none`); `width: 100%` on a `position: fixed` element stops short of
  the scrollbar (use `w-screen`); any transformed ancestor becomes the
  containing block for fixed descendants.
- **Animate visible elements only.** Svelte transitions start at mount; a
  transition on an element inside a `display:none` ancestor (e.g. a closed
  `<dialog>`) measures wrong and fires twice. Open the dialog with
  `showModal()` in a `$effect.pre` so content mounts after it is visible.

## Tooling

- **Framework:** Astro 7 + Svelte islands, Tailwind CSS 4, TinaCMS.
- **Dev:** `npm run dev`
- **Build:** `npm run build:local` (skips the TinaCMS cloud schema check). Plain
  `npm run build` fails whenever the local CMS schema is ahead of the pushed
  GitHub schema, so use `build:local` for local builds. It fails while a
  `tinacms dev` server is running (datalayer port 9000); pass
  `--datalayer-port <other>` to the `tinacms build` invocation in that case.
- **Type/check:** `npm run check` (`astro check` + `sv check`)
- **Lint:** `npm run lint` · **Styles:** `npm run lint:style`
- **Format:** `npm run format` (Prettier)
- **Unit tests:** `npm test` (Vitest, `vitest run`) · watch with `npm run test:watch`.
  Specs live in `src/**/*.test.ts` (e.g. the order-form logic in
  [src/lib/**tests**/](src/lib/__tests__/)); fast pure-function tests, no build needed.
- **Test levels, in order:** reach for each in this order and fall back only when
  the earlier level genuinely can't do the job: **types** (illegal states,
  required props, "only built through X" — via brands, discriminated unions,
  narrowed props, un-exported helpers, `satisfies`) → **lint/build-time checks**
  (patterns types can't see) → **unit tests** (pure decisions, parsing,
  formatting) → **component tests** (rendered markup, event wiring, island state
  transitions; Svelte via `@testing-library/svelte` + `jsdom` — install on
  demand, nothing extra exists yet) → **hydration tests** (real browser
  behaviour, Playwright). Types first, even if it costs a refactor: when a type
  could solve the problem (a brand, splitting a function so the illegal state is
  unrepresentable, un-exporting a helper so the only entry point is the
  validated one), present the refactor to the user instead of silently settling
  for a weaker level. Keep decisions pure so the unit level stays viable: inject
  storage/URL/DOM access instead of reading it inside the decision logic. One
  behaviour, one owner: don't re-test in Playwright what a type or unit test
  already proves. Valid reasons to fall back a level: **can't express it** (e.g.
  a type can't narrow a computed string, so that check is an ESLint rule),
  **tests the wrong thing** (implementation details where behaviour matters, or
  a jsdom test of something that depends on layout), or **hard to maintain** —
  a judgement call to discuss with the user, recording the agreed reason in the
  test file's header comment.
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
- **Don't read `tina/tina-lock.json` in full.** It is a huge minified JSON
  (the TinaCMS GraphQL schema dump) that floods the context. Inspect it with
  surgical searches instead, e.g. `grep -o 'SomeTypeName.\{0,200\}'
tina/tina-lock.json`. It is regenerated by `tinacms build` (via
  `npm run build:local`) when the collection schemas change; never hand-edit it.

## Pull requests

- **The canonical repo is `babasarok/babasarok-website`.** It was transferred between
  owner accounts, so a previous owner's URL 301-redirects here — but that is the _same_
  repo, not a fork. Create PRs on the `babasarok` repo.
- **Use a same-repo head, not a cross-account one.** GitHub does not treat a transferred
  old-owner URL as a fork, so a cross-account head like `--head <old-owner>:<branch>`
  fails with `Head ref must be a branch` / `No commits between`. Push your branch, then
  create the PR against the canonical repo with a plain branch name:

  ```bash
  git push -u origin <branch>
  gh pr create --repo babasarok/babasarok-website --head <branch> --base main \
    --title "type: summary" --body "..."
  ```

- **Conventions:** conventional-commit titles (`fix:`, `feat:`, …) and `type/<slug>`
  branch names (e.g. `fix/mobile-product-page-overflow`). Confirm with
  `gh pr view <n> --repo babasarok/babasarok-website`.

## Agent skills

Prioritize using free subagent(s) whenever possible.

### Issue tracker

Issues live in GitHub Issues for `Gr3q/babasarok-website` (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels, 1:1 with their names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
