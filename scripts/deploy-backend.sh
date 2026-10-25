#!/usr/bin/env bash
# Deploy the backend stack to the Hetzner box, health-gate it, and leave the
# frontend deploy (wrangler) to the caller. Runs INSIDE the Cloudflare
# Workers build process (user decision — not GitHub Actions).
#
# Requires (Cloudflare build env vars): DEPLOY_HOST, DEPLOY_USER,
# DEPLOY_SSH_KEY (private key text), and DEPLOY_STACK:
#   prod    — fixed stack under /srv/babasarok/prod
#   preview — per-branch stack; WORKERS_CI_BRANCH (injected by Workers
#             Builds) names the stack dir, compose project and database
#
# Each stack serialises its deploys behind a flock on the box: paid Workers
# Builds allow parallel builds, and two deploys of one stack would otherwise
# race on the rsynced tree, the branch database and the compose project.
# While the lock is held the deployed commit is compared by committer
# timestamp; a build of an older commit exits nonzero, which — via the `&&`
# in the `deploy` script — also stops wrangler from rolling the frontend
# back. Roll back by pushing a fresh commit (e.g. `git commit --allow-empty`);
# a force-push of an older commit is refused by the same check.
#
# The rsynced tree IS the built commit, so backend and frontend deploys can
# never come from different commits.
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_STACK:?DEPLOY_STACK is required (prod|preview)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH=""
SLUG=""

case "$DEPLOY_STACK" in
  prod) ;;
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
    echo "DEPLOY_STACK must be 'prod' or 'preview', got '$DEPLOY_STACK'" >&2
    exit 1
    ;;
esac

STACK="${SLUG:-$DEPLOY_STACK}"
DIR="/srv/babasarok/$STACK"

COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_TS="$(git show -s --format=%ct HEAD)"

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
# The tree lands in a per-build tar first — only the locked remote script
# below touches the live repo dir, so an overlapping deploy cannot corrupt
# a transfer in flight.
$SSH "$TARGET" "mkdir -p $DIR"
TARFILE="$DIR/incoming-$$.tar"
tar -c --exclude-vcs \
  --exclude=backend/node_modules \
  --exclude=backend/dist \
  --exclude=backend/email-out \
  --exclude=backend/.env \
  --exclude=backend/.env.* \
  package.json pnpm-workspace.yaml pnpm-lock.yaml Dockerfile .dockerignore backend deploy \
  | $SSH "$TARGET" "cat > '$TARFILE'"

