# External services inventory

Everything the site depends on that does **not** live in this repo: accounts,
dashboards, DNS, keys. The repo can be cloned fresh and still know nothing
about these — this page is the map. Runbook-style clicking instructions stay
in [infra-setup.md](infra-setup.md); this doc records _what exists and why_.

Last verified: 2026-10-25.

## Topology at a glance

```
Visitor ──▶ Cloudflare (babasarok.net zone, static site Worker)
                 │  checkout/order POST
                 ▼
        api.babasarok.net (DNS-only) ──▶ Hetzner box 178.105.79.2
                                          ├─ edge stack: Caddy (TLS, routing)
                                          │              postgres (preview DBs)
                                          ├─ prod stack: vendure + worker + postgres
                                          └─ preview stacks: vendure + worker (per branch)
Order emails ◀── Cloudflare Email Sending (REST, from the box over 443)
Content edits ──▶ Tina Cloud (CMS) ──▶ GitHub repo ──▶ Workers Builds (rebuild)
```

## Hetzner VPS

- **Host:** 178.105.79.2 (IPv4), `2a01:4f8:c013:832f::1` (IPv6, first address
  of the /64). ARM64 "CAX21" (4 vCPU / 8 GB / 80 GB), Ubuntu 26.04, location
  Falkenstein/Helsinki per the runbook. All stack images publish arm64 builds.
- **Firewall:** `ufw` allows 22/80/443 only. Notably **25/465 are blocked
  (Hetzner policy)** — this is why mail leaves via Cloudflare's REST API over
  443, never SMTP.
- **SSH keys** (see `~/.ssh/` on the user's machine):
  - `babasarok_bootstrap` — agent/root access. Stays on the user's machine,
    never leaves it, never goes into any CI variable.
  - `babasarok_cfdeploy` — least-privilege deploy key; authorized **only** in
    the `deploy` user's `authorized_keys` on the box, and pasted as
    `DEPLOY_SSH_KEY` into the Cloudflare build env. Not on this machine.
- **Box layout:** `/srv/babasarok/{infra,prod,<preview-slug>}`; each stack dir
  holds its `docker-compose.yml`, `.env` (box-permanent secrets), and
  `repo/` (fresh tree per deploy) plus `commit.txt` (last-deployed commit +
  timestamp, drives the stale-deploy refusal).
- **Secrets placement policy** (decided with the user):
  - Box-permanent, never in CI: `POSTGRES_PASSWORD`, `TOKEN_SECRET`,
    `SUPERADMIN_*` (superadmin also in the shared password manager).
  - Cloudflare-only, never on the box: `DEPLOY_HOST/USER/SSH_KEY`,
    `TINA_CMS_*`, `GTM_ID`, `SITE_URL`, `PUBLIC_VENDURE_API_URL`.
  - Cloudflare-owned runtime secrets carried into the box at deploy time via
    `.env.cloudflare` (env_file layering, last file wins):
    `CLOUDFLARE_EMAIL_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — rotation in the CF
    dashboard propagates on the next deploy.
- **Cron on the box:** nightly `docker system prune -af` (in the `deploy`
  user's crontab, installed by every deploy — note it runs as `deploy`, whose
  docker-group membership makes it work); hourly `preview-teardown.ts` plus
  crash-leftover cleanup (stale `incoming-*.tar` and `.env.cloudflare-*.tmp`
  files older than 2h are deleted).
- **Backups: Hetzner server backups** (paid, enabled in the Hetzner Cloud
  console — 7 rotating snapshots of the whole server incl. the postgres
  volume, taken on Hetzner's schedule). This covers box loss and volume
  corruption; single-file restores mean a full-server restore. The
  `babasarok-prod_pgdata` volume lives only on that server.
- **Monitoring: uptime.attilagreguss.co.uk** polls the prod health endpoint
  (`https://api.babasarok.net/health`, which Vendure serves) and alerts the
  owner on failure. Preview stacks are not polled.
- **Access for agents:** `ssh -i ~/.ssh/babasarok_bootstrap root@178.105.79.2`.
  Container logs via `docker logs <container>`; Cloudflare build logs are
  dashboard-only (see below).

## Cloudflare (one account, several products)

The zone `babasarok.net` and the Workers Builds service live in the same
account (account id `b64cf6f65472d9a85a44d39f7a68c81a`).

### DNS (zone babasarok.net)

| Type           | Name                       | Content                 | Proxy     |
| -------------- | -------------------------- | ----------------------- | --------- |
| A/AAAA         | `api`                      | box IPs (see above)     | No (grey) |
| A/AAAA         | `*`                        | box IPs (see above)     | No (grey) |
| TXT            | `_dmarc`                   | `v=DMARC1; p=none`      | —         |
| (per provider) | SPF/DKIM for Email Sending | as Cloudflare specifies | —         |

- DNS-only (not proxied) is deliberate: Caddy on the box issues its own TLS
  via HTTP-01; proxying would break that.
- The wildcard covers every preview host (`api-<slug>.babasarok.net`) and
  `www` (Caddy 301s `www` → apex; the site itself is served by the Worker).
- Old `api-test` records from the retired test stack are deletable.

### Workers Builds (static site + deploy chain)

- **Worker name: `babasarok-website`** — must match `wrangler.jsonc`'s
  `name`. (The dashboard URL shows the same string, but that's the build
  service path, not proof; the `name` field and the Worker are the pair that
  must agree. Prod deploys on `main` verify the current value.)
- **Build command:** `pnpm run build`. **Deploy command:** `pnpm run ship`
  — which first deploys the backend over SSH (health-gated, serialized,
  stale-refusing — see infra-setup §6–7), then runs `wrangler deploy`
  (production) or `wrangler preview` (non-main branch builds).
- **Preview quirk (known Cloudflare bug, workers-sdk#15682):** branch builds
  must use `wrangler preview`; `wrangler deploy` from a branch build fails
  with a misleading "name must match" error because `WRANGLER_CI_MATCH_TAG`
  carries the preview script's tag. `package.json`'s `deploy` dispatches on
  `DEPLOY_STACK` for this reason.
- **Rollback button: unsupported by design.** A CF rollback re-promotes an
  old frontend version _without_ redeploying the backend, breaking the
  backend+frontend same-commit invariant; and the box's `commit.txt` guard
  refuses builds of older commits anyway. Roll back by pushing a fresh
  commit (`git revert` + push, or `git commit --allow-empty` to re-ship).
- **Build env variables** (Production / Preview): `DEPLOY_HOST`,
  `DEPLOY_USER` (`deploy`), `DEPLOY_STACK` (`prod`/`preview`),
  `DEPLOY_SSH_KEY`, `PUBLIC_VENDURE_API_URL` (prod: `https://api.babasarok.net`;
  previews: none fixed — the preview build command derives
  `https://api-<slug>.babasarok.net` via `the shared previewSlug() helper (src/lib/preview-slug.ts)`), plus
  `TINA_CMS_*`, `GTM_ID`, `SITE_URL`.
- **Concurrency:** paid plan allows parallel builds that don't cancel each
  other; the per-stack `flock` + commit-timestamp guard on the box makes
  that safe (infra-setup §6.5).

### Email Sending (public beta)

- Vendure sends order emails through Cloudflare's **REST API** (custom
  `CloudflareEmailSender` in `backend/src/email/`), because SMTP ports are
  blocked on Hetzner. Requires the Workers **Paid** plan.- Secrets: `CLOUDFLARE_EMAIL_TOKEN` (API token), `CLOUDFLARE_ACCOUNT_ID` —
  set in the CF dashboard, carried to the box via `.env.cloudflare`.
- From address: `orders@babasarok.net` (`ORDER_EMAIL_FROM` on the box); buyer
  replies must reach a real mailbox, so Email Routing forwards
  `orders@babasarok.net` to the owner's gmail (see below).
- Admin link: the owner notification email deep-links to the order
  (`ADMIN_URL` + `orders/<id>`); the dashboard lives on the site
  (`https://babasarok.net/dashboard`, ADR 0008). `ADMIN_URL` is per-stack:
  previews are seeded with the prod dashboard and then updated by the deploy
  script to the preview's own site URL (parsed from `wrangler preview`
  output) right after the frontend deploy.
