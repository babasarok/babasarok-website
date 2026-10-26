# ADR 0008: The Vendure dashboard ships with the site, not the backend

- **Status:** accepted (amends ADR 0007)
- **Date:** 2026-10

## Context

ADR 0007 left the Vendure admin dashboard served by the backend: the backend
image built it (`vite build` in the Docker build) and `DashboardPlugin`
served it at `https://api.babasarok.net/dashboard`. The dashboard is a static
React SPA (Vendure 3's `@vendure/dashboard`) that only talks to the admin
API — it needs no server of its own. The backend image therefore carried
~26 MB of dashboard assets and rebuilt them (including Admin API schema
introspection) on every backend deploy, while the frontend already builds on
Cloudflare in the same commit's build.

## Decision

1. **The dashboard is part of the Astro site's build and deployment.** An
   Astro integration (`integrations/vendure-dashboard.ts`) builds the
   dashboard with the backend's own vite tooling directly into the Astro
   output (`dist/dashboard`) on every build; the site Worker serves it at
   `https://babasarok.net/dashboard`. The backend no longer builds or serves
   it (`DashboardPlugin` stays registered without `init()` for its admin API
   extensions — metrics, settings store — but serves no UI; backend `build` =
   `tsc` only).
2. **The site is served by the Astro Cloudflare adapter** (`@astrojs/cloudflare`,
   `output: "static"` with prerender-by-default) instead of an assets-only
   Worker. The adapter is the intended direction for the site (future
   on-demand routes land here), not only a means to the dashboard fallback.
   The SPA fallback lives in Astro's routing layer: an on-demand
   endpoint (`src/pages/dashboard/[...slug].ts`) serves the dashboard SPA
   entry for `/dashboard/*` browser navigations that miss a static asset —
   exactly the client-side-routed deep links from order emails. Stale
   hashed-asset requests keep 404-ing (the endpoint answers only
   `Sec-Fetch-Mode: navigate` requests). Build-time behavior is preserved
   via `prerenderEnvironment: "node"` (filesystem reads during prerender)
   and `imageService: "compile"` (sharp at build time); sessions are off.
   Playwright hydration tests boot `wrangler dev` against the generated
   `dist/server/wrangler.json` (`astro preview` daemonizes with the
   adapter).
3. **The API origin is baked into the dashboard bundle at build time** from
   `PUBLIC_VENDURE_API_URL` (same env the storefront already builds with;
   previews derive `api-<slug>` from the branch). Local dev leaves it unset:
   `astro dev` proxies `/dashboard` to the dashboard's vite dev server (HMR)
   and `/admin-api` to the local backend, so the dashboard calls its own
   origin.
4. **The dashboard authenticates with a bearer token, not a cookie.** The
   dashboard is cross-site to the API on previews (`*.workers.dev` →
   `api-<slug>.babasarok.net`), where `SameSite: lax` session cookies are not
   sent. The backend accepts both (`authOptions.tokenMethod: ["cookie",
"bearer"]`); the dashboard build detects bearer support and stores the
   token in localStorage. CORS stays a single credentials-free origin
   allowlist; Vendure exposes the `vendure-auth-token` header automatically.
   Accepted trade-off: an XSS on the site origin could read the admin token
   from localStorage; the storefront is a static site whose content comes
   from trusted CMS editors. CSRF prevention (`Apollo-Require-Preflight`) is
   unchanged.
5. **Deploy coupling is unchanged in kind, tightened in fact:** one Cloudflare
   build builds the backend image (server only now), deploys it, then deploys
   the site Worker that carries the dashboard built from the same commit.
   Preview stacks get the dashboard for free with the site Worker (no
   per-branch DNS — the wildcard `*.babasarok.net` record keeps pointing at
   the box for preview APIs only).

## Consequences

- Backend deploys build faster and the image is ~26 MB smaller; the Docker
  build no longer needs the `build.env` placeholders.
- Site 404s are rendered by the Astro Worker instead of the static
  `not_found_handling: "404-page"` file (same 404 page, on-demand).
- `ADMIN_URL` (order-email deep links) now points at the site dashboard. The
  prod box env must be updated to `https://babasarok.net/dashboard`. Preview
  stacks are seeded with the prod dashboard and the deploy script rewrites
  `ADMIN_URL` to the preview's own site URL (parsed from `wrangler preview`
  output, which prints the branch-stable Preview URL) right after the
  frontend deploy, recreating the preview server and worker so it applies immediately.
- The deploy script (`pnpm run deploy` → `scripts/deploy-backend.ts`) now
  also owns the wrangler invocation; it deploys with the adapter-generated
  `dist/server/wrangler.json` (assets in `dist/client`).
- The dashboard bundle must be built against the same Admin API schema as the
  backend it talks to — satisfied by same-commit builds; a failed site deploy
  after a successful backend deploy leaves the previous dashboard running
  against the new API until the next deploy.
