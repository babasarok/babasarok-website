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

### 2026-10-25 latest: TEST STACK RETIRED — previews replaced it

`DEPLOY_STACK=test` is gone (Cloudflare's Preview env runs
`DEPLOY_STACK=preview` per branch); prod is the only fixed stack. The shared
preview postgres moved into the infra stack (`babasarok-edge-postgres-1`,
own volume + password, fully separate from prod); preview stacks join
`babasarok-edge_default`. Supersedes the test-stack wording in the phase-3
topology bullets and the phase-4 design entry below (both were written when
the test stack existed). The networks override now pins the caddy service to
its own `default` network too — an override listing only external networks
REPLACES the default attachment, which 502'd previews after the test stack
went away. `deploy/test/` deleted; `api-test` DNS records can be removed.
Verified live: preview stack rebuilt against the new postgres, prod and
preview health endpoints 200.

### 2026-10-25 late: IN-FLIGHT / NEXT-SESSION TODO (read before anything else)

**Phase 3 is LIVE and verified**: prod (`https://api.babasarok.net`) healthy,
emails via CloudflareEmailSender (REST/SDK over 443; Hetzner blocks SMTP
25/465, 587 open but CF is 465-only). Superadmin: admin@babasarok.net,
password generated 2026-10-25 (in the shared password manager — do NOT store
in this doc). CF build env vars SET by user (DEPLOY_STACK=prod, DEPLOY_SSH_KEY
etc.). The **test stack is retired** — per-branch preview stacks replaced it
(see the 2026-10-25 latest entry); prod is the only fixed stack.

**UNCOMMITTED, in this working tree (finish FIRST):**
1. `scripts/deploy-backend.sh` — the `.env.cloudflare` fragment block was
   rewritten to the stdin-pipe form (secret never on the remote command
   line; `chmod 600` on box). bash -n passed; NOT yet deployed/tested.
2. `backend/src/env.ts` — TWO pending fixes NOT yet made:
   a. remove the dead `smtp:` field from the exported `env` object
      (vendure-config uses `env.email` only);
   b. gate hole [MAJOR per arch reviewer 17:27]: `EMAIL_TRANSPORT=smtp`
      without SMTP_HOST currently falls through to file transport — add a
      superRefine issue (production must never silently get file transport).
3. `backend/src/vendure-config.ts` — stale comment in emailPluginOptions:
   says "SMTP_PASS holds the API token"; reality is CLOUDFLARE_EMAIL_TOKEN.
4. `backend/package.json` dev script — add a migrate step before the
   watchers to kill the dev-side fresh-DB migration race:
   `tsc && node --env-file-if-exists=.env dist/migrate.js && (watchers...)`.
5. `scripts/deploy-backend.sh` — the generated edge networks-override must
   be SKIPPED (file removed) when no stack dirs exist; an empty `networks:`
   is invalid compose.
