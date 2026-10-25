# Web3Forms → Vendure migration: working doc

Living document for the order-backend migration. Read this first in any new
session. Status, decisions, roadmap and working agreements live here; the
normative specs it changes are listed under [Docs to keep in sync](#docs-to-keep-in-sync).

> Last updated: 2026-10-25. Branch: `feat/vendure-backend`. Phase 2 frontend
> wiring is committed. The user-side infra runbook is
> [docs/infra-setup.md](docs/infra-setup.md).

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
  Hungarian Admin UI DONE and verified: hu.json translated (797/797), custom
  Admin UI compiled at ~/.cache/babasarok-admin-ui (self-contained
  node_modules, see build-admin-ui.ts + runbook below), served at /admin-ui
  with defaultLanguage hu and /admin-ui/i18n-messages/hu.json returning
  Hungarian strings. Reviewer ledger history in
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
      retention/reconciliation wording), remove `fabformURL` (needs Tina Cloud
      push). Plus code hygiene from the org reviewer (ledger 15:32 entry,
      preserved here):
      1. migration race on fresh DBs — server+worker both run `runMigrations`
         unsynchronized; consider server-only migrations (NOTE: this
         contradicts the earlier "both entrypoints migrate" decision — decide
         and record in the ADR),
      2. owner-email admin link → `orders/:id`,
      3. extract shared `partials/order-summary.hbs` from the two email
         templates,
      4. fix inaccurate comments in vendure-config.ts (no native
         `transactionId` field in 3.8.1; AdminUiPlugin port rationale moot),
      5. un-export `QuoteOrderPlacedStrategy` (no importer),
      6. gitignore `backend/.vendure/` (committed telemetry file),
      7. `.env.example`: add SHOP_COUNTRY_CODE/NAME and ADMIN_URL,
      8. replace the `Record<string, unknown>` payload bag in
         `src/lib/order/submit.ts` (+ mirrored test type) with a named
         exported interface (repo rule: no index-signature prop bags),
      9. slug audit: for 8 products the order slug carries `product_id` ≠
         slug (submit.ts:176) — reconcile or document,
      10. record the "6 000 Ft előleg" fact wherever pricing behavior is
         specced (currently unrecorded).
      Non-issues to strike: the `shippingAddress` "hydrate bug" is NOT a bug
      (simple-json column; a naive relations fix would throw — verified by
      spec reviewer against 3.8.1 sources).
- [ ] **Phase 3 — Hetzner automation.** docker compose prod+test stacks
      (vendure, worker, postgres, postfix, caddy). Deploys run inside the
      Cloudflare Workers build (user decision): the deploy command SSHes to
      the box, brings the backend stack up, health-checks it, then
      `npx wrangler deploy` — backend-before-frontend by construction. Stack
      selection is fail-closed via the `DEPLOY_STACK` env var (`prod`/`test`;
      missing/unknown aborts). No GitHub Actions deploy, no deploy hook. See
      docs/infra-setup.md for the user-side runbook. **Phase-3 design
      decisions (architecture reviewer 15:46, settled):**
      - **Code/deploy path:** CF build has no Docker daemon — the deploy
        command rsyncs the backend (source + manifests, small) from the CF
        build workspace (already pinned to the built commit) over SSH, and
        the box runs `docker compose build && up -d`. SHA-consistent by
        construction; no registry, no GitHub deploy key.
      - **Topology:** ONE shared edge Caddy (80/443; routes api/api-test/
        future preview hosts) and ONE shared postfix for all stacks; each
        stack = vendure + worker + postgres only. Non-prod stacks get no
        SMTP_* env → file transport, so previews physically cannot email
        real buyers.
      - **Admin UI artifact:** commit the built static artifact to the repo
        (`backend/admin-ui-dist/`), `build-admin-ui.ts` copies it there,
        served via `ADMIN_UI_PATH` env (default keeps the local ~/.cache
        path for dev); rebuild + commit only when hu.json or the Vendure
        version changes.
      - **Migration strategy:** one-shot `migrate` compose service runs
        before `up` (race bites on every schema-changing deploy, not just
        fresh DBs); final say in the phase-2b ADR.
      - **Health check:** `/health` middleware on the Vendure server; the
        deploy chain gates `wrangler deploy` on it.
      - **Deploy/SSH keys split:** agent bootstrap key (root, user machine
        only) ≠ CF `DEPLOY_SSH_KEY` (deploy user, docker group only).
