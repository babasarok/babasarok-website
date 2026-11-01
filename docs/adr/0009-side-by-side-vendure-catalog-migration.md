# ADR 0009: Side-by-side Vendure migration — the catalog becomes 100% Vendure-owned

- **Status:** accepted (amends ADR 0007 decision 3)
- **Date:** 2026-11

## Context

ADR 0007 left the Tina catalog as the real catalog, with Vendure holding only
placeholder products for orders ("when products are recreated natively in
Vendure… placeholders and this seam disappear"). The catalog port (materials
first, then products, then the configurator) now needs an explicit migration
strategy, because the two systems overlap: product data, material data, and
the material color images all exist in Tina today.

## Decision

1. **The catalog — materials, material images, and products — becomes 100%
   Vendure-owned.** Tina does not remain the source of truth for any of it.
   Material color images are stored as Vendure assets, not as repo paths.
2. **The migration is side-by-side.** Vendure is set up as if Tina did not
   exist: complete data models, admin UI, and seed/import paths — while Tina
   and the Astro site stay completely intact and continue serving the live
   site unchanged. Nothing in the site's Tina collections, content files, or
   rendering is modified to accommodate Vendure.
3. **Cutover is a switch flip on the Astro site.** When the Vendure catalog
   is complete and verified, the site starts reading from Vendure instead of
   Tina. Until then the two run in parallel; Tina content may be seeded into
   Vendure, but the authority direction at cutover is one-way: Vendure owns,
   the site reads.

## Consequences

- Vendure gains the asset infrastructure (asset server, storage volume) that
  owning product/material imagery requires, even while the site still serves
  its own images.
- Import scripts are one-way seeds (Tina content → Vendure), not a sync: once
  a domain is ported, edits happen in the Vendure dashboard, and the Tina
  copy of that domain becomes stale by design until cutover removes it.
- The automated seed machinery (deploy tar carrying Tina content, the backend
  image baking it, preview deploys running the import) is completely
  temporary and preview-only. Production ships no Tina content, and the prod
  import at cutover is a hand-migration run directly from the repo — the
  automated path never runs against prod.
- During the transition the same entity exists twice (e.g. a material in
  Tina and in Vendure); the ported copy in Vendure is the one that matters
  going forward, and discrepancies at cutover time are resolved in Vendure's
  favor.
- ADR 0007's placeholder catalog remains valid only until products are
  ported; the placeholder seam then disappears as 0007 anticipated.
