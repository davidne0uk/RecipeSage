# Smart pantry: household setup guide

One-time setup for the pantry feature: Grocy (stock engine), Barcode Buddy
(scanner station), and the RecipeSage pantry UI. See also
`docs/pantry-backup.md` and `scripts/pantry/README.md` (hardware validation
checklist).

> **Recommended deployment**: run the entire stack on an always-on amd64 box
> (NAS with Dockge/compose) using `deploy/nas/` — prebuilt fork images from
> GHCR, ZFS-snapshot-friendly volumes, and the Pi reduced to a USB-scanner
> endpoint. The sections below describe the components generically; the
> compose files referenced in §1 are for single-host/dev setups.

## 1. Start the stack

```sh
docker compose -f docker-compose.yml -f docker-compose.pantry.yml up -d
```

On a Raspberry Pi (4 or 5, 4GB+ recommended) set `BARCODEBUDDY_TAG=arm64v8-v1.8.1.5`
in `.env` first — Barcode Buddy publishes per-architecture tags rather than a
multi-arch manifest. Every other image is confirmed multi-arch (arm64):
`linuxserver/grocy`, `postgres:16.1`, `valkey/valkey`, `nginx`,
`julianpoy/pushpin:2023-09-17`, and `julianpoy/grocery-categorizer:f9d9562`
(verified against the registry manifest lists, 2026-07).

## 2. Connect Grocy

1. Open Grocy at `http://<host>:9283`, log in with `admin` / `admin`, change
   the password. You will not use this UI day-to-day.
2. Create an API key: wrench icon → _Manage API keys_ → _Add_.
3. Put it in `.env` as `GROCY_API_KEY=...` (see `example.env`) and restart:
   `docker compose ... up -d backend barcodebuddy`.

## 3. Seed the location and units

```sh
GROCY_URL=http://<host>:9283/ GROCY_API_KEY=... ./scripts/pantry/seed-grocy.sh
```

This creates the single `Pantry` location plus the container units (Jar,
Bottle, Tin, Pack).

The pantry has no concept of placement — everything lives in one list. Grocy
requires a location on every product, so the backend resolves (and creates, if
missing) a location named `Pantry`; seeding it here just saves the first
product creation a round trip. Nothing in the app reads or writes locations
otherwise.

Container units matter: products stocked in **Jar** or **Bottle** display as
fill levels (Full/¾/½/¼/low) and support photo fill estimation; everything
else is counted.

## 4. Print the command card

Pantry page → options menu → _Print command card_. Laminate it or tape it
next to the scanner station. Scanning **Add mode** / **Consume mode** changes
what subsequent item scans do. Barcodes the station cannot resolve are
recorded by Barcode Buddy for you to name later in the app.

> The card uses Barcode Buddy's default command grammar. During station
> setup, confirm the grammar against your Barcode Buddy version (it has its
> own printable command page under its UI) and adjust the constants in
> `pantry-command-card.page.ts` if they differ.

## 5. Scanner station (Pi + USB barcode scanner)

Use a dedicated USB HID barcode scanner (keyboard-wedge mode, ~£20; get a
2D imager rather than laser-only for phone/loyalty codes later). Webcams
were validated and rejected: real packaging (curved tins, glossy jars,
pouches) decodes unreliably even with autofocus, 1080p, and good light —
scanner hardware solves all of that with its own optics, illumination, and
beeper.

1. Plug the scanner in, then:
   `sudo apt install python3-evdev`
2. Create a Barcode Buddy API key (its UI → API) and test:
   `BBUDDY_URL=http://localhost:9284/ BBUDDY_API_KEY=... sudo -E ./scripts/pantry/scan-hid.py`
3. Scan a tin: the scanner's own beep confirms the read; the script log
   confirms delivery to Barcode Buddy.
4. Once happy, run it as a service. Example systemd unit
   (`/etc/systemd/system/pantry-scanner.service`):

   ```ini
   [Unit]
   Description=Pantry barcode scanner station
   After=network-online.target docker.service

   [Service]
   Environment=BBUDDY_URL=http://localhost:9284/
   Environment=BBUDDY_API_KEY=changeme
   ExecStart=/usr/bin/python3 /path/to/recipesage/scripts/pantry/scan-hid.py
   Restart=always
   RestartSec=5
   User=pi

   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now pantry-scanner`

## 6. Day-to-day flows

- **Unloading groceries**: scan _Add mode_ once, then beep items through the
  station. Items the station does not recognise appear in the app for naming.
- **Cooking**: scan _Consume mode_, beep out what you use — or use the phone:
  pantry page → scan button, with the Adding/Using-up toggle.
- **Herbs & spices**: open the jar's entry in the pantry page → _Estimate
  fill from photo_, snap the jar, confirm the suggested level.
- **No barcode?** Pantry page → add button → _Fill in from photo_, or type it
  in manually.
- **Recipes**: your own recipes show "N of M in pantry"; tap a line to link
  or unlink it from a pantry item — links are remembered.
- **Shopping**: adding a recipe to a shopping list pre-completes items you
  already have; un-tick them to shop for them anyway.

## 7. Migrating an instance created before locations were removed

Earlier versions seeded five storage locations (Fridge, Freezer, Pantry, Herb
drawer, Tin drawer) and grouped the pantry by them. If your Grocy instance
predates this change, consolidate it once:

```sh
# 1. Back up the grocy-data volume first — location deletion is irreversible.
# 2. Review the plan (dry run; changes nothing):
GROCY_URL=http://<host>:9283/ GROCY_API_KEY=... ./scripts/pantry/consolidate-locations.sh
# 3. Execute it:
GROCY_URL=http://<host>:9283/ GROCY_API_KEY=... ./scripts/pantry/consolidate-locations.sh --apply
```

It moves every product and its stock into `Pantry`, then deletes the emptied
locations, refusing to delete any that still hold stock. Re-running it on a
consolidated instance reports "nothing to do" and exits 0.

The migration is not release-blocking: new code renders the flat list against
any set of locations and creates new products in `Pantry`. Until you run it,
Grocy's own UI simply still shows the old locations.
