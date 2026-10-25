# Infra setup — step-by-step (user runbook)

What you click/create, in order. Wherever it says **"tell me"**, that's the
signal for me (the agent) to take over the next piece. Never paste the private
key into chat — it goes into the Cloudflare dashboard by you.

## 0. Decisions (ANSWERED 2026-10-25)

- [x] Outbound sender address for order emails: **`orders@babasarok.net`**
      (`ORDER_EMAIL_FROM`). Multi-country rollout intent noted — the
      SHOP_COUNTRY_* env seam already exists; per-market sender addresses are
      a decision for the multi-market milestone, not now.
- [x] Owner notification mailbox: **`halminoemi99@gmail.com`** — the site's
      current contact email (Tina `config.address.email`), read from CMS
      content, not hard-coded in infra.
- [x] **Mail delivery: Cloudflare Email Sending** (public beta; chosen over
      SMTP2GO/Mailgun 2026-10-25) — **SHELVED pending billing authorization**
      for the Workers Paid plan (user awaiting approval, 2026-10-25). When
      un-shelved: verify `babasarok.net` in Email Service, add its DNS
      records, create SMTP credentials into `backend/.env`
      (`SMTP_HOST/PORT/USER/PASS/SECURE`). Requires the **Workers Paid plan**
      ($5/mo, 3,000 emails/mo included, then $0.35/1k) and exposes
      authenticated SMTP — Vendure plugs in via the existing SMTP_* env with
      zero code change. Until then the env.ts gate keeps PROD undeployable
      (deliberate fail-closed: no silent no-email prod); the deploy chain is
      built and verified against the TEST stack (file transport) first. The
      earlier self-hosted postfix/DKIM plan stays shelved — §3 and the
      `mail` DNS records are NOT needed. Only the PROD stack gets SMTP_*
      credentials; preview stacks stay on file transport (env.ts gate
      enforces it). Keep Email Routing + the `orders@babasarok.net` forward
      address — buyer replies to the sender address need a real destination.

## 1. Generate SSH keys (local machine)

Bootstrap key (agent/root — stays on your machine only):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/babasarok_bootstrap -C "babasarok-bootstrap" -N ""
```

Cloudflare deploy key (least-privilege: lands only in the `deploy` user's
`authorized_keys` and as the `DEPLOY_SSH_KEY` build variable — no root, no
shell access to anything else):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/babasarok_cfdeploy -C "babasarok-cf-deploy" -N ""
```

No passphrases (non-interactive use). Give me the **bootstrap** key path when
the server exists; the **cfdeploy private key** is what you paste into
Cloudflare in §6.

## 2. Hetzner: create the VPS (~5 min)

One box hosts prod + previews. No need for more.

