# NAS deployment (Dockge)

The whole smart-pantry system runs as one Dockge stack on the NAS:
RecipeSage fork (api + static built from this repo via GitHub Actions),
Grocy, Barcode Buddy, and supporting services. The kitchen Pi runs only the
USB scanner forwarder.

```
Internet:     https://<cloudflare-hostname>  (Cloudflare Tunnel + Access)
                    │
NAS (amd64):  cloudflared → proxy (no host port) → static/api/pushpin
              grocy :9283, barcodebuddy :9284   (LAN-ONLY, never forwarded)
              postgres, valkey, browserless, grocery-categorizer
Pi (kitchen): scan-hid.py + USB scanner → http://<nas>:9284/  (LAN)
Phones:       https://<cloudflare-hostname>  (the PWA — the single UI)
```

## External access (Cloudflare Tunnel + Access)

External access is via a Cloudflare Tunnel; **no inbound router port is opened**,
and the origin proxy has no published host port. Rate limiting trusts the
`cf-connecting-ip` header, which is only safe because the origin is unreachable
except through the tunnel — do **not** re-publish `proxy`'s port or router-forward
`9283`/`9284`.

1. Cloudflare Zero Trust → Networks → Tunnels → create a tunnel; copy its token to
   the stack `.env` as `CF_TUNNEL_TOKEN`. Add a public hostname route pointing at
   `http://proxy:80`.
2. Cloudflare Zero Trust → Access → Applications → add a self-hosted app over the
   hostname. Pick an identity method (email OTP is simplest) and a **session
   duration long enough to avoid mid-use `/api/*` redirects** (e.g. 1 month).
3. If you use public share links (`/api/share/recipe/...`), add an Access **bypass**
   policy scoped to `/api/share/*`, otherwise recipients get a login prompt.
4. Non-browser clients (scripts, `/compat/v2`) need an Access **service token**, not
   the cookie. The kitchen Pi is unaffected — it talks to Barcode Buddy over the LAN.

## Setup

1. **Images**: pushing to the `smart-pantry` branch builds
   `ghcr.io/davidne0uk/recipesage:api-smart-pantry` and `:static-smart-pantry`
   via `.github/workflows/build-selfhost-images.yml`. If the GHCR packages are
   private, either make them public (GitHub → package settings) or add a
   registry login on the NAS.

2. **Dockge**: create a new stack named `recipesage-pantry`, paste
   `docker-compose.yml`, and set the .env values:

   ```env
   API_PUBLIC_BASE_URL=https://<cloudflare-hostname>
   CF_TUNNEL_TOKEN=<from the Cloudflare tunnel>
   DISABLE_REGISTRATION=true
   POSTGRES_PASSWORD=<generate one>
   GRIP_KEY=<generate one>
   AI_PROVIDER=openrouter
   AI_API_KEY=<key, for assistant + pantry photo flows>
   GROCY_API_KEY=<created in step 3>
   ```

   With `DISABLE_REGISTRATION=true`, create your account before enabling it (or
   flip it to `false` briefly, register, then set it back and redeploy).

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

6. **App**: open `https://<cloudflare-hostname>` (pass the Access prompt), sign in,
   and the Pantry entry appears in the menu. For first-run account creation with
   `DISABLE_REGISTRATION=true`, see the note under step 2. During initial LAN-only
   bring-up before the tunnel exists, you can temporarily publish the proxy port to
   reach the app — but remove it before trusting `cf-connecting-ip`.

## Adding users after registration is disabled

With `DISABLE_REGISTRATION=true` there is no self-service signup and no admin UID
in this fork. Cloudflare Access already gates _who can reach_ the signup page, so
the simplest safe way to add a household member is a brief, Access-scoped re-open:

1. Add the person's email to the Cloudflare Access application policy.
2. Re-enable signup and restart the api (env is read at container start):

   ```sh
   cd /mnt/Vol1/docker/stacks/recipesage-pantry
   sed -i 's/^DISABLE_REGISTRATION=.*/DISABLE_REGISTRATION=false/' .env
   docker compose up -d api
   ```

3. Have them open the site, pass the Access email check, and sign up.
4. Close it again:

   ```sh
   sed -i 's/^DISABLE_REGISTRATION=.*/DISABLE_REGISTRATION=true/' .env
   docker compose up -d api
   ```

The open window is reachable only by identities already allowed through Access,
not the public internet.

## Backups

Everything stateful lives in this stack's named volumes (`postgresdata`,
`grocydata`, `apimedia`, `barcodebuddydata`) — snapshot the ZFS dataset
backing your Docker volumes and the whole system is captured atomically.
`docs/pantry-backup.md` has per-database dump commands if you prefer logical
backups; take both databases from the same snapshot/run.
