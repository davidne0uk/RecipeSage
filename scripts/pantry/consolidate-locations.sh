#!/usr/bin/env bash
# One-time migration: moves every product and its stock into the single
# "Pantry" location, then deletes the emptied locations.
#
# Run this once on instances created before locations were removed from the
# pantry. Idempotent: a second run reports "nothing to do" and exits 0.
#
# Dry-run by default — prints the plan and mutates nothing. Pass --apply to
# execute. Back up the grocy-data volume first; location deletion cannot be
# undone through the API.
#
# Usage:
#   GROCY_URL=http://localhost:9283/ GROCY_API_KEY=xxx ./scripts/pantry/consolidate-locations.sh
#   GROCY_URL=... GROCY_API_KEY=... ./scripts/pantry/consolidate-locations.sh --apply
#
# Stock placement is read from GET /objects/stock, whose rows carry a
# location_id on the Grocy versions we target. The shape is probed at runtime
# rather than assumed: if those rows have no location_id, the script falls
# back to transferring each product's aggregate amount from its home location.
# The fallback is exact whenever a product's stock is not split across
# locations, which is the only state this app could produce.
#
# Requires: curl, jq
set -euo pipefail

: "${GROCY_URL:?set GROCY_URL, e.g. http://localhost:9283/}"
: "${GROCY_API_KEY:?set GROCY_API_KEY (Grocy > wrench icon > Manage API keys)}"

BASE="${GROCY_URL%/}/api"
PANTRY_NAME="Pantry"

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

api() {
  curl -fsS \
    -H "GROCY-API-KEY: ${GROCY_API_KEY}" \
    -H "Content-Type: application/json" \
    "$@"
}

# Only mutates when --apply was passed; otherwise describes what it would do.
mutate() { # $1 = description, rest = curl args
  local description="$1"
  shift
  if $APPLY; then
    api "$@" >/dev/null
    echo "  done    ${description}"
  else
    echo "  would   ${description}"
  fi
}

locations="$(api "${BASE}/objects/locations")"
products="$(api "${BASE}/objects/products")"
stock_entries="$(api "${BASE}/objects/stock")"

# --- resolve the canonical Pantry location ------------------------------------
# Lowest id wins, matching the backend's resolver, so duplicates converge.
pantry_id="$(
  jq -r --arg name "$PANTRY_NAME" '
    [.[] | select((.name | ascii_downcase | gsub("^\\s+|\\s+$";"")) == ($name | ascii_downcase)) | .id | tonumber]
    | sort | .[0] // empty
  ' <<<"$locations"
)"

if [[ -z "$pantry_id" ]]; then
  if $APPLY; then
    pantry_id="$(
      api -X POST -d "{\"name\":\"${PANTRY_NAME}\"}" "${BASE}/objects/locations" |
        jq -r '.created_object_id'
    )"
    echo "created location: ${PANTRY_NAME} (id ${pantry_id})"
  else
    echo "would create location: ${PANTRY_NAME}"
    # Nothing else can be planned concretely without an id.
    pantry_id="<new>"
  fi
fi

echo "canonical location: ${PANTRY_NAME} (id ${pantry_id})"

# --- probe whether stock rows carry a location -------------------------------
entries_have_location=false
if [[ "$(jq -r 'length' <<<"$stock_entries")" -gt 0 ]] &&
  [[ "$(jq -r '.[0] | has("location_id")' <<<"$stock_entries")" == "true" ]]; then
  entries_have_location=true
fi

if [[ "$(jq -r 'length' <<<"$stock_entries")" -eq 0 ]]; then
  echo "stock placement: no stock entries"
elif $entries_have_location; then
  echo "stock placement: per stock entry (objects/stock has location_id)"
else
  echo "stock placement: per product aggregate (objects/stock has no location_id)"
fi

# --- plan --------------------------------------------------------------------
# Products whose home location is not the canonical one.
misplaced_products="$(
  jq -c --arg pantry "$pantry_id" '
    [.[] | select((.location_id | tostring) != $pantry)
         | {id: (.id | tonumber), name: .name, location_id: (.location_id | tonumber)}]
  ' <<<"$products"
)"

# Stock that needs transferring, as {product_id, from, amount} rows.
if $entries_have_location; then
  transfers="$(
    jq -c --arg pantry "$pantry_id" '
      [.[] | select((.location_id | tostring) != $pantry)
           | {product_id: (.product_id | tonumber),
              from: (.location_id | tonumber),
              amount: (.amount | tonumber)}]
      | group_by([.product_id, .from])
      | map({product_id: .[0].product_id, from: .[0].from, amount: (map(.amount) | add)})
      | map(select(.amount > 0))
    ' <<<"$stock_entries"
  )"
