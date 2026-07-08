# NAS deployment (Dockge)

The whole smart-pantry system runs as one Dockge stack on the NAS:
RecipeSage fork (api + static built from this repo via GitHub Actions),
Grocy, Barcode Buddy, and supporting services. The kitchen Pi runs only the
USB scanner forwarder.

```
NAS (amd64):  proxy :7270 → static/api/pushpin
              grocy :9283, barcodebuddy :9284
              postgres, valkey, browserless, grocery-categorizer
Pi (kitchen): scan-hid.py + USB scanner → http://<nas>:9284/
Phones:       http://<nas>:7270 (the PWA — the single UI)
```

## Setup

1. **Images**: pushing to the `smart-pantry` branch builds
   `ghcr.io/davidne0uk/recipesage:api-smart-pantry` and `:static-smart-pantry`
   via `.github/workflows/build-selfhost-images.yml`. If the GHCR packages are
   private, either make them public (GitHub → package settings) or add a
   registry login on the NAS.

2. **Dockge**: create a new stack named `recipesage-pantry`, paste
   `docker-compose.yml`, and set the .env values:

   ```env
   API_PUBLIC_BASE_URL=http://<nas-ip>:7270
   POSTGRES_PASSWORD=<generate one>
   GRIP_KEY=<generate one>
   AI_PROVIDER=openrouter
   AI_API_KEY=<key, for assistant + pantry photo flows>
   GROCY_API_KEY=<created in step 3>
   ```

3. **Grocy one-time setup** (same as before, new host):
   - `http://<nas>:9283` → log in admin/admin → change password
   - wrench icon → Manage API keys → Add → put the key in the stack .env as
     `GROCY_API_KEY` → redeploy the stack
   - Seed locations/units from any machine:
     `GROCY_URL=http://<nas>:9283/ GROCY_API_KEY=... ./scripts/pantry/seed-grocy.sh`

4. **Barcode Buddy**: `http://<nas>:9284` → set Grocy URL
   `http://grocy:80/api/` + the API key in its settings (env overrides are
   not honored by 1.8.1.5), and create a Barcode Buddy API key (API menu)
   for the Pi.

5. **Kitchen Pi** (scanner endpoint only):

   ```sh
   sudo apt install python3-evdev
   BBUDDY_URL=http://<nas>:9284/ BBUDDY_API_KEY=<bb key> \
     sudo -E ~/RecipeSage/scripts/pantry/scan-hid.py
   ```

   Then install the systemd unit from `docs/pantry-setup.md` §5 with
   `BBUDDY_URL` pointing at the NAS.

6. **App**: open `http://<nas>:7270`, create your account, and the Pantry
   entry appears in the menu.

## Backups

Everything stateful lives in this stack's named volumes (`postgresdata`,
`grocydata`, `apimedia`, `barcodebuddydata`) — snapshot the ZFS dataset
backing your Docker volumes and the whole system is captured atomically.
`docs/pantry-backup.md` has per-database dump commands if you prefer logical
backups; take both databases from the same snapshot/run.
