# Component conventions

Why this exists: an Astro component cannot be client-rendered, and it cannot
be used inside a Svelte component — a reusable base component must work in
both places, and that tension cannot be resolved with `.astro`. The base
component library ([src/components/ui/](../../src/components/ui/)) is
therefore being converted to Svelte one by one.

## Framework defaults

- **Svelte is the default for new components.** Svelte components render both
  server-side (static, no client JS) and client-side (islands via `client:*`),
  so a single `.svelte` covers both cases. `.astro` remains valid for
  page-composition/layout glue (routes, section blocks), but leaf/reusable
  components should be Svelte.
- **Only reach for a solution using JS in components when you have exhausted
  all other standard HTML and CSS APIs.** Prioritize **not** using JS, because
  Svelte components can be server-rendered, never hydrated, and also client
  hydrated. You are only allowed to enable them as client islands with a
  `client:*` prop when they truly require reactivity that is only achievable
  with JS. The **default** is that they are never hydrated. Can use anything
  included in the browser baseline available. If it's possible to do it with
  newer standard APIs, flag it as a possible TODO.
- **Exception:** once some JS is genuinely unavoidable, prefer a single
  client-hydrated island (`client:*`) over the alternative of a
  server-rendered component paired with a separate `<script>` that reaches
  into it via DOM selectors to achieve the same behaviour. A cohesive,
  self-contained island is better than splitting one behaviour across markup
  plus a detached script. This only applies _after_ you've established JS is
  required at all — it does not license hydrating components whose behaviour
  is achievable with HTML/CSS alone.
- **Data fetching goes in the Astro frontmatter (the `---` block), not in
  client-side code.** Exception: the Vendure catalog loads in the browser
  through the catalog store ([ADR 0017](../adr/0017-static-catalog-shells.md)).
- **Define a `Props` interface at the top of each component** (`.astro` or
  `.svelte`).
- **Use slots for composition** (Svelte: snippets / `children`).
- **Prefer Astro's built-in features** (content collections, middleware, SSR)
  over reinventing them in a framework component.

## Component folder structure

`src/components/` is organised **by feature/domain and technology-agnostic**,
not by framework.

- `src/pages/` — routes ONLY (Astro file-based routing).
- `src/components/ui/` — shared, reusable primitives with no domain knowledge
  (`Button.svelte`, `Dialog.svelte`, `TextInput.svelte`, …). Reusable anywhere.
- `src/components/blocks/` — feature/domain components composed from
  primitives (landing-page sections plus the catalog, order and checkout
  islands). A route in `src/pages/` imports these; they never live in
  `pages/` (putting a component there would make Astro try to route it).

## Migration policy

- **Newly created components in `ui/` MUST be Svelte.**
- **Existing components migrate opportunistically** (tech debt). Don't do a
  big-bang move.
- When a component is converted to Svelte, **delete the old `.astro` version
  and update call sites** (Svelte uses `children`/snippets instead of default
  slots; props keep their names — `class` stays `class`).

## State

- Converted: `ui/Button` (the `Button.astro` → `Button.svelte`; the former
  form-level `Button.svelte` was renamed `ActionButton.svelte`).
- Remaining `.astro` in `ui/`: `BlogCard`, `FloatingShapes`, `PageHeader`,
  `Pagination`, `TopTitle`.
