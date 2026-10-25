#!/usr/bin/env bash
# Branch name → preview slug: the single identity used for the stack dir
# (/srv/babasarok/<slug>), the compose project (babasarok-<slug>), the
# container alias (vendure-<slug>), the API host (api-<slug>.babasarok.net)
# and the branch database (babasarok_preview_<slug>). Shared by the
# Cloudflare build (frontend API URL) and deploy-backend.sh (backend stack)
# so both sides always agree. Fail-closed: exits nonzero when nothing
# usable remains.
set -euo pipefail

branch="${1:?branch name required}"

# Hostnames are single-label here (wildcard DNS covers one label level), so
# dots become dashes too. Letters/digits/dashes only, capped at 40 chars so
# the database identifier (babasarok_preview_<slug>) stays under 63.
slug=$(printf '%s' "$branch" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9-]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//' \
  | cut -c1-40 \
  | sed -e 's/-$//')

case "$slug" in
  "" | prod | test | infra)
    echo "branch '$branch' maps to unusable slug '$slug'" >&2
    exit 1
    ;;
esac

printf '%s\n' "$slug"
