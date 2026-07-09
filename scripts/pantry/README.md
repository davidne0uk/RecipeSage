# Smart pantry: station setup & validation

Grocy (stock engine) and Barcode Buddy (barcode resolution) run as containers
via `docker-compose.pantry.yml`. The webcam scanner runs on the Pi host via
`scan-webcam.sh` because it needs `/dev/video0` and audio out.

## Setup order

1. `docker compose -f docker-compose.yml -f docker-compose.pantry.yml up -d`
2. Grocy (http://\<pi\>:9283): log in (admin/admin), change the password,
   create an API key (wrench icon > Manage API keys), put it in `.env` as
   `GROCY_API_KEY`, restart the stack.
3. `GROCY_URL=http://<pi>:9283/ GROCY_API_KEY=... ./scripts/pantry/seed-grocy.sh`
4. Barcode Buddy (http://\<pi\>:9284): verify the Grocy connection is green,
   create a Barcode Buddy API key (API menu).
5. On the Pi host: `sudo apt install zbar-tools curl sox`, then run
   `scan-webcam.sh` (see header for env vars). Wire it into systemd once happy.

## Validation checklist (design open questions — record results here)

- [x] **Decode rate**: RESULT (2026-07-07, Logitech C920): FAIL — only one
      oversized barcode decoded across ~20 real items, despite autofocus
      fixes, 1080p capture, and an aimed scan spot. Webcam decoding requires
      lab-grade focus/light/framing per item. DECISION: pivot to a USB HID
      barcode scanner (keyboard-wedge, ~£20) via `scan-hid.py` as the
      station's primary input; `scan-webcam.sh` retained as a zero-cost
      fallback for cameras/settings that can manage it.
- [x] **OFF hit rate**: RESULT (2026-07-09, USB HID scanner, UK groceries):
      5/6 (83%) named automatically by Open Food Facts; the miss was a
      store own-brand item, left in Barcode Buddy's unknown list for one-time
      naming via the app. Decode rate with the Totinfo TOT2D 2D imager: 6/6
      at ~4s/item across mixed packaging — the USB scanner pivot validated.
- [x] **Command barcode grammar** (VERIFIED 2026-07-07: BBUDDY-P/C/O/CS/CA/Q-/AS/I via /api/system/barcodes; NO location commands exist in 1.8.1.5 — location cards dropped): confirm the exact `BBUDDY-*` command set of
      the installed Barcode Buddy version (Barcode Buddy UI has a built-in
      command barcode page you can print). Needed: consume mode, add/purchase
      mode, and per-location selection. Note whether location commands exist
      natively or require Grocy location barcodes.
- [x] **Scan API shape** (VERIFIED: ?apikey=..&text=.. works): confirm the `api/action/scan` parameter name against
      the installed version's swagger UI (`/api/`) — `scan-webcam.sh` assumes
      `text`; adjust if the API differs.
- [x] **Audio** (VERIFIED: sox beeps on 3.5mm jack): confirm `sox`/`play` produces sound on the attached speaker
      (`play -n synth 0.2 sine 800`); if not, check `aplay -l` output and set
      the default ALSA device.

Findings feed back into `openspec/changes/smart-pantry/design.md` (Open
Questions) before building the PWA scanning flows.
