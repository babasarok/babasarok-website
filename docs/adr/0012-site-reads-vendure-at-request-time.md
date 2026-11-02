# ADR 0012 — The site reads the catalog from Vendure at request time

Status: accepted

## Context

Epic 3 moves the Astro site from Tina product content to Vendure. Today every
catalog page is prerendered from Tina at build time and a catalog edit is a
git commit that rebuilds the site. Once Vendure owns the catalog (ADR 0009,
ADR 0010), an owner edit in the dashboard must reach the site without a git
commit, and the configurator must keep showing a live price while the buyer
changes options.

Constraints:

- The site runs on Cloudflare Workers (paid plan): static asset requests are
  free and unlimited; Worker invocations are billed per request and per CPU
  millisecond (10M requests and 30M CPU-ms included per month), not for
  wall-clock time spent waiting on subrequests.
- The owner does not want the Astro build to depend on a reachable backend
  (another tight build-time coupling to an external service).
- Frontend code (JS, CSS, islands) should ship from the static `dist` as much
  as possible.

## Decision

1. **Catalog pages render on demand in the Worker.** Pages showing catalog
   data (product detail, product list, material pages) set
   `prerender = false` and query the Vendure shop API in Astro frontmatter.
   Every other page stays prerendered. The build never calls Vendure.
2. **Islands and scripts still ship from `dist/client`.** Verified with a
   spike (on-demand page + Svelte island, built and served by
   `wrangler dev`): the island bundle lands in `dist/client/_astro/` and is
   served as an immutable static asset without invoking the Worker; the
   Worker bundle holds only the server render function. CSS is inlined into
   the HTML because of `build.inlineStylesheets: "always"`, exactly as on
   prerendered pages.
3. **Rendered catalog HTML is cached at the edge with a short TTL.** An edit
   is live within the TTL; no purge wiring until real use shows the need.
4. **One shared pricing package, run in the browser and on the server.**
   The configurator computes the live price locally with the same pure
   package the backend's `OrderItemPriceCalculationStrategy` uses (ADR 0002's
   pure core, now shared across the workspace). Vendure stays the price
   authority: basket, set discounts, delivery and total come from the Vendure
   order.
5. **The basket is the Vendure active order.** Islands call the shop API
   directly from the browser (no Worker invocation); `addItemToOrder` carries
   the `selections` / `lengthCm` order-line fields; the set discount is the
   server's promotion. `submitQuoteOrder` and the client-side basket pricing
   are retired by the cutover.

## Considered and rejected

- **Static pages + rebuild on catalog change (deploy hook).** Zero per-visit
  cost, but edits wait for a full build and the build depends on the backend
  being reachable from Cloudflare's build machines for prod and every preview
  stack.
- **Static shell + client-side fetch of the product.** No usable HTML without
  JS, poor SEO; against the repo's build-time / no-JS-first values.
- **Server-quoted configurator price (a `quotePrice` shop-API query per
  option change).** Spiked against the 100 ms target (200 ms hard limit): a
  query doing no work, over one reused connection from Hungary to prod,
  measured 52 ms fastest, ~65 ms median and up to 153 ms, with ~250 ms for
  the first request on a new connection. The real query adds database work
  on top, and mobile networks add round-trip time.

## Consequences

- Uncached catalog pages fail when the backend is down; prerendered pages and
  the static assets keep working.
- The edge cache TTL is the edit-to-live delay.
- Build-time image optimization (sharp) does not apply to Vendure assets;
  catalog images come from Vendure's asset server presets.
- Prerender-only integrations stop covering catalog pages: the sitemap and
  the Pagefind index need a catalog-aware replacement.
- Preview frontends read their own preview stack's API (`previewApiUrl`).
- ADR 0004's client-side search keeps working: the product list embeds the
  dataset per request instead of per build.
