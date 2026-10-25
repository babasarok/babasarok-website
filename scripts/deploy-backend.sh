#!/usr/bin/env bash
# Deploy the backend stack to the Hetzner box, health-gate it, and leave the
# frontend deploy (wrangler) to the caller. Runs INSIDE the Cloudflare
# Workers build process (user decision — not GitHub Actions).
#
# Requires (Cloudflare build env vars): DEPLOY_HOST, DEPLOY_USER,
# DEPLOY_STACK (prod|test — fail-closed), DEPLOY_SSH_KEY (private key text).
# The rsynced tree IS the built commit, so backend and frontend deploys can
# never come from different commits.
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_STACK:?DEPLOY_STACK is required (prod|test)}"

case "$DEPLOY_STACK" in
  prod | test) ;;
  *)
    echo "DEPLOY_STACK must be 'prod' or 'test', got '$DEPLOY_STACK'" >&2
    exit 1
    ;;
esac

keyfile="$(mktemp)"
cleanup() { rm -f "$keyfile"; }
trap cleanup EXIT

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  printf '%s\n' "$DEPLOY_SSH_KEY" > "$keyfile"
else
  echo "DEPLOY_SSH_KEY is required" >&2
  exit 1
fi
chmod 600 "$keyfile"

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
DIR="/srv/babasarok/$DEPLOY_STACK"
SSH="ssh -i $keyfile -o StrictHostKeyChecking=accept-new"

# Fresh tree each deploy: no stale files, no rsync dependency in the build
# image. The .env lives outside repo/ so it is never touched by deploys.
$SSH "$TARGET" "rm -rf $DIR/repo && mkdir -p $DIR/repo"
tar -c --exclude-vcs \
  --exclude=backend/node_modules \
  --exclude=backend/dist \
  --exclude=backend/email-out \
  --exclude=backend/.env \
  --exclude=backend/.env.* \
  package.json pnpm-workspace.yaml pnpm-lock.yaml Dockerfile .dockerignore backend deploy \
  | $SSH "$TARGET" "tar -xf - -C $DIR/repo"
$SSH "$TARGET" "cp $DIR/repo/deploy/$DEPLOY_STACK/docker-compose.yml $DIR/docker-compose.yml"

# Cloudflare-owned runtime secrets: written from the build env so rotation
# in the cloudflare dashboard propagates on the next deploy. Only allowlisted
# keys are carried; anything absent leaves the box's bootstrapped value.
# Piped via stdin (the secret never appears in the remote command line) and
# 600-chmod'd on the box.
{
  [ -n "${CLOUDFLARE_EMAIL_TOKEN:-}" ] && printf 'CLOUDFLARE_EMAIL_TOKEN=%s\n' "$CLOUDFLARE_EMAIL_TOKEN"
  [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && printf 'CLOUDFLARE_ACCOUNT_ID=%s\n' "$CLOUDFLARE_ACCOUNT_ID"
  true;
} | $SSH "$TARGET" "cat > $DIR/.env.cloudflare && chmod 600 $DIR/.env.cloudflare"

# Bring the stack up; --wait blocks until the vendure healthcheck is green,
# which is the gate before the frontend is allowed to deploy.
$SSH "$TARGET" "cd $DIR && docker compose up -d --build --wait --wait-timeout 300"

# The deploy restarted the worker; any job it had mid-flight is stuck in
# RUNNING forever (the queue never re-picks those). Requeue them.
$SSH "$TARGET" "cd $DIR && docker compose exec -T postgres psql -U babasarok -d babasarok -c \"update job_record set state='PENDING', attempts=0 where state='RUNNING';\""

# Attach the shared edge Caddy to every existing stack's network. The
# networks override is generated from the stacks that exist on the box —
# static declarations would fail on a not-yet-deployed stack, and
# pre-created networks break the stacks' own compose (label mismatch).
# An empty `networks:` is invalid compose, so the override file is only
# written (and only passed to compose) when at least one stack exists.
$SSH "$TARGET" "mkdir -p /srv/babasarok/infra && cp $DIR/repo/deploy/infra/docker-compose.yml $DIR/repo/deploy/infra/Caddyfile /srv/babasarok/infra/ && cd /srv/babasarok/infra && { echo networks:; for d in /srv/babasarok/*/repo; do [ -d \"\$d\" ] || continue; s=\$(basename \$(dirname \"\$d\")); printf '  babasarok-%s_default:\n    external: true\n' \"\$s\"; done; } > docker-compose.networks.yml; if [ -s docker-compose.networks.yml ] && ! grep -q external docker-compose.networks.yml; then rm docker-compose.networks.yml; fi; if [ -f docker-compose.networks.yml ]; then docker compose -f docker-compose.yml -f docker-compose.networks.yml up -d; else docker compose up -d; fi"

echo "backend $DEPLOY_STACK deployed and healthy"