else
  # No per-entry location: fall back to each product's aggregate amount, moved
  # from the product's own home location.
  aggregate_stock="$(api "${BASE}/stock")"
  transfers="$(
    jq -c --arg pantry "$pantry_id" --argjson stock "$aggregate_stock" '
      [ .[]
        | . as $p
        | ($stock[] | select((.product_id | tonumber) == ($p.id | tonumber)) | (.amount | tonumber)) as $amount
        | select(($p.location_id | tostring) != $pantry and $amount > 0)
        | {product_id: ($p.id | tonumber), from: ($p.location_id | tonumber), amount: $amount}
      ]
    ' <<<"$products"
  )"
fi

# Every location that is not the canonical one, including duplicate "Pantry"s.
doomed_locations="$(
  jq -c --arg pantry "$pantry_id" '
    [.[] | select((.id | tostring) != $pantry) | {id: (.id | tonumber), name: .name}]
  ' <<<"$locations"
)"

product_count="$(jq -r 'length' <<<"$misplaced_products")"
transfer_count="$(jq -r 'length' <<<"$transfers")"
location_count="$(jq -r 'length' <<<"$doomed_locations")"

if [[ "$product_count" -eq 0 && "$transfer_count" -eq 0 && "$location_count" -eq 0 ]]; then
  echo
  echo "Nothing to do — already consolidated."
  exit 0
fi

echo
echo "Plan:"
echo "  ${product_count} product(s) to relocate, ${transfer_count} stock transfer(s), ${location_count} location(s) to delete"
echo

# --- apply -------------------------------------------------------------------
# Ordering mirrors the moveItem/deleteLocation procedures this replaces: set the
# product's home location first, then transfer the stock, which carries its own
# location and is unaffected by the product having already moved.
if [[ "$product_count" -gt 0 ]]; then
  echo "Relocating products:"
  while read -r row; do
    [[ -z "$row" ]] && continue
    id="$(jq -r '.id' <<<"$row")"
    name="$(jq -r '.name' <<<"$row")"
    mutate "relocate product ${id} (${name})" \
      -X PUT -d "{\"location_id\":${pantry_id}}" "${BASE}/objects/products/${id}"
  done < <(jq -c '.[]' <<<"$misplaced_products")
  echo
fi

if [[ "$transfer_count" -gt 0 ]]; then
  echo "Transferring stock:"
  while read -r row; do
    [[ -z "$row" ]] && continue
    product_id="$(jq -r '.product_id' <<<"$row")"
    from="$(jq -r '.from' <<<"$row")"
    amount="$(jq -r '.amount' <<<"$row")"
    mutate "transfer ${amount} of product ${product_id} from location ${from}" \
      -X POST \
      -d "{\"amount\":${amount},\"location_id_from\":${from},\"location_id_to\":${pantry_id}}" \
      "${BASE}/stock/products/${product_id}/transfer"
  done < <(jq -c '.[]' <<<"$transfers")
  echo
fi

refused=0

if [[ "$location_count" -gt 0 ]]; then
  echo "Deleting emptied locations:"

  # Re-read stock so the refusal check below sees the effect of the transfers.
  remaining_stock="$(api "${BASE}/objects/stock")"

  while read -r row; do
    [[ -z "$row" ]] && continue
    id="$(jq -r '.id' <<<"$row")"
    name="$(jq -r '.name' <<<"$row")"

    if $APPLY && $entries_have_location; then
      still_stocked="$(
        jq -r --arg id "$id" '[.[] | select((.location_id | tostring) == $id)] | length' \
          <<<"$remaining_stock"
      )"
      if [[ "$still_stocked" -gt 0 ]]; then
        echo "  refused location ${id} (${name}): still holds stock (${still_stocked} entries)" >&2
        refused=$((refused + 1))
        continue
      fi
    fi

    mutate "delete location ${id} (${name})" \
      -X DELETE "${BASE}/objects/locations/${id}"
  done < <(jq -c '.[]' <<<"$doomed_locations")
  echo
fi

if ! $APPLY; then
  echo "Dry run — nothing changed. Re-run with --apply to execute."
elif [[ "$refused" -gt 0 ]]; then
  echo "Consolidation incomplete: ${refused} location(s) still hold stock and were kept." >&2
  echo "Their transfers did not take effect. Investigate before re-running." >&2
  exit 1
else
  echo "Done. All pantry stock now lives in ${PANTRY_NAME}."
fi
