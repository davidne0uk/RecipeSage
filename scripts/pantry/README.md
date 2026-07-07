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

- [ ] **Decode rate**: scan 20+ real items — flat boxes, tins (curved), jars,
      crinkled pouches, chilled items (condensation). Record success/fail per
      packaging type. Tune camera distance/lighting; a desk lamp aimed at the
      scan spot helps more than camera quality.
- [ ] **OFF hit rate**: of the successfully decoded barcodes, how many did
      Barcode Buddy resolve via Open Food Facts (UK store-brand coverage)?
      Unresolved barcodes appear in Barcode Buddy's "new/unknown" list.
- [ ] **Command barcode grammar**: confirm the exact `BBUDDY-*` command set of
      the installed Barcode Buddy version (Barcode Buddy UI has a built-in
      command barcode page you can print). Needed: consume mode, add/purchase
      mode, and per-location selection. Note whether location commands exist
      natively or require Grocy location barcodes.
- [ ] **Scan API shape**: confirm the `api/action/scan` parameter name against
      the installed version's swagger UI (`/api/`) — `scan-webcam.sh` assumes
      `text`; adjust if the API differs.
- [ ] **Audio**: confirm `sox`/`play` produces sound on the attached speaker
      (`play -n synth 0.2 sine 800`); if not, check `aplay -l` output and set
      the default ALSA device.

Findings feed back into `openspec/changes/smart-pantry/design.md` (Open
Questions) before building the PWA scanning flows.
