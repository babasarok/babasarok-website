#!/usr/bin/env bash
# One-command dev loop: postgres, the Vendure backend (server + worker,
# watched), then Tina + Astro in the foreground. Ctrl-C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  echo "backend/.env is missing — copy backend/.env.example and fill it in first." >&2
  exit 1
fi

echo "▶ postgres"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U babasarok -d babasarok >/dev/null 2>&1; do
  sleep 0.5
done

echo "▶ vendure backend (server + worker, watching)"
pnpm -C backend run dev &
trap 'kill %1 2>/dev/null' EXIT

echo " waiting for the API"
for _ in $(seq 1 120); do
  if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    echo " api healthy: http://localhost:4000 (admin UI: http://localhost:4000/admin-ui)"
    break
  fi
  sleep 1
done

echo "▶ site (tina + astro)"
exec pnpm run dev:tina
