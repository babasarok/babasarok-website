#!/usr/bin/env bash
# Deploy the backend stack to the Hetzner box, health-gate it, and leave the
# frontend deploy (wrangler) to the caller. Runs INSIDE the Cloudflare
# Workers build process (user decision — not GitHub Actions).
#
# Requires (Cloudflare build env vars): DEPLOY_HOST, DEPLOY_USER,
# DEPLOY_SSH_KEY (private key text), and DEPLOY_STACK:
#   prod|test  — fixed stacks under /srv/babasarok/<stack>
#   preview    — per-branch stack; WORKERS_CI_BRANCH (injected by Workers
#                Builds) names the stack dir, compose project and database
#
# The rsynced tree IS the built commit, so backend and frontend deploys can
# never come from different commits.
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_STACK:?DEPLOY_STACK is required (prod|test|preview)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH=""
SLUG=""

case "$DEPLOY_STACK" in
  prod | test) ;;
  preview)
    : "${WORKERS_CI_BRANCH:?WORKERS_CI_BRANCH must be set (Workers Builds injects it)}"
    case "$WORKERS_CI_BRANCH" in
      *"'"* | *\\* | *'"'*)
        echo "WORKERS_CI_BRANCH contains a quote character, refusing" >&2
        exit 1
        ;;
    esac
    SLUG="$(bash "$SCRIPT_DIR/preview-slug.sh" "$WORKERS_CI_BRANCH")"
    BRANCH="$WORKERS_CI_BRANCH"
    ;;
  *)
    echo "DEPLOY_STACK must be 'prod', 'test' or 'preview', got '$DEPLOY_STACK'" >&2
    exit 1
    ;;
esac

STACK="${SLUG:-$DEPLOY_STACK}"
DIR="/srv/babasarok/$STACK"
TEST_PG="babasarok-test-postgres-1"
PROD_PG="babasarok-prod-postgres-1"
DB="babasarok_preview_$SLUG"

keyfile="$(mktemp)"
cleanup() { rm -f "$keyfile"; }
trap cleanup EXIT

if [[ -z "${DEPLOY_SSH_KEY:-}" ]]; then
  echo "DEPLOY_SSH_KEY is required" >&2
  exit 1
fi

# Cloudflare build env can mangle multi-line secrets (newlines stripped or
# turned into spaces), corrupting a PEM key. A base64-encoded key survives;
# accept both forms.
if [[ "$DEPLOY_SSH_KEY" == *"-----BEGIN"* ]]; then
  printf '%s\n' "$DEPLOY_SSH_KEY" > "$keyfile"
else
  base64 -d -i <<<"$DEPLOY_SSH_KEY" > "$keyfile"
fi
chmod 600 "$keyfile"

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
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

if [[ "$DEPLOY_STACK" == preview ]]; then
  # Record the branch for the teardown cron (it checks whether the branch
  # still exists on origin). The .env is provisioned once on first deploy
  # and kept on later deploys; the password must match the TEST stack's
  # postgres (every preview's DB lives inside that shared instance).
  $SSH "$TARGET" "if [ ! -f $DIR/.env ]; then
    pw=\$(grep '^POSTGRES_PASSWORD=' /srv/babasarok/test/.env | cut -d= -f2-)
    secret=\$(tr -dc a-f0-9 </dev/urandom | head -c 64)
    owner=\$(grep '^SHOP_OWNER_EMAIL=' /srv/babasarok/test/.env | cut -d= -f2-)
    from=\$(grep '^ORDER_EMAIL_FROM=' /srv/babasarok/test/.env | cut -d= -f2-)
    origins=\$(grep '^API_ALLOWED_ORIGINS=' /srv/babasarok/test/.env | cut -d= -f2-)
    printf 'POSTGRES_PASSWORD=%s\nTOKEN_SECRET=%s\nPREVIEW_SLUG=%s\nPREVIEW_DB_NAME=%s\nSHOP_OWNER_EMAIL=%s\nORDER_EMAIL_FROM=%s\nAPI_ALLOWED_ORIGINS=%s\nADMIN_URL=https://api-%s.babasarok.net/admin-ui\n' \"\$pw\" \"\$secret\" '$SLUG' '$DB' \"\$owner\" \"\$from\" \"\$origins\" '$SLUG' > $DIR/.env
    chmod 600 $DIR/.env
  fi"
  $SSH "$TARGET" "printf '%s\n' '$BRANCH' > $DIR/branch.txt"

  # The preview DB is disposable by design: dropped and re-copied from prod
  # on EVERY deploy, so branch migrations always run against fresh prod
  # data. WITH (FORCE) evicts open connections first (PostgreSQL 13+).
  $SSH "$TARGET" "docker exec $TEST_PG psql -U babasarok -d postgres -c \"DROP DATABASE IF EXISTS \\\"$DB\\\" WITH (FORCE)\" && docker exec $TEST_PG psql -U babasarok -d postgres -c \"CREATE DATABASE \\\"$DB\\\"\" && docker exec $PROD_PG pg_dump -U babasarok -d babasarok | docker exec -i $TEST_PG psql -U babasarok -d \"$DB\" -v ON_ERROR_STOP=1 -q"

  # Preview containers ride the TEST stack's network; make sure it is up
  # before anything in this stack boots.
  $SSH "$TARGET" "cd /srv/babasarok/test && docker compose up -d --wait"