- Limitations surfaced during review: path-only attachments throw (future
  invoice milestone must inline content); suppressed recipients and
  permanent-bounce retries are not surfaced beyond the sender's nonzero
  throw when nothing is delivered/queued.

### Email Routing

- Forwards `orders@babasarok.net` (and the site's contact address) to
  **`halminoemi99@gmail.com`** — the owner's mailbox, also read from Tina
  content (`config.address.email`) as the owner-notification target.

## Tina Cloud

- CMS backend for content editing. Repo side: `tina/config.ts` reads
  `TINA_CMS_CLIENT_ID` / `TINA_CMS_CLIENT_TOKEN`; branch selection follows
  `WORKERS_CI_BRANCH`/CI fallbacks, defaulting to `main`.
- The committed Tina schema (`tina/tina-lock.json` is generated from it) must
  be **pushed to Tina Cloud** when collections change; local builds use
  `npm run build:local` (`--local --skip-cloud-checks`) to not require it.
- `fabformURL` is a legacy CMS field (pre-Vendure form target) still present
  in the schema/content but unused by code; removing it is the noted trigger
  for a Tina schema push.

## Analytics / tracking (loaded client-side)

- **Google Tag Manager** (`GTM_ID` build var) in `Base.astro`; consent-gated
  per [docs/specs/consent-tracking.md](specs/consent-tracking.md). Conversion
  tracking fires only on successful order submission (now the Vendure
  response, previously the Web3Forms submission).
- **Meta Pixel** loaded via GTM; same consent rules.
- No other third-party scripts ship.

## GitHub

- Canonical repo: `babasarok/babasarok-website` (transferred ownership — old
  URLs 301 to it; it is the same repo, not a fork).
- GitHub Actions runs PR checks only (no deploy); Cloudflare Workers Builds
  watches the repo and deploys on push to `main` (prod) and non-main branches
  (previews, when enabled).
- Issues live on `Gr3q/babasarok-website` (see `docs/agents/issue-tracker.md`).

## Retired / rejected (kept so nobody re-proposes them)

- **Web3Forms** — order/quote email form service, replaced by Vendure (ADR to
  supersede 0001 pending in the phase-2b sweep). No account should remain
  active; `fabformURL`/web3forms mentions in content are leftovers to clean.
- **Self-hosted postfix/DKIM on the box** — rejected: SMTP ports blocked,
  deliverability burden. No `mail` DNS records, no PTR requirement.
- **SMTP2GO/Mailgun** — alternatives considered 2026-10-25 for the same mail
  decision; Cloudflare Email Sending won.
- **Test stack** (`api-test.babasarok.net`) — retired; previews replaced it.
