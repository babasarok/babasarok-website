#!/usr/bin/env bash
# Preview stack teardown, installed as a daily cron by deploy-backend.sh
# (runs on the Hetzner box). For each preview stack — the dirs carrying a
# branch.txt marker — if its branch no longer exists on origin, remove the
# compose project, its branch database (inside the shared test postgres),
# its caddy route file and its directory. prod/test/infra and dirs without
# the marker are never touched.
#
# The repo is public, so git ls-remote works unauthenticated.
set -euo pipefail

REPO_URL="https://github.com/babasarok/babasarok-website.git"
TEST_PG="babasarok-test-postgres-1"
changed=0

for dir in /srv/babasarok/*/; do
  stack=$(basename "$dir")
  [ -f "$dir/branch.txt" ] || continue
  branch=$(cat "$dir/branch.txt")
  # Only tear down on a definitive "branch gone" (ls-remote exit 2). Any
  # other failure (network outage, GitHub down) must skip — tearing down on
  # a transient error would delete live stacks.
  rc=0
  git ls-remote --exit-code --heads "$REPO_URL" "refs/heads/$branch" >/dev/null 2>&1 || rc=$?
  if [ "$rc" -eq 0 ]; then
    continue
  fi
  if [ "$rc" -ne 2 ]; then
    echo "ls-remote failed (rc=$rc) for '$branch'; skipping to avoid false teardown" >&2
    continue
  fi
  echo "branch '$branch' no longer exists on origin; tearing down $stack"
  cd "$dir" && docker compose -p "babasarok-$stack" down
  docker exec "$TEST_PG" psql -U babasarok -d postgres \
    -c "DROP DATABASE IF EXISTS \"babasarok_preview_$stack\" WITH (FORCE)"
  rm -rf "$dir"
  rm -f "/srv/babasarok/infra/previews/$stack.caddy"
  changed=1
done

if [ "$changed" = 1 ]; then
  cd /srv/babasarok/infra
  docker compose exec -T caddy caddy reload --force /etc/caddy/Caddyfile
fi
