# @babasarok/product-definition

The canonical product-catalogue model: zod schemas defining materials, their
colors, and (as the port progresses) products and their configurable fields.
The Vendure backend validates everything it stores against these schemas, so
authoring tools and the backend enforce identical rules.

Source: salvaged from the `refactor/vendure-preparation` branch, where the
site's `src/product-definition/` carries the same schemas. The Astro site
still consumes its own copies and adopts this package later (side-by-side
migration, ADR 0009) — until then the two copies must be kept in sync
by hand.
