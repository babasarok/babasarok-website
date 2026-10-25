# Infra setup — step-by-step (user runbook)

What you click/create, in order. Wherever it says **"tell me"**, that's the
signal for me (the agent) to take over the next piece. Never paste the private
key into chat — it goes into the Cloudflare dashboard by you.

## 0. Decisions needed from you (can answer in chat)

- [ ] Outbound sender address for order emails — proposed:
      `rendeles@babasarok.net`.
- [ ] Which mailbox receives the owner notification (an existing mailbox is
      fine; tell me the address).

## 1. Generate a deploy SSH key (local machine)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/babasarok_deploy -C "babasarok-deploy" -N ""
```

No passphrase (the Cloudflare build must read it non-interactively). This one
key is used both by me (to bootstrap the box over SSH from this machine) and
by the Cloudflare build (as the `DEPLOY_SSH_KEY` build variable).

## 2. Hetzner: create the VPS (~5 min)

One box hosts prod + test + previews. No need for three.

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
   `~/.ssh/babasarok_deploy.pub`. Name it `babasarok-deploy`.
6. Create → note the **IPv4 address** → **tell me the IP**.

## 3. Hetzner: set PTR/rDNS (mail deliverability — required)

1. Server detail page → **Networking** tab → click the attached private IP /
   **Edit DNS** (Reverse DNS).
2. Set the rDNS of the IPv4 address to **`mail.babasarok.net`**.

## 4. Cloudflare DNS (babasarok.net zone)

Add these records (type A, **DNS-only = grey cloud**, NOT proxied — Caddy on
the box issues its own TLS):

| Type | Name      | Content        | Proxy |
|------|-----------|----------------|-------|
| A    | `api`     | `<server IPv4>` | No   |
| A    | `api-test`| `<server IPv4>` | No   |

(Per-branch preview hostnames like `pr42.api-test` can be wildcarded later:
`A * .api-test` if Cloudflare allows it on your plan, else we add records per
branch — I'll handle that in phase 4.)

Then **tell me** — I bootstrap the server (Docker, deploy user, firewall,
Caddy, compose stacks, DKIM key generation) over SSH using
`~/.ssh/babasarok_deploy`, and report back two DNS TXT values for DKIM.

## 5. Mail DNS records (after my server bootstrap)

When I give you the DKIM key, add in Cloudflare DNS:

| Type | Name                        | Content (value I provide) |
|------|-----------------------------|---------------------------|
| TXT  | `babasarok.net`             | `v=spf1 a:mail.babasarok.net ~all` (exact value from me) |
| TXT  | `<selector>._domainkey`     | `v=DKIM1; k=rsa; p=<key>` (from me) |
| TXT  | `_dmarc`                    | `v=DMARC1; p=none; rua=mailto:<your mailbox>` |
| MX   | `babasarok.net` (only if the owner mailbox lives on this domain) | `10 mail.babasarok.net` |

`p=none` is deliberate for launch (monitor, don't reject); we tighten to
`quarantine` once deliverability is confirmed.

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
   - `DEPLOY_SSH_KEY` = contents of `~/.ssh/babasarok_deploy` (the **private**
     key, multi-line — paste as-is)
   - `PUBLIC_VENDURE_API_URL` = `https://api.babasarok.net`
   - `TINA_CMS_CLIENT_ID`, `TINA_CMS_CLIENT_TOKEN` (copy from current build
     settings if already set)
   - `GTM_ID`, `SITE_URL` (same)
3. **Preview variables** (Preview env): same list, except
   `PUBLIC_VENDURE_API_URL` = `https://api-test.babasarok.net`.
4. Enable **preview branch deploys** (non-production branches).

## 7. Done — what happens next

Once you've done §2–§4 and told me, I build and run (phase 3): server
bootstrap script, prod + test compose stacks, the `pnpm run deploy` chain,
and a first end-to-end deploy; then per-branch previews (phase 4). Tina Cloud
schema push is only needed when we remove the `fabformURL` field.
