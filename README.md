# Babasarok website

Marketing and webshop-style site for Babasarok, built with **Astro** + **Svelte
islands**, styled with **Tailwind CSS 4**, and edited through **TinaCMS**
(Git-backed content with visual admin).

The site is **static and build-time-first**: pages are pre-rendered to HTML and
client-side JavaScript is limited to a few Svelte islands (most notably the order
configurator on the contact page).

## Tech stack

| Concern         | Technology                                                  |
| --------------- | ----------------------------------------------------------- |
| Framework       | Astro 6 (`output: "static"`)                                |
| Interactivity   | Svelte 5 islands (runes), hydrated only where needed        |
| Styling         | Tailwind CSS 4 (`@theme` tokens in `src/styles/global.css`) |
| Content / CMS   | TinaCMS (Tina Cloud in prod, `--local` in dev/CI)           |
| Images          | `astro:assets` + `sharp`, responsive `constrained` layout   |
| Order form mail | Web3Forms                                                   |
| Tests           | Vitest (unit), Playwright (hydration)                       |

## Getting started

> This repo is **npm-managed**. Do not use pnpm or yarn.

Install dependencies (must skip install scripts — see [Gotchas](#gotchas)):

```sh
npm ci --ignore-scripts
# or: npm install --ignore-scripts
```

Run the dev server (boots the Tina backend on `:4001` and Astro on `:4321`):

```sh
npm run dev
```

Open <http://localhost:4321> for the site and <http://localhost:4321/admin> for
the Tina editor.

## Scripts

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `npm run dev`                 | Tina backend + Astro dev server                           |
| `npm run build`               | Production build (talks to Tina Cloud — needs creds)      |
| `npm run build:local`         | Self-contained build, no Tina Cloud creds needed          |
| `npm run preview`             | Serve the built `dist/` locally                           |
| `npm run check`               | `astro check` + `sv check` (type/diagnostics)             |
| `npm run lint`                | ESLint                                                    |
| `npm run lint:style`          | Stylelint                                                 |
| `npm run format`              | Prettier (write)                                          |
| `npm test`                    | Vitest unit tests (`vitest run`)                          |
| `npm run test:watch`          | Vitest in watch mode                                      |
| `npm run test:hydration`      | Playwright island-hydration tests (needs a `dist/` build) |
| `npm run test:dist-tina-urls` | Guard: fail if any Tina Cloud URL leaked into `dist/`     |

## Project structure

```
src/
  layouts/      # Base.astro – HTML shell (SEO/OG, fonts, Header/Footer)
  pages/        # Routes (index, contact, product, material, blog, …)
  components/
    blocks/     # Page sections (Hero, Service, About, Product, Blog, Header, Footer)
    blocks/order/  # Order configurator Svelte island
    ui/         # Reusable presentational components
  lib/          # Data loaders (data.ts) + order domain logic + helpers
  content/      # Tina-managed Markdown/JSON content
  styles/       # global.css (@theme tokens), base/prose/theme css
tina/           # Tina schema (collections/*.ts) + config + generated client
scripts/test/   # Build-output guard scripts
tests/          # Playwright hydration tests
docs/           # Architecture and planning docs
```

## Content editing

Content lives under `src/content/**` as Markdown/JSON and is edited through the
Tina admin at `/admin`. Two access paths read this content at build time:

- **Tina client** (`src/lib/data.ts`) — global config, header/footer, and the
  order-form island data.
- **Astro content collections** (`src/content.config.ts`) — list/detail pages and
  landing grids, with `astro:assets` `<Image>` optimization.

## Gotchas

- **Install with `--ignore-scripts`.** Plain `npm ci` aborts on `sharp`'s install
  script (it falls through to a from-source build that fails). Prebuilt `@img`
  binaries supply the runtime image support.
- **`npm run build` needs Tina Cloud credentials** (`TINA_CMS_CLIENT_ID`,
  `TINA_CMS_CLIENT_TOKEN`). Use `npm run build:local` for a cred-free local build.
- **Dev requires the Tina backend.** Plain `astro dev` can't reach Tina (`:4001`);
  always use `npm run dev`.

## Documentation

- [AGENTS.md](AGENTS.md) — core values, conventions, and tooling for contributors
  and AI agents.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture deep-dive and
  improvement backlog.
- [openspec/](openspec/) — baseline specs and in-flight changes (proposals,
  designs, task lists) under the OpenSpec workflow.
