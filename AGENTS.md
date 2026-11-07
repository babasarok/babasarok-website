# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Roadmap read-gate (mandatory)

Before doing ANY work on the shop platform — backend plugins, catalog
modeling, seeds, migrations, dashboard extensions, orders, payments,
shipping, translations, or anything else covered by the roadmap — read
[docs/roadmap.md](docs/roadmap.md) first to see which epic the work belongs
to. Its principles are fixed (notably: product information is never stored
in Tina, and the Astro site is untouched until the site-cutover epic); do
not re-plan or relitigate them in briefs, PRs or docs.

## Maintenance and testing read-gate (mandatory)

Before adding or changing a test or a check, removing or reshaping code,
adding a dependency, moving code between modules, starting a migration or
writing an ADR, read [docs/agents/maintenance.md](docs/agents/maintenance.md)
and [docs/agents/testing.md](docs/agents/testing.md) (test levels, seams,
where tests live, how to run the E2E suites).

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

## Agent workflow

- **Parallelized workflow:** delegate separable slices to parallel subagents
  (`explore` for search, `general` for multi-step work); the main session
  plans, integrates and reviews. Personally review every subagent slice
  against the roadmap and the relevant behavior spec before pushing — a
  subagent's final report is not evidence.
- **"Test it properly" means both:** cover the interaction paths a user
  takes, and prove every new check can fail (red-run it against the old
  code). Only test seams that a CI job actually exercises — see
  [docs/agents/testing.md](docs/agents/testing.md).
