# ADR 0013: Responsive dashboard tables via an upstream-shaped patch

- **Status:** proposed
- **Date:** 2026-11

## Context

The owner works the Vendure dashboard from a phone (catalog upkeep — epic 2;
order handling — epic 5). Every stock table (product list, variants, orders,
order lines, our configurator's generated variants) renders as a wide
`<table>` that scrolls sideways inside its card: at a 365px viewport the
orders table is 1031px wide in a 331px frame, so a row cannot be read
without scrolling.

The dashboard's `DataTable` (`@vendure/dashboard`) is a bridge over the
`DataTable` molecule of Vendure's design system (`@vendure-io/ui`,
`vendurehq/design`). The molecule owns the whole frame: the header band
(search, filters, saved views, bulk-action bar, column options), the rows and
the pagination footer. Only the rows are layout-specific; everything else
already wraps. The extension API offers no hook for this (per-page column
visibility/order defaults only, no breakpoints), and table cells carry no
column identity, so CSS alone cannot build labelled cards. Nothing upstream
covers it yet.

## What matters (in order)

1. A phone-usable table everywhere, with the desktop feature set (sorting,
   selection + bulk actions, row actions, context menu, column
   visibility/order, pagination, drag reordering, footer rows).
2. Low ongoing cost across Vendure upgrades.
3. A path to upstream, so the cost ends.
4. Desktop behaviour unchanged.

## Options

- **Do nothing / not now:** tables keep scrolling sideways. Fails 1.
- **CSS polish** (sticky first column, scroll hints): cheap, all tables, but
  rows stay unreadable on a phone. Fails 1.
- **Our own mobile list per page** (replace stock list blocks): best per-page
  result, but search, filters, views, bulk actions and pagination are
  reimplemented per page and redone on every upgrade. Fails 1 for every
  page not rebuilt, and 2.
- **Render table and cards, hide one with CSS:** every cell renders twice
  (some cells fetch data). Fails 2.
- **Patch the molecule with a card layout for the rows** (chosen): one change
  covers every table, the shared frame keeps feature parity by construction,
  and the change is shaped as an upstream contribution.

## Decision

1. **`@vendure-io/ui`'s `DataTable` gets an opt-in `cardLayout` config**
   (absent → always a table, so upstream behaviour is unchanged — the
   molecule's "a capability renders only when its config is wired" rule).
   `mode: 'auto'` (default) switches to cards when the table's own frame is
   narrower than `breakpoint` (default 640px) — measured on the container,
   not the viewport, so narrow side columns and sheets switch too — measured
   before paint; `mode: 'always'` forces cards.
2. **Cards replace only the rows.** One card per row: the title column comes
   from the consumer's `titleColumnId` picker (default: the first visible
   data column); the other visible columns are label/value lines, labelled
   by the consumer's `columnLabel` (default: a string header, else the column
   id; `null` leaves a column off the cards); the actions column, selection
   checkbox and context menu sit on the card. A sort control and select-all
   stand in for the missing column headers. Loading and empty states have
   card variants. The row-render seam reports the active layout
   (`ctx.layout`), and footer rows render in a compact table under the
   cards.
3. **`@vendure/dashboard`'s bridge wires `cardLayout` for every table at
   640px**: labels match the column menu (a custom string header wins), the
   title is a column flagged `meta.cardTitle` (orders: the order code), else
   the first non-asset column; its custom rows (drag-reorder rows, utility
   rows) get card variants.
4. **Both changes ship as pnpm patches** (`patches/`), the dashboard one
   extending the existing patch. `pnpm install` fails when a patch stops
   applying, so an upgrade cannot silently drop them; a dashboard E2E spec
   covers the cards at a phone width and the table at desktop width.

## Rollout

1. Molecule patch with the card layout and the `cardLayout` config.
2. Dashboard patch: `cardLayout` on every table, card variants of custom
   rows, Hungarian labels.
3. Dashboard E2E spec (phone + desktop widths).
4. Upstream, owner-driven: an issue on `vendurehq/design` with the proposed
   API, then PRs to `vendurehq/design` (molecule) and `vendurehq/vendure`
   (bridge). Each hunk of our patches is deleted once its upstream release
   is installed; this ADR is superseded when both are gone.

## Consequences

- Two patched upstream packages; a Vendure upgrade that touches these files
  means re-basing the patches (the install fails loudly until then).
- Desktop rendering is unchanged; the card layout is new UI the owner tests
  on a phone.
