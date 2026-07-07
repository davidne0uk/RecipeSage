# Smart pantry: household setup guide

One-time setup for the pantry feature: Grocy (stock engine), Barcode Buddy
(scanner station), and the RecipeSage pantry UI. See also
`docs/pantry-backup.md` and `scripts/pantry/README.md` (hardware validation
checklist).

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

## 3. Seed locations and units

```sh
GROCY_URL=http://<host>:9283/ GROCY_API_KEY=... ./scripts/pantry/seed-grocy.sh
```

This creates Fridge, Freezer, Pantry, Herb drawer, and Tin drawer plus the
container units (Jar, Bottle, Tin, Pack). Add your own locations any time
from the pantry page (options menu → _New location_).

Container units matter: products stocked in **Jar** or **Bottle** display as
fill levels (Full/¾/½/¼/low) and support photo fill estimation; everything
else is counted.

## 4. Print the command card

Pantry page → options menu → _Print command card_. Laminate it or tape it
next to the scanner station. Scanning **Add mode** / **Consume mode** changes
what subsequent item scans do; scanning a **location** directs added items
there.

> The card uses Barcode Buddy's default command grammar. During station
> setup, confirm the grammar against your Barcode Buddy version (it has its
> own printable command page under its UI) and adjust the constants in
> `pantry-command-card.page.ts` if they differ.

## 5. Scanner station (Pi + webcam + speaker)

1. Position the webcam pointing at a fixed "scan spot" with good light — a
   cheap desk lamp aimed at the spot improves decode rates more than a better
   camera. 10–20cm from the barcode works well for typical 720p webcams.
2. Install host dependencies: `sudo apt install zbar-tools curl sox`
3. Create a Barcode Buddy API key (its UI → API) and test:
   `BBUDDY_URL=http://localhost:9284/ BBUDDY_API_KEY=... ./scripts/pantry/scan-webcam.sh`
4. Wave a tin at the camera: high double-beep = stocked, low tone = failed.
5. Once happy, run it as a service. Example systemd unit
   (`/etc/systemd/system/pantry-scanner.service`):

   ```ini
   [Unit]
   Description=Pantry barcode scanner station
   After=network-online.target docker.service

   [Service]
   Environment=BBUDDY_URL=http://localhost:9284/
   Environment=BBUDDY_API_KEY=changeme
   ExecStart=/path/to/recipesage/scripts/pantry/scan-webcam.sh
   Restart=always
   RestartSec=5
   User=pi

   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now pantry-scanner`

## 6. Day-to-day flows

- **Unloading groceries**: scan _Add mode_ once, then beep items through the
  station. Scan a location card first to direct them somewhere specific.
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