1. [cloud.hetzner.com](https://cloud.hetzner.com) → choose/create a project →
   **Add Server**.
2. Location: `Falkenstein` or `Helsinki` (eu-central, low latency to HU).
3. Image: **Ubuntu 26.04** (current LTS; user's pick). If Docker's official
   apt repo hasn't caught up to the new release yet, the workaround is
   pinning the install to the 24.04 repo or Docker's convenience script —
   I handle this during bootstrap.
4. Type: cost-optimized **CAX21** (ARM64, 4 vCPU / 8 GB / 80 GB,
   €12.59/mo + €0.60 IPv4 = €13.19/mo — user's pick for headroom; the minimal
   fit would be CAX11 2 vCPU/4 GB ≈ €5.99/mo). ARM is verified fine: every
   image in the stack (postgres, node, caddy, postfix-relay) publishes arm64
   builds, and the site + Admin UI builds happen off-box.
5. SSH key: **Add new key** → paste the contents of
   `~/.ssh/babasarok_bootstrap.pub`. Name it `babasarok-bootstrap`.
6. Create → note the **IPv4 address** → **tell me the IP**.

## 3. Hetzner: PTR/rDNS — NOT NEEDED anymore

Was required for self-hosted mail; with the external provider decision, no
mail originates from this box. Skip this step (it remains documented in git
history in case self-hosted mail ever returns).

## 4. Cloudflare DNS (babasarok.net zone)

Add these records (type A, **DNS-only = grey cloud**, NOT proxied — Caddy on
the box issues its own TLS):

| Type | Name  | Content                 | Proxy |
| ---- | ----- | ----------------------- | ----- |
| A    | `api` | `178.105.79.2`          | No    |
| A    | `*`   | `178.105.79.2`          | No    |
| AAAA | `api` | `2a01:4f8:c013:832f::1` | No    |
| AAAA | `*`   | `2a01:4f8:c013:832f::1` | No    |

(The server's primary IPv6 is the first address of its /64; the /64 itself is
not a record target. Verified live on the box: `ip -6 addr` →
`2a01:4f8:c013:832f::1/64`. No `mail` host records — the provider decision
removed them.)

(The wildcard `*` covers every preview host `api-<slug>.babasarok.net`, plus
`www` — the Caddyfile 301-redirects www to the apex since it is unused. The
`api-test` records from before the test stack was retired can be deleted.)

Then **tell me** — I bootstrap the server (Docker, deploy user, firewall,
Caddy, compose stacks, DKIM key generation) over SSH using
`~/.ssh/babasarok_bootstrap`, and report back two DNS TXT values for DKIM.

> Server state after bootstrap (2026-10-25): Docker 29.1.3 + compose 2.40.3
> installed; `deploy` user (docker group) authorized with **only**
> `babasarok_cfdeploy`; root authorized with **only** `babasarok_bootstrap`;
> ufw allows 22/80/443; stack home `/srv/babasarok`. **Prod and the first
> preview are deployed and verified end to end** (prod:
> `https://api.babasarok.net`, preview:
> `https://api-vendure-preview-test.babasarok.net` — Caddy auto-TLS, one-shot
> migrations, health-gated deploys, emails via the Cloudflare REST API from
> the box). Prod secrets live in `/srv/babasarok/prod/.env` and the shared
> password manager (superadmin: `admin@babasarok.net`).

## 5. Mail DNS records (from the provider, replaces the old DKIM plan)

After you create the provider account and verify `babasarok.net`, the
provider gives you the exact records (typically: SPF with their `include:`,
two or three DKIM CNAMES/TXTs). Add those to Cloudflare exactly as they
specify, plus keep this one:

| Type | Name     | Content            |
| ---- | -------- | ------------------ |
| TXT  | `_dmarc` | `v=DMARC1; p=none` |

`p=none` is deliberate for launch (monitor, don't reject); tighten to
`quarantine` once deliverability is confirmed. The SPF/DKIM values I handed
over earlier (self-hosted DKIM) are obsolete — discard them.

## 6. Cloudflare Workers Builds (dashboard, babasarok worker)

1. **Workers & Pages** → `babasarok` (site) → **Settings** → **Builds &
   deployments** (or Build settings):
   - **Build command:** `pnpm run build`
   - **Deploy command:** `pnpm run deploy` — I extend this script so it
     deploys the backend over SSH, waits for its health check, and only then
     runs `npx wrangler deploy`. Backend always lands before the frontend,
     inside the same Cloudflare build (no GitHub Actions deploy, no hook).
2. **Environment variables** (Production; mark sensitive ones as secret):
   - `DEPLOY_HOST` = server IPv4
   - `DEPLOY_USER` = `deploy`
   - `DEPLOY_STACK` = `prod` (Preview env: `preview`)
   - `DEPLOY_SSH_KEY` = contents of `~/.ssh/babasarok_cfdeploy` (the **private**
     key, multi-line — paste as-is)
   - `PUBLIC_VENDURE_API_URL` = `https://api.babasarok.net`
   - `TINA_CMS_CLIENT_ID`, `TINA_CMS_CLIENT_TOKEN` (copy from current build
     settings if already set)
   - `GTM_ID`, `SITE_URL` (same)
3. **Preview variables** (Preview env): same list, except
   `DEPLOY_STACK` = `preview`. Do NOT set a fixed `PUBLIC_VENDURE_API_URL`
   for previews — the build command derives it per branch (next item).
4. Enable **preview branch deploys** (non-production branches). Preview
   builds inject `WORKERS_CI_BRANCH` automatically; the deploy script is
   fail-closed otherwise — no/unknown `DEPLOY_STACK` aborts instead of
   guessing, and a preview build can never touch the prod stack.

## 7. Preview stacks (phase 4) — how they work

Every non-`main` branch with preview deploys enabled gets its own backend
stack on the box:

- **Stack identity** comes from the branch: `WORKERS_CI_BRANCH` is
  sanitised into a slug by `scripts/preview-slug.sh` (fail-closed on
  garbage). The slug names the stack dir `/srv/babasarok/<slug>`, the
  compose project (`babasarok-<slug>`), the container alias
  (`vendure-<slug>`), the API host `api-<slug>.babasarok.net` and the
  database `babasarok_preview_<slug>`. The same slug must drive the
  frontend build — the Preview build command should be:
  `export PUBLIC_VENDURE_API_URL="https://api-$(bash scripts/preview-slug.sh "$WORKERS_CI_BRANCH").babasarok.net" && pnpm run build`
  (the Preview _command_ stays `pnpm run deploy`, which now deploys the
  preview backend before `wrangler preview`).
- **Database lifecycle (per deploy):** the branch database is dropped and
  recreated from a live dump of the prod database on every deploy, then the
  branch's migrations run on top. Previews therefore always test branch
  schema changes against fresh prod data. No postgres container per
  branch: all preview databases live inside the shared preview postgres in
  the **infra** stack (`babasarok-edge-postgres-1`, its own volume, fully
  separate from prod; preview containers join the infra network, where
  `postgres` resolves), and teardown is a plain `DROP DATABASE`.
- **No email:** previews get no `EMAIL_TRANSPORT`/`SMTP_*`, so they run
  file transport and physically cannot mail a real buyer.
- **Routing/TLS:** `deploy/infra/Caddyfile` imports one snippet per
  preview (`/etc/caddy/previews/<slug>.caddy`), written and reloaded by the
  deploy script. Certificates are issued per-host via HTTP-01 on port 80.
- **DNS (one-time, user step):** add wildcard DNS-only records to the
  Cloudflare zone — `A  *  178.105.79.2` and `AAAA  *  2a01:4f8:c013:832f::1`
  (same IPs as §4). DNS-only, like the api records.
- **Teardown:** a daily cron on the box (`preview-teardown.sh`, installed
  by every deploy) checks each preview's recorded branch against origin;
  a branch that no longer exists gets its containers, database, route
  snippet and directory removed automatically.

## 8. Done — what happens next

Once you've done §2–§7 and told me, I build and run: server bootstrap
script, the prod compose stack, the `pnpm run deploy` chain, a first
end-to-end deploy, and preview stacks. Tina Cloud schema push is only
needed when we remove the `fabformURL` field.
