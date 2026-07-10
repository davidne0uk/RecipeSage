#!/usr/bin/env bash
# Seeds Grocy with the single pantry location and the container quantity units.
# Idempotent: existing entries with the same name are skipped.
#
# All pantry stock lives in one location. The backend creates it on demand, so
# seeding it here only saves the first product creation a round trip.
#
# Usage:
#   GROCY_URL=http://localhost:9283/ GROCY_API_KEY=xxx ./scripts/pantry/seed-grocy.sh
#
# Requires: curl, jq
set -euo pipefail

: "${GROCY_URL:?set GROCY_URL, e.g. http://localhost:9283/}"
: "${GROCY_API_KEY:?set GROCY_API_KEY (Grocy > wrench icon > Manage API keys)}"

BASE="${GROCY_URL%/}/api"

api() {
  curl -fsS \
    -H "GROCY-API-KEY: ${GROCY_API_KEY}" \
    -H "Content-Type: application/json" \
    "$@"
}

exists() { # $1 = entity, $2 = name
  api "${BASE}/objects/$1" | jq -e --arg name "$2" 'map(.name) | index($name) != null' >/dev/null
}

seed() { # $1 = entity, $2 = name, $3 = json body
  if exists "$1" "$2"; then
    echo "skip    $1: $2 (already exists)"
  else
    api -X POST -d "$3" "${BASE}/objects/$1" >/dev/null
    echo "created $1: $2"
  fi
}

seed locations "Pantry" '{"name":"Pantry"}'

seed quantity_units "Jar" '{"name":"Jar","name_plural":"Jars"}'
seed quantity_units "Bottle" '{"name":"Bottle","name_plural":"Bottles"}'
seed quantity_units "Tin" '{"name":"Tin","name_plural":"Tins"}'
seed quantity_units "Pack" '{"name":"Pack","name_plural":"Packs"}'

echo "Done."
