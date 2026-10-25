# Web3Forms → Vendure migration: working doc

Living document for the order-backend migration. Read this first in any new
session. Status, decisions, roadmap and working agreements live here; the
normative specs it changes are listed under [Docs to keep in sync](#docs-to-keep-in-sync).

> Last updated: 2026-10-25. Branch: `feat/vendure-backend`. Phase 2 frontend
> wiring is DONE but UNCOMMITTED unless the log below says otherwise.

## Why this exists

Orders used to be Web3Forms email submissions (ADR 0001): nothing stored, the
buyer-facing email text was the only record. We are replacing Web3Forms with a
self-hosted **Vendure** (Node + Postgres) on a dedicated Hetzner box:

- Vendure = API + order backend **including its own management UI**.
- The Astro/Svelte storefront and checkout stay ours (platform-evaluation §11).
- The **frontend pricing core stays the price authority** for now: the browser
  computes prices, and the backend stores them (order/line customFields) — the
  full server-side re-pricing integration (`OrderItemPriceCalculationStrategy`
  - set-discount promotion plugin, Barion, tax, invoicing) comes **one feature
    at a time, later**. See `docs/commerce-platform-evaluation.md` §6–§12.
- Emails on order changes via Vendure's email plugin; self-hosted SMTP
  (postfix container) in prod, file/mailbox transport locally.

## Session log (compressed)

- 2026-10-25: Phase 1 + 2a complete and committed (`feat/vendure-backend`:
  ad9903de backend, 645999a1 search/migrations/emails/admin-ui groundwork,
  37e109bf frontend submit, 6c71ee20 admin-ui-outside-workspace fix). 213/213
  site tests + backend check/test + lint + astro/svelte check all green.
  Local smoke tests passed end to end (order stored + both emails rendered).
  Hungarian hu.json translated (797/797). Custom Admin UI compile launched
  (~/.cache/babasarok-admin-ui) — verify `backend/admin-ui` NO wait: output
  moved to `~/.cache/babasarok-admin-ui`; if the compile didn't finish,
  re-run `pnpm -C backend run build-admin-ui` then restart server+worker and
  confirm `/admin-ui` shows Hungarian. Reviewer ledger history in
  /tmp/opencode/vendure-review.md (ephemeral — protocol is at its top).

## Where we are

- [x] **Phase 1 — backend works locally.** pnpm workspaces; `backend/` Vendure
      server: `QuoteOrderPlugin` (shop mutation `submitQuoteOrder` → real
      Vendure Order, state `ArrangingPayment`, custom orderPlacedStrategy marks
      it placed), buyer confirmation + owner notification emails (branded
      templates in `backend/email-templates/`), DB job queue + separate worker
      process, channel/zone/country bootstrap (`ChannelSetupPlugin`), baseline
      migration, Admin UI served at `/admin-ui` (+ custom Hungarian build via
      `backend/ui-translations/hu.json` + `build-admin-ui.ts`), docker compose
      (local postgres), CI on pnpm with a backend job.
- [x] **Phase 2a — frontend submits to Vendure.** `src/lib/order/submit.ts`
      posts a `submitQuoteOrder` GraphQL mutation; `CheckoutForm.svelte` no
      longer sends a web3forms key; conversion tracking (gtag) still fires only
      on success; the full old email-text contract (product blocks, set-discount
      summary, "ingyenes" wording, transaction id last) is preserved in the
      payload and unit-tested.
- [ ] **Phase 2b — docs & content sweep** (NEXT): ADR superseding 0001,
      `docs/specs/order-submission.md` rewrite, AGENTS.md pnpm commands, legal
      texts (`src/content/adatvedelem/_index.md` still names web3forms as
      processor; `src/content/terms/index.md` lists Web3Creative as host;
      retention claims need reconciling with "every submission is a stored
      Order row"), remove the unused `fabformURL` Tina field (requires a Tina
      Cloud schema push — see needs-from-you).
- [ ] **Phase 3 — Hetzner automation.** docker compose prod+test stacks
      (vendure, worker, postgres, postfix, caddy), deploy chain: merge to main →
      GH Action deploys backend over SSH (migrations run on boot) → on success
      triggers the Cloudflare Workers deploy hook → only then does the site
      build/deploy. Frontend and backend stay in sync by construction.
- [ ] **Phase 4 — previews.** Per-branch compose project on the box
      (`api-<branch>.…`), own bootstrapped DB (schema-change testing), torn
      down on PR close; Cloudflare preview builds point `PUBLIC_VENDURE_API_URL`
      at the test API.

## How to run things (current truth)

```bash
docker compose up -d postgres      # local DB
pnpm -C backend run dev            # server (dist/index.js) + email worker, watched
# Admin UI: http://localhost:4000/admin-ui  (login from backend/.env)
# Dev mailbox: http://localhost:4000/mailbox ; rendered emails: backend/email-out/
pnpm -C backend run check && pnpm -C backend test    # backend types + unit tests
pnpm run build                     # backend build + full site build (Tina + Astro)
pnpm run deploy                    # wrangler deploy (Cloudflare)
node --env-file=backend/.env backend/dist/generate-migration.js <name> --from-empty
pnpm -C backend run build-admin-ui # re-scaffold + build Admin UI after ui-translations change
# NOTE: compileUiExtensions never installs the scaffold deps itself, and the
# scaffold package.json is dependency-less (it expects classic-hoisted
# node_modules). After a fresh scaffold, make the scaffold self-contained:
#   cd ~/.cache/babasarok-admin-ui && pnpm add \
#     @vendure/admin-ui@<core-version> @vendure/common@<core-version> \
#     "@angular/cli@^19.2.5" "@angular/compiler@^19.2.4" \
#     "@angular/compiler-cli@^19.2.4" "@angular-devkit/build-angular@^19.2.5" \
#     rxjs@^7.8.1
# then `pnpm run build` there (or re-run build-admin-ui, which re-scaffolds
# and wipes the added deps — prefer building manually after the first setup).
```

Env: `backend/.env` (from `backend/.env.example`) holds DATABASE_URL,
SHOP_OWNER_EMAIL, ORDER_EMAIL_FROM, SUPERADMIN__, SMTP__, SHOP_COUNTRY_*,
ADMIN_URL. Site-side: `PUBLIC_VENDURE_API_URL` declared in `astro.config.ts`
env schema (default `http://localhost:4000`; prod/test values set per build).

## Key implementation facts (don't re-derive)

- **Placeholder catalog:** every order line references a Vendure
  `ProductVariant` (mandatory in the Order model). We upsert one placeholder
  per product, SKU `quote-<slug>`, price 0. All real prices live in custom
  fields: line `configText`/`quotedUnitPrice`/`quotedLineTotal`, order
  `orderTotal`/`delivery*`/`setDiscountSummary`/`termsAccepted`/
  `submissionTransactionId`. **Do not** create a customField named
  `transactionId` — that collides with the native (payments-derived)
  `Order.transactionId`.
- **"Placed":** the shop stops at `ArrangingPayment`;
  `QuoteOrderPlacedStrategy` marks placed there. Barion will revisit.
- **arrangingPaymentRequiresShipping: false** in `orderOptions.process` — no
  Vendure shipping methods yet; delivery is stored as data.
- **Emails** are processed by the job queue → needs the worker process;
  templates are plain HTML + handlebars via `HandlebarsHtmlGenerator` (the
  default generator is MJML-only). `deliveryFree` (client-computed boolean)
  drives "ingyenes" vs "(N Ft)" — a nominally-0 method must show "(0 Ft)".
- **Migrations, not synchronize** (server+worker share one DB; synchronize
  raced). Baseline generated with `--from-empty`; both entrypoints run
  migrations before bootstrap.
- **env parsing** is zod at boot (`backend/src/env.ts`); production requires
  SMTP_HOST + SUPERADMIN credentials.
- Local smoke test recipe: `curl -s localhost:4000/shop-api -H "Content-Type:
application/json" -d '{"query":"mutation { submitQuoteOrder(input: { ... })
{ __typename ... } }"}'` — see git log / ledger for a full example.

## The reviewer swarm (working agreement)

Three background subagents review the implementer's work continuously
(org-reviewer: code organisation; spec-reviewer: specs/ADR compliance +
unforeseen problems; arch-reviewer: seams for the future features — tax,
Barion, invoicing, multi-market, fulfillment — flagging over-building).
They communicate with the implementer over **`/tmp/opencode/vendure-review.md`**
(the shared ledger: protocol + findings + implementer responses). In a new
session: recreate that file (protocol is written at its top), relaunch the
reviewers with the same mandates, and keep them fed. Every [BLOCKER]/[MAJOR]
must be answered in the ledger before a phase counts as done. Past findings
and their resolutions are in the ledger's history sections.

## Infrastructure needs (what the agent needs from the user)

**Hetzner**

1. A dedicated VPS (Ubuntu 24.04, Docker installed). 2 vCPU/4GB is fine for
   prod+test+one preview; the Admin UI is lazy-loaded Angular, modest RAM.
2. SSH access for deploy: a deploy user + key. Recommended: a dedicated GitHub
   Environment secret `DEPLOY_SSH_KEY`, host `DEPLOY_HOST`, user `DEPLOY_USER`.
3. DNS (Cloudflare): A records `api.babasarok.net` and
   `api-test.babasarok.net` (and a wildcard `*.api-test…` or per-branch
   records) → server IP. **Set them DNS-only (grey cloud) or proxy with a
   permissive config**; Caddy on the box issues TLS automatically. Backend
   APIs on Cloudflare proxy: disable cache + allow WebSocket/POST; DNS-only is
   simpler for the first cut.
4. Mail deliverability (self-hosted postfix): Hetzner **PTR/rDNS record** for
   the IP → a mail hostname (e.g. `mail.babasarok.net`), plus **SPF, DKIM,
   DMARC** DNS records (DKIM key generated on the box during setup). This is
   the deliverability-critical part; budget an hour.
5. Decide the outbound sender address, e.g. `rendeles@babasarok.net`, and
   whether an existing mailbox receives the owner notification.

**Cloudflare (site deploys via Workers Builds)**

1. Build settings: build command `pnpm run build`, deploy command
   `npx wrangler deploy` (root scripts already chain backend+site).
2. Build env vars: `TINA_CMS_CLIENT_ID`, `TINA_CMS_CLIENT_TOKEN`,
   `GTM_ID`, `PUBLIC_VENDURE_API_URL=https://api.babasarok.net`
   (previews: `https://api-test.babasarok.net`), `SITE_URL`.
3. A **Deploy Hook** URL for the sync chain (backend deploy success → hook).
4. Preview branch deploys enabled (per-PR worker previews), with the preview
   env vars above.

**Tina Cloud** 5. After the `fabformURL` field removal lands, the Tina Cloud schema must be
re-pushed (`tinacms build` against the cloud or via the admin) or the
plain `pnpm run build` will fail until they match.

**Secrets inventory (env vars the backend stack needs in prod)** —
DATABASE_URL, TOKEN_SECRET (32+ chars), SHOP_OWNER_EMAIL, ORDER_EMAIL_FROM,
SMTP_* (postfix relay host/user/pass), SUPERADMIN_EMAIL/PASSWORD, API_ALLOWED_
ORIGINS (https://babasarok.net,https://www.babasarok.net), SHOP_COUNTRY_*,
ADMIN_URL.

## Risks / known limitations (accepted for now)

- Prices are display-trusted (no server recompute) — same trust level as
  web3forms; re-pricing integration is the next big milestone.
- `submitQuoteOrder` is public and creates placeholder products per unseen
  slug (spam vector; noted in code). Rate limiting / pre-created placeholders
  come with the pricing milestone.
- Vendure's native order totals read 0 Ft in the Admin UI until re-pricing
  lands; the real totals are in the custom fields and the emails.
- Admin UI Hungarian: shipped Vendure UI has **no hu**; the 797-key
  `ui-translations/hu.json` is translated and key-set/ICU-validated. The
  custom Admin UI build (`pnpm -C backend run build-admin-ui`, uses
  `command: "pnpm"` because the yarn scaffold trips over the repo's
  packageManager field) was kicked off but NOT verified — if
  `backend/admin-ui/` is missing or stale, re-run it and restart the server;
  the fallback is the bundled English UI.

## Docs to keep in sync

- `docs/adr/0001-orders-as-email-requests.md` → supersede with a new ADR.
- `docs/specs/order-submission.md` → rewrite submission/email sections.
- `docs/commerce-platform-evaluation.md` §12 open questions → close as they
  get decided (hosting now answered: Hetzner + docker compose).
- `AGENTS.md` → package manager (pnpm), backend commands.
- `docs/agents/issue-tracker.md` untouched.
