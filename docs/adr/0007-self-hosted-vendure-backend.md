# ADR 0007: Self-hosted Vendure backend replaces Web3Forms

- **Status:** accepted (supersedes ADR 0001)
- **Date:** 2026-10

## Context

ADR 0001 modeled orders as Web3Forms email requests: nothing stored, the
buyer-facing email text was the only record, pricing was display-trusted in
the browser. The commerce evaluation (`docs/commerce-platform-evaluation.md`)
and the platform evaluation (`docs/commerce-platform-evaluation.md`) chose a self-hosted
Vendure backend on a single Hetzner box, deployed by the same Cloudflare
Workers Builds that ship the frontend. Phase 1–4 of that migration are
complete and verified in production.

## Decision

1. **Orders are Vendure orders.** The checkout submits a `submitQuoteOrder`
   mutation to the shop API. The backend validates with a zod schema, stores
   the order (quoted prices and per-product text blocks as order/line custom
   fields), creates/updates the customer, and returns the order code. The
   normative behavior lives in `docs/specs/order-submission.md`.
2. **Pricing stays client-side for now; the backend stores quoted prices
   as-is** (the ADR 0002 pure core remains the price authority). Re-pricing
   integration — moving price authority into Vendure — is a separate future
   decision, out of scope here.
3. **Placeholder catalog.** Until real products exist in Vendure, every
   unseen product slug gets a 0-priced placeholder variant so orders can
   reference it; the Tina catalog remains the real catalog. When products are
   recreated natively in Vendure (the intended direction — one source of
   truth, not two), placeholders and this seam disappear.
4. **Emails leave through Cloudflare Email Sending's REST API** (Hetzner
   blocks SMTP). Two emails per order: buyer confirmation and owner
   notification. Previews/dev run file transport and cannot email a buyer.
5. **Deploy topology: one Cloudflare build deploys both halves.** The build
   command ships the repo tree to the box (`scripts/deploy-backend.ts`:
   per-stack flock, box-wide infra lock, stale-commit refusal, docker compose
   build/up with a health gate, automatic rollback to the previous image on a
   failed health gate), then `wrangler deploy`/`wrangler preview` ships the
   frontend — backend always lands first, from the same commit. Cloudflare's
   Rollback button is unsupported by design: it re-promotes an old frontend
   without the backend. Roll back by pushing a fresh commit.
6. **Migrations run inside the deploy, before the server boots** (one-shot
   `migrate` container, `service_completed_successfully` gate), against a
   database that previews re-copy from prod on every deploy.
7. **Previews are per-branch stacks on the same box**, sharing the infra
   stack's postgres and edge Caddy; teardown is automated hourly.
   Operational details: `docs/infra-setup.md`; external service inventory:
   `docs/external-services.md`.

## Consequences

- **Secret ownership** (full inventory in `docs/external-services.md`):
  box-permanent (`POSTGRES_PASSWORD`, `TOKEN_SECRET`, `SUPERADMIN_*` — plus
  password-manager backup), Cloudflare-only (`DEPLOY_*`, `TINA_CMS_*`,
  `GTM_ID`, `SITE_URL`, `PUBLIC_VENDURE_API_URL`), and Cloudflare-owned
  runtime secrets carried into the box at deploy time via `.env.cloudflare`
  (`CLOUDFLARE_EMAIL_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). **Cutover step:** the
  CF-owned values are set in the Cloudflare dashboard; after the first
  fragment deploy, delete the `CLOUDFLARE_*` lines from the box's
  `prod/.env`.
- Orders, customers and credentials are durable state on the box: backups
  (Hetzner server backups) and monitoring (uptime polling of `/health`) are
  operational requirements, documented in `docs/external-services.md`.
- The submission contract carries display text (`configText`,
  `setDiscountSummary`) plus quoted numbers. Structured per-field data can be
  added alongside when re-pricing lands; the text blocks stay as the
  human-readable email record.
- `fabformURL` and remaining Web3Forms references in CMS content are
  leftovers to clean in the content sweep.
