# @babasarok/product-definition

The canonical product-catalogue model: zod schemas defining materials, their
colors, and (as the port progresses) products and their configurable fields.
The Vendure backend validates everything it stores against these schemas, so
authoring tools and the backend enforce identical rules.

The Astro site does not consume this package yet; it adopts it when the
catalog port reaches the site side (side-by-side migration, ADR 0009).
