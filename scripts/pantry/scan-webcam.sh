#!/usr/bin/env bash
# Headless scanner station: watches a webcam with zbarcam and forwards every
# decoded barcode to Barcode Buddy, which resolves it (Grocy -> Open Food
# Facts) and applies add/consume to Grocy stock. Mode and location are
# switched by scanning Barcode Buddy command barcodes from the printed
# command card.
#
# Runs on the Pi host (needs /dev/video0 and audio out), not in a container:
#   sudo apt install zbar-tools curl sox
#   BBUDDY_URL=http://localhost:9284/ BBUDDY_API_KEY=xxx ./scripts/pantry/scan-webcam.sh
#
# Distinct sounds: high double-beep = accepted, low long tone = rejected/error.
set -euo pipefail

: "${BBUDDY_URL:?set BBUDDY_URL, e.g. http://localhost:9284/}"
: "${BBUDDY_API_KEY:?set BBUDDY_API_KEY (Barcode Buddy > API > Manage API keys)}"
VIDEO_DEVICE="${VIDEO_DEVICE:-/dev/video0}"
DEDUPE_SECONDS="${DEDUPE_SECONDS:-3}"

beep_ok() { play -qn synth 0.08 sine 1200 : synth 0.08 sine 1600 2>/dev/null || printf '\a'; }
beep_fail() { play -qn synth 0.4 sine 300 2>/dev/null || printf '\a\a'; }

last_code=""
last_time=0

echo "Watching ${VIDEO_DEVICE}; scans go to ${BBUDDY_URL}"
zbarcam --raw --nodisplay "${VIDEO_DEVICE}" | while read -r code; do
  [ -z "$code" ] && continue

  # Ignore immediate re-reads of the same barcode while it's still in frame
  now=$(date +%s)
  if [ "$code" = "$last_code" ] && [ $((now - last_time)) -lt "$DEDUPE_SECONDS" ]; then
    last_time=$now
    continue
  fi
  last_code=$code
  last_time=$now

  if curl -fsS --max-time 10 \
    "${BBUDDY_URL%/}/api/action/scan?apikey=${BBUDDY_API_KEY}&text=${code}" \
    >/dev/null; then
    echo "scanned: ${code}"
    beep_ok
  else
    echo "FAILED:  ${code}" >&2
    beep_fail
  fi
done