- **Heavy commands behind the lock:** builds, E2E suites and local servers
  run behind `flock /tmp/opencode/bb-heavy.lock` so parallel agents don't
  collide. Never `pkill`/`pgrep -f` — kill only PIDs recorded by us
  (e.g. `/tmp/opencode/tina.pid`). Never let a local server send real email.

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
- **Backend plugin layout:** custom Vendure plugins live in
  `backend/src/plugins/<name>/` — one folder per plugin, with the plugin's
  entity/entities, service, resolver and plugin file together. Dashboard
  extensions mirror this: `backend/src/dashboard/<name>/` (one folder per
  plugin's dashboard code), with cross-plugin dashboard helpers only in
  `backend/src/dashboard/shared*`. Infrastructure (vendure-config, env,
  migrations, gql) stays at `backend/src/` top level.
- **Behavior specs:** normative specs live in [docs/specs/](docs/specs/) (one
  file per capability: `product-catalog`, `order-pricing`, `order-basket`,
  `order-submission`, `product-sets`). Read the relevant spec before touching
  its behavior and keep it in sync when behavior changes.
- **ADRs:** architectural decisions live in [docs/adr/](docs/adr/); read the
  ones touching your area and surface conflicts rather than overriding them.

## Gotchas

- **This repo is pnpm-managed** (pnpm ≥ 12, `pnpm-workspace.yaml` with the
  `backend` workspace). Install with `pnpm install` — build-script approvals
  are pre-listed in `pnpm-workspace.yaml` (`allowBuilds`), so a plain install
  passes; adding a dep with build scripts without an `allowBuilds` entry
  fails the install with `ERR_PNPM_IGNORED_BUILDS`. The pnpm-lock.yaml is
  generated and must not be hand-edited or reformatted (it's in
  `.prettierignore`).
- **npm leftovers:** `package-lock.json` is ignored/untracked; don't run
  `npm install`/`npm ci` — it would create a stale npm lockfile.
- **Patched dependencies (`patches/`):** `@vendure/dashboard` and
  `@vendure-io/ui` carry pnpm patches (the responsive tables of ADR 0013 plus
  smaller dashboard fixes). `pnpm patch <pkg> --edit-dir <dir>` does **not**
  apply the existing patch to the edit dir — apply it first
  (`patch -p1 < patches/<file>` inside the dir), or `pnpm patch-commit`
  silently drops it. `patch-commit` also writes a versioned `<pkg>@x.y.z`
  key and file next to the unversioned one, which fails the install
  ("patches were not used"): fold it back into the existing unversioned
  file and key.
- **Don't read `tina/tina-lock.json` in full.** It is a huge minified JSON
  (the TinaCMS GraphQL schema dump) that floods the context. Inspect it with
  surgical searches instead, e.g. `grep -o 'SomeTypeName.\{0,200\}'
tina/tina-lock.json`. It is regenerated by `tinacms dev` (not by
  `tinacms build`) when the collection schemas change — run it briefly and
  kill it once the lock changed; never hand-edit it.
- **Backend (Vendure) facts:** run locally with `pnpm -C backend run dev`
  (compiles, migrates, then watches server + worker; dashboard at
  `/dashboard`, dev mailbox at `/mailbox`); types + tests with
  `pnpm -C backend run check` / `pnpm -C backend test`. Generate a migration
  with `node --env-file=backend/.env backend/dist/generate-migration.js
<name> --from-empty`. Migrations are versioned files (never
  `synchronize`); the deploy runs them in a one-shot `migrate` container
  gated before the server boots. Orders stop at `ArrangingPayment`
  (`QuoteOrderPlacedStrategy` in `backend/src/vendure-config.ts` marks them
  placed — no payment step yet). The server prices the line natively:
  `orderItemPriceCalculationStrategy: new ServerPricingStrategy()` in
  `backend/src/vendure-config.ts` computes the unit price from the
  definition + selections (#71's price-authority scope — what remains
  there is Barion, tax and invoicing, epic 7). Do not create a customField
  named `transactionId` —
  it collides with an order payment field in the admin-API SDL.
- **Fresh builds before E2E:** a fresh `pnpm -C backend run build` plus
  `pnpm run build:local` before checkout/dashboard E2E — a stale
  `backend/dist/` silently drops shop-API fields (HTTP 400) and a stale site
  `dist/` serves the old site.
- **`gql:fresh` before pushing** anything that touches generated GraphQL
  types. `pnpm -C backend run check:dashboard` reports vendure-internal type
  errors — they are informational; its guard script tolerates them.
- **Preview deploys drop and re-copy the branch DB** from production and
  re-import it (~45-minute sync budget; API 502s for ~1–2 minutes during
  migrate+recreate — wait before probing). Preview API:
  `https://api-<slug>.babasarok.net/shop-api`.
- **Shop-API probing:** sessions ride cookies (`Set-Cookie: session=…`, use
  a cookie jar); `setOrderShippingMethod` takes a list (`[ID!]!`);
  `productDefinition` is a JSON scalar on the shop API and entity-typed only
  on the admin API.
- **Never put tests importing `backend/src` under `backend/scripts/`** — it
  pulls src into the scripts tsconfig build and emits stray `.js`/`.d.ts`
  files; guards live on the src side reading the script as text.
- **Subagent context limits (process rule):** GLM Flash subagents degrade
  sharply past ~200k tokens of session context, and follow-up messages
  accumulate into the same session. For any slice longer than a quick task,
  plan it as a sequence of fresh subagent sessions with explicit handovers
  (stop → state dump → fresh brief) instead of one long-lived session. Never
  queue a new large phase onto a session that is already deep; parent
  sessions cannot see a subagent's token usage mid-flight — only its final
  report.
- **Material ids:** Vendure Material rows have auto-increment numeric ids
  (standard `ID!` in the admin API and dashboard detail routes). The
  `slug` column (the Tina `material_id`) is the business key the canonical
  `MaterialDefinition` and product definitions reference — upsert by slug,
  never repurpose `id`. `MaterialColorInput.id` must stay a `String` scalar:
  as an `ID` it would be decoded by Vendure's IdInterceptor into a number.
- **Vendure migration roadmap (do not relitigate or re-plan):** product
  information is never stored in Tina — at no point in the roadmap. Do not add
  or extend Tina product collections, do not build Tina authoring forms for
  the catalog, and do not modify the Astro site (`src/`, `tina/`) for
  Vendure's benefit. Vendure's product model must support every field Tina
  products have today; existing Tina product content is test data consumed
  only by the temporary preview seed (trimming content files for schema
  validity is allowed — site code/tooling is not). The Astro cutover (site reads
  Vendure) is separate, final work; Tina product collections are deleted only
  after it. Governing docs: `docs/adr/0009` and `docs/adr/0010` (decision 8).

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
