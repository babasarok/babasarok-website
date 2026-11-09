#!/usr/bin/env bash
# One translations run per machine; the CLI's queue check guards across machines.
exec 9>/tmp/babasarok-translations.lock

if ! flock -n 9; then
  echo "STOP: another translations run on this machine holds /tmp/babasarok-translations.lock." >&2
  exit 1
fi

exec tsx "$(dirname "$0")/cli.ts" "$@"
