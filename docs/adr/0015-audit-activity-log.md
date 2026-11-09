# ADR 0015: Self-hosted audit log for catalog changes — an event-fan-in table with a dashboard view

- **Status:** proposed (implemented on `feat/audit-log`; owner to accept)
- **Date:** 2026-11-09

## Context

The owner wants to answer "what changed on a product definition / material,
and who changed it?" from a dashboard page, not a database query.

The platform facts:

- **Vendure's audit log is a paid feature.** It is included from the Vendure
  Platform Scale plan (€2,499/mo); its technical reference is
  licence-gated, so coverage of our custom entities (materials, product
  definitions) cannot even be verified without a licence. We self-host open
  source (ADR 0007) — this is not our licensing model.
- **Open-source Vendure persists no catalog activity log.** It publishes
  transient in-memory events on the `EventBus` and keeps order `HistoryEntry`
  rows only. Product definition writes publish no events at all; material
  writes publish `MaterialEvent` but only for variant-relevant changes
  (label-only edits publish nothing). Set-discount promotions (ADR 0014) are
  core `Promotion` rows and Vendure publishes no `PromotionEvent`.
- **The sync machinery already has an attribution shape.** Admin-path writes
  always carry a `RequestContext` (`ctx.session.user` identifies the acting
  admin; `AdministratorService.findOneByUserId` resolves it to an
  administrator). Sync-job writes run with a synthetic worker context that
  carries **no user** — by the time `product-definition-sync` runs, the
  triggering admin is only reachable via the sync enqueue's origin
  ("owner-save" / "automatic").
- **The catalog write path is sensitive.** The 2026-11-08 incident showed
  bulk catalog writes can OOM the sequential worker. Anything this feature
  adds must not add writes to the sync worker's hot path or queue extra jobs.

## What matters (ranked)

1. **It answers the owner's question** — who, what, when for the writes the
   owner actually makes: materials, product definitions (incl. definition
   save → sync completion), and set-discount promotions.
2. **Attribution is honest** — a sync job's rows must never be attributed to
   a user who did not write them; sync output is attributed to the enqueueing
   action or marked automatic.
3. **It cannot destabilize the write path** — log rows are written after the
   business write commits, one row per logical action (never per variant),
   inline on the server process (no job-queue involvement).
4. **Stock extension points only** — `EventBus`, plugin entities, a versioned
   migration, a dashboard extension. No paid platform, no `pnpm patch`.
5. **A growth path** — before/after diffs and more entity kinds can be added
   at the publish sites later without rearchitecting.

## Options

- **A. DIY audit plugin (chosen).** One `AuditLogEntry` table owned by a
  small `audit` plugin; a subscriber fans in existing events (`MaterialEvent`,
  core `ProductEvent`, `ProductVariantEvent` phases) plus new publish calls
  at the blind spots (definition create/update/delete, material label-only
  edits, promotion saves via the `SetPromotionGuardInterceptor` hook). A
  dashboard list page reads it.
- **B. Buy the Vendure Platform audit trail.** Wrong licence model for a
  self-hosted shop; custom-entity coverage unverified; also not extensible by
  us.
- **C. Do nothing.** Every "what changed" becomes a forensic exercise over
  `job_record`, sync states and drift flags. Fails the owner's requirement.
- **D. Shoehorn into order `HistoryEntry`.** HistoryEntry is order-bound;
  catalog writes are not orders. Bespoke misuse of a stock structure.

## Decision

1. **One plugin, `backend/src/plugins/audit/`**, with one entity,
   `AuditLogEntry`: `createdAt`, the acting admin (`actorUserId`,
   `actorIdentifier` — the login, denormalized; both null when no user acted),
   `entityType`, `entityKey`, `action`, an optional `summary` and `source` ∈
   `admin` | `sync` | `system`. Dashboard extension in
   `backend/src/dashboard/audit/` (a list route with a nav item under the
   catalog, newest first, filterable by entity type, source and period;
   read-only admin query behind the stock catalog-read permission).
2. **Fan-in over the EventBus.** Blind spots get publish calls at the write
   site (after commit): `ProductDefinitionService.create/update/deleteProductDefinition`,
   material label-only updates in `MaterialService.updateMaterial`, and
   promotion saves in the `SetPromotionGuardInterceptor` (the only hook on
   those stock mutations; only set promotions, only saves that return a
   Promotion — an `ErrorResult` is not logged). Everything else is an
   existing event (`MaterialEvent`, core `ProductEvent`).
3. **Sync output is one row per sync job, attributed to its origin.** The
   sync job data carries the acting admin (captured at enqueue time, where
   the user is known; null for system-triggered syncs); the job's outcome
   row (`synced` / `sync-failed`) cites it. No per-variant rows. A save that
   lands while a sync is already queued is covered by that job (the existing
   dedup), so the outcome row cites the first enqueuer.
4. **No diffs in v1.** The summary is a short human string each publish site
   provides (e.g. "materials changed: gyöngy, bársony"). Before/after diffs
   are a later slice, added at the same publish sites.
5. **Machine-driven writes stay out of v1** — facet/collection churn from
   `MaterialFacetSync`, bulk-writer internals and job-queue state rows are
   consequences of logged actions, not actions.

## Rollout plan

1. **Backend slice** — entity + versioned migration (`generate-migration`),
   the audit service + EventBus subscriber, publish calls at the five blind
   spots, sync-origin extension. Unit tests on the subscriber's event → row
   mapping; backend integration test on the seams (admin mutation → row;
   sync job → origin attribution; label-only edit → row).
2. **Dashboard slice** — list page with filters and the nav item;
   `gql:fresh` before pushing; one dashboard E2E spec (edit a material, see
   the row).
3. **Noise check** — run the configurator save + a material edit on the
   preview and confirm the row counts are per-action, not per-row, before
   the deploy.
4. **Docs** — normative spec at `docs/specs/audit-log.md`; roadmap gets an
   owner-approved line (not part of this ADR).