else
  # For the infra networks-override generation (below): a stack's compose
  # network name. Previews share babasarok-test_default and must NOT be
  # listed — they mark themselves with branch.txt instead.
  $SSH "$TARGET" "echo babasarok-${STACK}_default > $DIR/network"
fi

# Cloudflare-owned runtime secrets: written from the build env so rotation
# in the cloudflare dashboard propagates on the next deploy. Only allowlisted
# keys are carried; anything absent leaves the box's bootstrapped value.
# Piped via stdin (the secret never appears in the remote command line) and
# 600-chmod'd on the box. Previews get no fragment: their compose has no
# .env.cloudflare entry and their .env has no email transport at all.
if [[ "$DEPLOY_STACK" != preview ]]; then
  {
    [ -n "${CLOUDFLARE_EMAIL_TOKEN:-}" ] && printf 'CLOUDFLARE_EMAIL_TOKEN=%s\n' "$CLOUDFLARE_EMAIL_TOKEN"
    [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && printf 'CLOUDFLARE_ACCOUNT_ID=%s\n' "$CLOUDFLARE_ACCOUNT_ID"
    true;
  } | $SSH "$TARGET" "cat > $DIR/.env.cloudflare && chmod 600 $DIR/.env.cloudflare"
fi

# Bring the stack up; --wait blocks until the vendure healthcheck is green,
# which is the gate before the frontend is allowed to deploy.
if [[ "$DEPLOY_STACK" == preview ]]; then
  $SSH "$TARGET" "cd $DIR && docker compose -p babasarok-$SLUG up -d --build --wait --wait-timeout 300"
else
  $SSH "$TARGET" "cd $DIR && docker compose up -d --build --wait --wait-timeout 300"
fi

# The deploy restarted the worker; any job it had mid-flight is stuck in
# RUNNING forever (the queue never re-picks those). Requeue them. Previews
# have no postgres service of their own — the branch DB lives in the test
# stack's postgres.
if [[ "$DEPLOY_STACK" == preview ]]; then
  $SSH "$TARGET" "docker exec $TEST_PG psql -U babasarok -d \"$DB\" -c \"update job_record set state='PENDING', attempts=0 where state='RUNNING';\""
else
  $SSH "$TARGET" "cd $DIR && docker compose exec -T postgres psql -U babasarok -d babasarok -c \"update job_record set state='PENDING', attempts=0 where state='RUNNING';\""
fi

# Shared edge Caddy: refresh the deployed compose + Caddyfile, then
#   networks override — one entry per fixed stack's own compose network
#   (previews ride the test network and add no entry), generated here so a
#   not-yet-deployed stack never breaks the edge. A stack's exact network
#   name is recorded in its `network` file; dirs predating that marker fall
#   back to the default compose name.
#   preview routes — one caddy snippet per preview stack; stale ones are
#   dropped when the stack dir is gone.
#   teardown cron — removes preview stacks whose branch no longer exists.
# The preview glob inside the Caddyfile matches no files until the first
# preview deploys, which Caddy treats as a no-op.
$SSH "$TARGET" "mkdir -p /srv/babasarok/infra/previews && cp $DIR/repo/deploy/infra/docker-compose.yml $DIR/repo/deploy/infra/Caddyfile $DIR/repo/deploy/infra/preview-teardown.sh $DIR/repo/deploy/infra/gen-networks-override.sh /srv/babasarok/infra/ && chmod +x /srv/babasarok/infra/preview-teardown.sh /srv/babasarok/infra/gen-networks-override.sh && cd /srv/babasarok/infra && bash /srv/babasarok/infra/gen-networks-override.sh && if [ -f docker-compose.networks.yml ]; then docker compose -f docker-compose.yml -f docker-compose.networks.yml up -d; else docker compose up -d; fi; for f in /srv/babasarok/infra/previews/*.caddy; do [ -e \"\$f\" ] || continue; s=\$(basename \"\$f\" .caddy); [ -d /srv/babasarok/\$s ] || rm -f \"\$f\"; done; if [ -n '$SLUG' ]; then printf 'api-%s.babasarok.net {\n\treverse_proxy vendure-%s:4000\n}\n' '$SLUG' '$SLUG' > /srv/babasarok/infra/previews/$SLUG.caddy; fi; docker compose exec -T caddy caddy reload --force /etc/caddy/Caddyfile"

# Preview teardown cron: idempotent install, runs daily.
$SSH "$TARGET" "(crontab -l 2>/dev/null | grep -v '/srv/babasarok/infra/preview-teardown.sh'; echo '17 4 * * * /srv/babasarok/infra/preview-teardown.sh >> /srv/babasarok/infra/preview-teardown.log 2>&1') | crontab -"

echo "backend $STACK deployed and healthy"