# Cloudflare-owned runtime secrets: written from the build env so rotation
# in the cloudflare dashboard propagates on the next deploy. Only allowlisted
# keys are carried; anything absent leaves the box's bootstrapped value.
# Piped via stdin (the secret never appears in the remote command line) into
# a per-build temp file that the locked remote script atomically moves into
# place — concurrent writes cannot tear the live file. Previews get no
# fragment: their compose has no .env.cloudflare entry and their .env has no
# email transport at all.
SECRET_TMP=""
if [[ "$DEPLOY_STACK" != preview ]]; then
  SECRET_TMP="$DIR/.env.cloudflare-$$.tmp"
  {
    [ -n "${CLOUDFLARE_EMAIL_TOKEN:-}" ] && printf 'CLOUDFLARE_EMAIL_TOKEN=%s\n' "$CLOUDFLARE_EMAIL_TOKEN"
    [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && printf 'CLOUDFLARE_ACCOUNT_ID=%s\n' "$CLOUDFLARE_ACCOUNT_ID"
    true;
  } | $SSH "$TARGET" "cat > '$SECRET_TMP'"
fi

# Everything that mutates the stack runs inside one flock'd remote script:
# per-stack serialisation of overlapping deploys, then the deployed-commit
# check, then the deploy itself. Arguments are pre-validated above.
$SSH "$TARGET" "bash -s -- '$DEPLOY_STACK' '$STACK' '$SLUG' '$BRANCH' '$COMMIT_SHA' '$COMMIT_TS' '$TARFILE' '$SECRET_TMP'" <<'REMOTE'
set -euo pipefail
DEPLOY_STACK=$1
STACK=$2
SLUG=$3
BRANCH=$4
COMMIT_SHA=$5
COMMIT_TS=$6
TARFILE=$7
SECRET_TMP=$8

DIR="/srv/babasarok/$STACK"
DB="babasarok_preview_$SLUG"

# One box-wide lock for the whole deploy: besides serialising this stack it
# keeps prod and preview deploys from racing the shared infra stack
# (gen-networks-override, Caddyfile, caddy reload). Not try-lock: waiting
# here is the concurrency limit for image builds, not a failure.
mkdir -p /srv/babasarok
exec 8>>/srv/babasarok/.infra.lock
flock -x -w 900 8

mkdir -p "$DIR"
exec 9>>"$DIR/.deploy.lock"
if ! flock -x -w 600 9; then
  echo "timed out waiting for the $STACK deploy lock" >&2
  exit 1
fi

trap 'rm -f "$TARFILE"; [ -z "$SECRET_TMP" ] || rm -f "$SECRET_TMP"' EXIT

# Newer commit wins: refuse to roll the stack back when a build of an older
# commit lands after a newer one. commit.txt is written only after the
# health gate passes, so a failed deploy never records itself.
if [[ -f "$DIR/commit.txt" ]]; then
  read -r DEPLOYED_TS DEPLOYED_SHA <"$DIR/commit.txt"
  if [[ "$COMMIT_TS" -lt "$DEPLOYED_TS" ]]; then
    echo "commit $COMMIT_SHA is older than deployed $DEPLOYED_SHA; refusing to roll back $STACK" >&2
    exit 1
  fi
fi

rm -rf "$DIR/repo" && mkdir -p "$DIR/repo"
tar -xf "$TARFILE" -C "$DIR/repo"
rm -f "$TARFILE"
cp "$DIR/repo/deploy/$DEPLOY_STACK/docker-compose.yml" "$DIR/docker-compose.yml"

if [[ "$DEPLOY_STACK" == preview ]]; then
  # The .env is provisioned once on first deploy and kept on later deploys;
  # the password must match the shared preview postgres in the infra stack
  # (every preview's DB lives inside that instance). Seed values come from
  # the prod stack's .env.
  if [[ ! -f "$DIR/.env" ]]; then
    pw=$(grep '^POSTGRES_PASSWORD=' /srv/babasarok/infra/.env | cut -d= -f2-)
    secret=$(tr -dc a-f0-9 </dev/urandom | head -c 64)
    owner=$(grep '^SHOP_OWNER_EMAIL=' /srv/babasarok/prod/.env | cut -d= -f2-)
    from=$(grep '^ORDER_EMAIL_FROM=' /srv/babasarok/prod/.env | cut -d= -f2-)
    origins=$(grep '^API_ALLOWED_ORIGINS=' /srv/babasarok/prod/.env | cut -d= -f2-)
    printf 'POSTGRES_PASSWORD=%s\nTOKEN_SECRET=%s\nPREVIEW_SLUG=%s\nPREVIEW_DB_NAME=%s\nSHOP_OWNER_EMAIL=%s\nORDER_EMAIL_FROM=%s\nAPI_ALLOWED_ORIGINS=%s\nADMIN_URL=https://api-%s.babasarok.net/dashboard\n' \
      "$pw" "$secret" "$SLUG" "$DB" "$owner" "$from" "$origins" "$SLUG" > "$DIR/.env"
    chmod 600 "$DIR/.env"
  fi

  # Record the branch for the teardown cron (it checks whether the branch
  # still exists on origin).
  printf '%s\n' "$BRANCH" > "$DIR/branch.txt"

  # The preview DB is disposable by design: dropped and re-copied from prod
  # on EVERY deploy, so branch migrations always run against fresh prod
  # data. WITH (FORCE) evicts open connections first (PostgreSQL 13+).
  docker exec babasarok-edge-postgres-1 psql -U babasarok -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
  docker exec babasarok-edge-postgres-1 psql -U babasarok -d postgres -c "CREATE DATABASE \"$DB\""
  docker exec babasarok-prod-postgres-1 pg_dump -U babasarok -d babasarok \
    | docker exec -i babasarok-edge-postgres-1 psql -U babasarok -d "$DB" -v ON_ERROR_STOP=1 -q

  # Preview containers ride the INFRA stack's network; make sure the shared
  # preview postgres there is up before anything in this stack boots. The
  # infra compose file is refreshed first so a first-ever deploy of a new
  # postgres service definition still lands.
  cp "$DIR/repo/deploy/infra/docker-compose.yml" /srv/babasarok/infra/
  cd /srv/babasarok/infra
  docker compose up -d --wait postgres
else
  # For the infra networks-override generation (below): a stack's compose
  # network name. Previews ride the infra network and must NOT be listed —
  # they mark themselves with branch.txt instead.
  echo "babasarok-${STACK}_default" > "$DIR/network"
  mv "$SECRET_TMP" "$DIR/.env.cloudflare"
  chmod 600 "$DIR/.env.cloudflare"
fi

# Bring the stack up; --wait blocks until the vendure healthcheck is green,
# which is the gate before the frontend is allowed to deploy. Before up,
# tag the currently-running image as previous; if the new stack fails to
# come healthy (bad migration, crashloop), roll the containers back to that
# image so prod keeps serving instead of 502-ing until the next push.
cd "$DIR"
if [[ "$DEPLOY_STACK" == preview ]]; then
  docker compose -p "babasarok-$SLUG" up -d --build --wait --wait-timeout 300
else
  OLD_ID=$(docker compose ps -q vendure | xargs docker inspect --format '{{.Image}}' 2>/dev/null || true)
  if [[ -n "$OLD_ID" ]]; then
    docker tag "$OLD_ID" babasarok-prod:previous
  fi
  if ! docker compose up -d --build --wait --wait-timeout 300; then
    echo "new stack failed to become healthy; rolling back to the previous image" >&2
    if docker image inspect babasarok-prod:previous >/dev/null 2>&1; then
      docker compose down
      sed 's|build: ./repo|image: babasarok-prod:previous|' docker-compose.yml > docker-compose.rollback.yml
      docker compose -f docker-compose.rollback.yml up -d --wait --wait-timeout 300
      echo "rolled back to the previous image; fix the commit and redeploy" >&2
    else
      echo "no previous image tagged; the stack stays down" >&2
    fi
    exit 1
  fi
fi

# The deploy restarted the worker; any job it had mid-flight is stuck in
# RUNNING forever (the queue never re-picks those). Requeue them. Previews
# have no postgres service of their own — the branch DB lives in the shared
# infra postgres.
if [[ "$DEPLOY_STACK" == preview ]]; then
  docker exec babasarok-edge-postgres-1 psql -U babasarok -d "$DB" -c "update job_record set state='PENDING', attempts=0 where state='RUNNING';"
else
  docker compose exec -T postgres psql -U babasarok -d babasarok -c "update job_record set state='PENDING', attempts=0 where state='RUNNING';"
fi

# Shared edge Caddy: refresh the deployed compose + Caddyfile, then
#   networks override — one entry per fixed stack's own compose network
#   (previews ride the infra network and add no entry), generated here so a
#   not-yet-deployed stack never breaks the edge. A stack's exact network
#   name is recorded in its `network` file; dirs predating that marker fall
#   back to the default compose name.
#   preview routes — one caddy snippet per preview stack; stale ones are
#   dropped when the stack dir is gone.
#   teardown cron — removes preview stacks whose branch no longer exists.
# The preview glob inside the Caddyfile matches no files until the first
# preview deploys, which Caddy treats as a no-op.
mkdir -p /srv/babasarok/infra/previews
cp "$DIR/repo/deploy/infra/docker-compose.yml" \
   "$DIR/repo/deploy/infra/Caddyfile" \
   "$DIR/repo/deploy/infra/preview-teardown.sh" \
   "$DIR/repo/deploy/infra/gen-networks-override.sh" \
   /srv/babasarok/infra/
chmod +x /srv/babasarok/infra/preview-teardown.sh /srv/babasarok/infra/gen-networks-override.sh
cd /srv/babasarok/infra
bash /srv/babasarok/infra/gen-networks-override.sh
if [[ -f docker-compose.networks.yml ]]; then
  docker compose -f docker-compose.yml -f docker-compose.networks.yml up -d
else
  docker compose up -d
fi
for f in /srv/babasarok/infra/previews/*.caddy; do
  [[ -e "$f" ]] || continue
  s=$(basename "$f" .caddy)
  [[ -d "/srv/babasarok/$s" ]] || rm -f "$f"
done
if [[ -n "$SLUG" ]]; then
  printf 'api-%s.babasarok.net {\n\treverse_proxy vendure-%s:4000\n}\n' "$SLUG" "$SLUG" > "/srv/babasarok/infra/previews/$SLUG.caddy"
fi
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force

# Preview teardown cron: idempotent install, runs hourly. Same cron line also
# prunes crash leftovers: incoming tarballs and secret-tmp files a killed CF
# build leaves behind (the EXIT trap in the caller only runs if the SSH
# session itself started the trap — a killed build can skip it).
(crontab -l 2>/dev/null | grep -v '/srv/babasarok/infra/preview-teardown.sh' | grep -v 'incoming-.*\.tar'; echo '17 * * * * /srv/babasarok/infra/preview-teardown.sh >> /srv/babasarok/infra/preview-teardown.log 2>&1; find /srv/babasarok -name "incoming-*.tar" -mmin +120 -delete; find /srv/babasarok -name ".env.cloudflare-*.tmp" -mmin +120 -delete') | crontab -

printf '%s %s\n' "$COMMIT_TS" "$COMMIT_SHA" > "$DIR/commit.txt"
echo "backend $STACK deployed and healthy (commit $COMMIT_SHA)"
REMOTE