6. docs drift [MAJOR per spec reviewer 17:24] — fix in the phase-2b sweep:
   infra-setup §0 mail bullet still says "SHELVED pending authorization"
   and describes SMTP_* wiring (reality: REST sender is live code);
   migration doc status header is two phases behind; the test@/orders@
   From split and the owner-email subject change ("Új árajánlatkérés:
   <rendelésszám>") are recorded NOWHERE durable — add to the phase-2b list;
   vendure-migration.md has 5 stale mail/DNS passages.
7. **Test stack container is currently running with a bogus
   CLOUDFLARE_ACCOUNT_ID=OVERRIDE-SENTINEL** (from the env_file-layering
   proof); the next test deploy with a working fragment regenerates
   `.env.cloudflare` (manual runs carry no CF vars → empty fragment → .env
   values win) — verify `docker compose exec vendure env | grep
   CLOUDFLARE_ACCOUNT_ID` afterwards. ALSO: two consecutive deploy
   verification runs hit the 120s opencode shell timeout — rerun with
   timeout 300000 and investigate why they got slow.
8. User asked for a subagent to audit/fix prettierignore, tsconfig and
   eslint ignore configurations (files may already be fine) — NOT YET
   SPAWNED. Spawn a `general` subagent for it.
9. Reviewer reports awaiting integration (all in the ledger, which is
   EPHEMERAL): spec 17:24, org 17:23, arch 17:27 (+ an older arch
   session's seam verdict — all seams green for the roadmap). Key new
   items: ADR 0007 must record an ownership table for the three secret
   buckets + the cutover step "delete CLOUDFLARE_* from box .env after the
   first fragment deploy"; path-only attachments throw in
   CloudflareEmailSender (future invoice milestone wall); suppressed
   recipients and permanent-bounce retries unsurfaced; AGENTS.md gotcha
   replacement wording is in the org reviewer's 17:23 ledger entry.

**Secrets-placement policy (decided with the user, arch-verified
mechanism):** (a) box-permanent, never leave the box + password-manager
backup: POSTGRES_PASSWORD (compose interpolates it from the project-dir
.env ONLY — it cannot move), TOKEN_SECRET, SUPERADMIN_*; (b) cloudflare
build/deploy glue, never on the box: DEPLOY_SSH_KEY/HOST/USER,
TINA_CMS_*, GTM_ID, SITE_URL, PUBLIC_VENDURE_API_URL (per environment);
(c) cloudflare-owned runtime secrets carried INTO the box at deploy time
via `$DIR/.env.cloudflare` (compose env_file list, LAST file wins —
verified empirically; `environment:` would override both): 
CLOUDFLARE_EMAIL_TOKEN, CLOUDFLARE_ACCOUNT_ID. CF rotation propagates on
the next deploy (env_file content change → config-hash change → container
recreated). The user has NOT yet set CLOUDFLARE_* in the CF env — until
then the box .env values are live and the fragment stays empty (graceful).

**Three reviewers were re-spawned this session (spec ses_...1mi, org
...JtowgFv, arch ...CYqE — all completed; their findings are above).**
   10. The plain `pnpm install` run migrated `pnpm-lock.yaml` to the
   pnpm-12 lockfile format (committed in 29e02558, ~18k line churn): the
   CF builder's pnpm version MUST support that lockfile version or install
   fails — if the next CF build errors on the lockfile, pin
   `"packageManager": "pnpm@12.15.0"` in the root package.json so corepack
   aligns CF with local.
Phase-2b sweep remains the next phase after the TODOs above; then phase-4
previews (preview dirs follow /srv/babasarok/<name>/repo + the generated
networks override absorbs them).

### 2026-10-25 earlier

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
  **Reviewer mechanism (settled):** reviewer subagents cannot idle between
  self-wakes — they run bounded passes and end. The implementer re-invokes
  them (same sessionID where possible) at milestones; the ledger + this doc
  carry all durable state. Do not ask reviewers to "watch"/poll.

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
         slug (submit.ts:176) — reconcile or document (spec reviewer 15:41),
      10. record the "6 000 Ft előleg" fact wherever pricing behavior is
         specced (currently unrecorded; spec reviewer 15:41).
      Non-issues to strike: the `shippingAddress` "hydrate bug" is NOT a bug
      (simple-json column; a naive relations fix would throw — verified by
      spec reviewer against 3.8.1 sources).
- [ ] **Phase 3 — Hetzner automation.** docker compose prod+test stacks
      (vendure, worker, postgres; the edge Caddy and postfix are one shared
      pair for all stacks). Deploys run inside the
      Cloudflare Workers build (user decision): the deploy command SSHes to
      the box, brings the backend stack up, health-checks it, then
      (post-deploy smoke: submit a test order and verify the provider
      accepted both emails)
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
        served via `ADMIN_UI_PATH` env whose DEFAULT is the repo artifact
        path (the ~/.cache scaffold dir is build-time only, never the
        served default); rebuild + commit only when hu.json or the Vendure
        version changes.
      - **Test/preview stacks run `NODE_ENV=development`** so the
        production SMTP gate in env.ts doesn't crash-loop them (they get no
        SMTP_* on purpose → file transport). Verified benign: NODE_ENV gates
        only 3 benign places in Vendure 3.8.1 core. The env.ts gate stays as
        the fail-closed prod check. Test-stack env inventory = the prod one
        minus SMTP_*, with its own DATABASE_URL/TOKEN_SECRET/ports.
      - **rsync set:** the deploy must include the root workspace manifests
        (package.json, pnpm-workspace.yaml, pnpm-lock.yaml) alongside
        backend/ — the on-box build installs via the workspace.
      - **Mail delivery (decision changed 2026-10-25):** external SMTP
        provider, reached on port 587 (Hetzner blocks outbound 25 — verified
        from the box; unblock request declined by user). The self-hosted
        postfix relay is SHELVED (validated config preserved in git history,
        `deploy/infra` compose removed; DKIM volume wiped). Consequences:
        infra compose = edge Caddy only; PTR/mail-A records and the DKIM
        values handed to the user are OBSOLETE — provider's DNS records
        replace them (documented in docs/infra-setup.md §5); test/preview
        stacks keep NODE_ENV=development and get NO SMTP_* (the env.ts gate
        then protects buyers from test-stack emails via the provider too).
        Failure mode is loud (SMTP errors fail the email job visibly), not
        the silent queue-defer of the blocked-25 postfix path.
      - **Networks:** each stack has its own compose network (no network
        shared between stacks — alias collisions); the shared edge Caddy
        ATTACHES to each stack's network — declared IN the compose files as
        an external network (org reviewer: script-time `docker network
        connect` silently breaks on infra recreate, and `--alias` must be
        declared for name resolution to work). Infra joins a stack's network
        when the stack is created (deploy-script step; re-run on preview
        create/teardown). **Never publish the vendure API port either** —
        published ports bypass ufw entirely (Docker docs).
      - **Migration strategy:** one-shot `migrate` compose service runs
        before `up` (race bites on every schema-changing deploy, not just
        fresh DBs); final say in the phase-2b ADR.
      - **Health check:** `/health` middleware on the Vendure server; the
        deploy chain gates `wrangler deploy` on it.
      - **Deploy/SSH keys split:** agent bootstrap key (root, user machine
        only) ≠ CF `DEPLOY_SSH_KEY` (deploy user, docker group only).
- [x] **Phase 4 — previews.** Per-branch compose project on the box,
      branch DB dropped and re-copied from prod on every deploy, torn down
      by a daily cron when the branch disappears. Design (settled
      2026-10-25, runbook in docs/infra-setup.md §7): branch → slug via
      `scripts/preview-slug.sh` (fail-closed); preview stacks have NO
      postgres container — every branch DB lives inside the TEST stack's
      postgres instance, preview containers join `babasarok-test_default`
      (where the edge Caddy is already attached), and the copy is
      `pg_dump` prod → `psql` into the branch DB, then the branch's
      migrations run on top. Routing: generated per-branch Caddy snippets
      (`/srv/babasarok/infra/previews/<slug>.caddy`), wildcard DNS-only
      `*` records, per-host HTTP-01 certs — no DNS-01 token needed (the
      earlier DNS-01 assumption is obsolete). Branch detection uses
      Workers Builds' auto-injected `WORKERS_CI_BRANCH`. Verified live on
      the box with a test preview deploy. The re-pricing-seam build-context
      note (backend importing `src/lib` needs the image to carry it or the
      core extracted to a workspace package) still applies — keep it in
      the phase-2b ADR.

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
  `transactionId` — in 3.8.1 the admin-API `OrderFilterParameter`/
  `OrderSortParameter` derive a `transactionId` field from the order's
  payments, so a same-named customField collides in the SDL.
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

- **One VPS, not more.** prod + per-branch previews run as separate
  docker-compose projects on the same box (the test stack was retired once
  previews proved out — see the 2026-10-25 latest session-log entry).
  Machine: Hetzner **CAX21** (ARM64,
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
- DNS (Cloudflare): wildcard A + AAAA records (`*` and `api`) → server IP,
  DNS-only (grey cloud); Caddy on the box issues TLS. (The old `api-test`
  records can be deleted.)
- Mail deliverability (self-hosted postfix): Hetzner **PTR/rDNS** for the IP →
  `mail.babasarok.net`, plus SPF/DKIM/DMARC records (DKIM key generated on the
  box during setup).
- Decide: outbound sender address (e.g. `rendeles@babasarok.net`) and whether
  an existing mailbox receives the owner notification.

**Cloudflare build env vars** — `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
`TINA_CMS_CLIENT_ID`, `TINA_CMS_CLIENT_TOKEN`, `GTM_ID`, `SITE_URL`,
`PUBLIC_VENDURE_API_URL=https://api.babasarok.net` (previews:
`https://api-<slug>.babasarok.net`, derived per branch).

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
