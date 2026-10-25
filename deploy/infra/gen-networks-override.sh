#!/usr/bin/env bash
# Generates docker-compose.networks.yml on the box: declares each fixed
# stack's compose network AND attaches the edge caddy service to it.
# (A top-level `networks:` declaration alone attaches no service — the
# missing service attachment 502'd the edge after a recreate.)
# Preview stacks are skipped: they share the test stack's network, which is
# already attached. A stack's exact network name is recorded in its
# `network` file; dirs predating that marker fall back to the default
# compose name. When no fixed stacks exist the file is removed — the
# caller then brings the edge up without an override.
set -euo pipefail

cd /srv/babasarok/infra
out=docker-compose.networks.yml

n=0
for d in /srv/babasarok/*/repo; do
  [ -d "$d" ] || continue
  s=$(basename "$(dirname "$d")")
  [ -f "$d/../branch.txt" ] && continue
  if [ -f "$d/../network" ]; then
    net=$(cat "$d/../network")
  else
    net="babasarok-${s}_default"
  fi
  if [ "$n" -eq 0 ]; then
    printf 'services:\n  caddy:\n    networks:\n' > "$out"
    n=1
  fi
  printf '      - %s\n' "$net" >> "$out"
done
if [ "$n" -eq 1 ]; then
  printf '\nnetworks:\n' >> "$out"
  for d in /srv/babasarok/*/repo; do
    [ -d "$d" ] || continue
    s=$(basename "$(dirname "$d")")
    [ -f "$d/../branch.txt" ] && continue
    if [ -f "$d/../network" ]; then
      net=$(cat "$d/../network")
    else
      net="babasarok-${s}_default"
    fi
    printf '  %s:\n    external: true\n' "$net" >> "$out"
  done
else
  rm -f "$out"
fi
