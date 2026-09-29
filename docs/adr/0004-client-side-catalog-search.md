# ADR 0004: Client-side search and filtering for the product list

- **Status:** accepted
- **Date:** 2026-09-12

## Context

The product list (28 products, no pagination) needed text search and
filtering by product type and product set. The repo's values prefer no-JS,
build-time rendering, but text search over product titles and short
descriptions cannot be generated at build time.

## Decision

One Svelte island (`client:load`) on the single product list page embeds the
full product dataset and performs search, type/set filtering, and sorting
client-side. The search/filter/sort state lives in URL query parameters
(`q`, `type`, `set`, `sort`): the island reads them on load and updates the
URL on change, so filtered views are shareable. Within one filter dimension
multiple selections are OR-combined; dimensions are AND-combined with each
other and with the search text. Without JavaScript the page degrades to the
full static product grid with search/filter/sort inert.

Considered and rejected:

- **Static routes per filter combination** — route explosion, and text
  search still needs JS, so two mechanisms to keep in sync.
- **Search service / index** — disproportionate for a ~30-item catalogue
  that ships as static pages.

## Consequences

- The product list page ships a small client-side island; this is a
  deliberate, documented deviation from the no-JS-first value (see AGENTS.md).
- Filtering logic must stay in a pure, tested module (precedent:
  `src/lib/order/queryParams.ts`) so it is testable without the DOM.
- If the catalogue grows large enough that embedding all products per page
  becomes wasteful, revisit (reintroduce static filter pages or an index).