- [ ] **Phase 4 — previews.** Per-branch compose project on the box, own
      bootstrapped DB (schema-change testing), torn down on PR close. Open
      wiring (architecture reviewer 15:46): per-branch API URLs must be
      derived in the deploy/build script from the branch env var (CF preview
      vars are uniform across branches); wildcard TLS over the preview hosts
      needs DNS-01 + a scoped Cloudflare API token on the box (user must
      create the token — request when phase 4 starts); teardown and
      test-stack deploy triggers to be defined (deploy hook vs branch
      detection).

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
# node_modules). After a fresh scaffold, make the scaffold self-contained —
# install @vendure/admin-ui + @vendure/common + the Angular 19 toolchain
# (cli, compiler, compiler-cli, @angular-devkit/build-angular) + rxjs +
# lodash + tslib + zone.js as DIRECT deps of ~/.cache/babasarok-admin-ui
# (pnpm's strict layout won't hoist admin-ui's transitive deps to it), then
# `pnpm run build` there. build-admin-ui.ts re-scaffolds and wipes those deps,
# so after its scaffold step re-run the pnpm add + pnpm run build manually.
# The vendure-ui-config.json copy into dist/browser is automated.
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

The full click-by-click runbook for these steps lives in
[docs/infra-setup.md](docs/infra-setup.md) — point the user at that.

- **One VPS, not three.** prod + test + per-branch previews run as separate
  docker-compose projects on the same box. Machine: Hetzner **CAX21** (ARM64,
  4 vCPU/8 GB, €12.59 + €0.60 IPv4 = €13.19/mo; user's pick for
  headroom) — ARM is fine, all stack images (postgres/node/caddy/postfix)
  publish arm64.
- **Deploy happens inside the Cloudflare Workers Builds process** (user
  decision, NOT GitHub Actions): the CF build command builds backend+site, the
  deploy command SSHes to the box (backend compose pull/up + migrations +
  health check) and only then runs `npx wrangler deploy` for the frontend.
  Backend-before-frontend ordering is enforced inside the single deploy step.
  GH Actions keeps only PR checks. Needs `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
  `DEPLOY_USER` as **Cloudflare build env vars** (not GitHub secrets).
  No separate deploy hook — with both deploys in one pipeline the hook is
  unnecessary.
- DNS (Cloudflare): A records `api.babasarok.net` and `api-test.babasarok.net`
  → server IP, DNS-only (grey cloud); Caddy on the box issues TLS.
- Mail deliverability (self-hosted postfix): Hetzner **PTR/rDNS** for the IP →
  `mail.babasarok.net`, plus SPF/DKIM/DMARC records (DKIM key generated on the
  box during setup).
- Decide: outbound sender address (e.g. `rendeles@babasarok.net`) and whether
  an existing mailbox receives the owner notification.

**Cloudflare build env vars** — `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
`TINA_CMS_CLIENT_ID`, `TINA_CMS_CLIENT_TOKEN`, `GTM_ID`, `SITE_URL`,
`PUBLIC_VENDURE_API_URL=https://api.babasarok.net` (previews:
`https://api-test.babasarok.net`).

**Tina Cloud**: after the `fabformURL` field removal lands, the Tina Cloud
schema must be re-pushed or plain `pnpm run build` fails until they match.
Local Tina testing uses `pnpm run build:local`.

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
  `ui-translations/hu.json` is translated and the custom Admin UI build
  verified serving at `/admin-ui` with `defaultLanguage: hu` (build lives
  self-contained in `~/.cache/babasarok-admin-ui`; runbook above).

## Docs to keep in sync

- `docs/adr/0001-orders-as-email-requests.md` → supersede with a new ADR.
- `docs/specs/order-submission.md` → rewrite submission/email sections.
- `docs/commerce-platform-evaluation.md` §12 open questions → close as they
  get decided (hosting now answered: Hetzner + docker compose).
- `AGENTS.md` → package manager (pnpm), backend commands.
- `docs/agents/issue-tracker.md` untouched.
