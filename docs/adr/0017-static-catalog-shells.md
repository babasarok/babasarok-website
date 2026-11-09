# ADR 0017 — Static catalog shells; the browser loads the catalog

Status: proposed

Supersedes, once accepted: [ADR 0012](0012-site-reads-vendure-at-request-time.md)
decisions 1 (catalog pages render on demand) and 3 (rendered catalog HTML is
edge-cached), and [ADR 0015](0015-multi-language-site-architecture.md) decision
7 (mirrored on-demand route rules), which is left with the two on-demand
endpoints only.

## Context

ADR 0012 rendered every catalog page in the Worker from the shop API. On
production (measured 2026-11-09) a cache miss took 0.6–1.6 s to the first
byte, a hit 60–110 ms: nothing reached the browser until every shop-API call
had answered, the product page made two calls one after the other, `/terms`
had no cache rule at all, and `Base.astro` fetched the site config from Tina
Cloud on every on-demand render. ClientRouter makes it worse for in-site
navigation: it waits for the complete next document before swapping, so a
streamed response would not help either. A low-traffic shop misses the edge
cache most of the time.

## Priorities (ranked)

1. **The page responds at once** — with or without a warm cache, a visitor
   sees the page frame and a loading state immediately, also on ClientRouter
   navigations.
2. **The build never depends on the backend** (unchanged from ADR 0012).
3. **Link previews and search keep the item's title and image.**
4. **Maintainability** — one rendering path per page section.
5. **No-JS rendering of catalog content** — given up (owner decision).

## Decision

1. **Every HTML page is prerendered except the product and material detail
   routes.** Catalog sections are Svelte islands. Pages hold no catalog data,
   so no page reads the shop API or Tina at request time (`Base.astro` reads
   the site config from the `config` content collection).
2. **Islands load the catalog in the browser through one catalog store**
   (`src/lib/catalog/store.ts`, nanostores): one request per language for the
   shared catalog (products, materials, thread colors, groups) and one per
   product detail. The store lives for the page session, so it survives
   ClientRouter navigations; data older than 60 s is shown and refreshed in the
   background, and a failed load shows an inline error with a retry. The store
   is only touched in the browser (`remoteValue`), never while prerendering.
3. **The detail routes render on demand without waiting for visitors.** Known
   search and link-preview crawlers (by user agent) wait for the item instead
   and get its title, short description and preview image in the head, a 404
   for an unknown slug and a 503 when the backend is unreachable. Visitors get
   the section's generic title; the island sets the tab title. These routes
   are not edge-cached (one URL serves two variants).
4. **The shop API caches CORS preflights** (`Access-Control-Max-Age`, 2 h), as
   every catalog page now calls it cross-origin from the browser.
5. **ESLint guards it**: `.astro`/`.svelte` files cannot import the shop-API
   fetchers, and pages other than the detail routes cannot set
   `prerender = false` (`eslint/catalog-rendering.ts`).

## Options considered

- **Do nothing / not now** — rejected: the measured misses are the problem.
- **HTML streaming of on-demand pages** (shell first, sections when the
  backend answers, CSS-only skeleton swap) — keeps no-JS content, but the
  status code and head are sent before the data (no 404, no per-item title),
  a mid-stream failure gets edge-cached, and ClientRouter still waits for the
  whole document, so in-site navigation stays slow.
- **Server islands** — rejected by ADR 0015 (props in the query string defeat
  caching) and by the owner.
- **Longer edge TTL plus purge on catalog edits** — makes misses rarer but
  not faster; compatible with this decision for the two on-demand endpoints.
- **Crawler meta for every request from an edge-cached lookup, or pushed to
  KV by the backend** — correct for unknown crawlers too, but either makes
  visitors wait on a cold lookup or adds KV, a Cloudflare token on the backend
  and a drift check. Revisit if a missed crawler matters.

## Consequences

- Catalog content needs JavaScript; crawlers that run no JS and are not on the
  user-agent list see the generic title.
- `marked` and the gallery ship in the island bundle.
- The catalog sitemap and `search-index.json` stay on-demand endpoints with
  their edge cache; the list pages and `/terms` are now in the static sitemap.
- Visitors see catalog data up to a minute old; the basket's stale-line
  handling (order-basket spec) already covers a changed price or option.

## Rollout plan

One PR: the store and islands, the detail routes, the guard, the backend CORS
change and the doc updates (product-catalog spec, AGENTS.md, ARCHITECTURE.md,
roadmap). Verification on the preview deploy: the click-through in the PR
description, plus `curl -A facebookexternalhit/1.1` on a product URL showing
its title in the head and on an unknown slug answering 404.
