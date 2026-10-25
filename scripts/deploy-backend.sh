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

# Bring the stack up; --wait blocks until the vendure healthcheck is green,
# which is the gate before the frontend is allowed to deploy.
$SSH "$TARGET" "cd $DIR && docker compose up -d --build --wait --wait-timeout 300"

# Attach the shared edge Caddy to this stack's network (idempotent; the
# network is created by the stack's compose run above). The Caddyfile ships
# with the deploy. Pre-create both stack networks so the edge compose never
# fails on a not-yet-deployed stack.
$SSH "$TARGET" "mkdir -p /srv/babasarok/infra && cp $DIR/repo/deploy/infra/docker-compose.yml $DIR/repo/deploy/infra/Caddyfile /srv/babasarok/infra/ && docker network create babasarok-prod_default 2>/dev/null; docker network create babasarok-test_default 2>/dev/null; cd /srv/babasarok/infra && docker compose up -d"

echo "backend $DEPLOY_STACK deployed and healthy"
