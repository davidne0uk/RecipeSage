# Smart pantry: backup & restore

The smart pantry feature adds a second database to the deployment. Backups
must cover both, or a restore will resurrect a pantry that disagrees with the
rest of the app.

| Data                | Where it lives                                              | Contains                                                                                             |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RecipeSage data     | Postgres (`postgres-data` volume)                           | recipes, users, shopping lists, meal plans, **pantry ingredient aliases** (`Pantry_Product_Aliases`) |
| Pantry stock        | Grocy SQLite (`grocy-data` volume, `/config/data/grocy.db`) | products, barcodes, locations, quantity units, stock, stock journal                                  |
| Barcode Buddy state | `barcodebuddy-data` volume                                  | Grocy connection config, unresolved barcode list                                                     |

## Backing up

Postgres (consistent dump while running):

```sh
docker compose exec postgres pg_dump -U recipesage_dev recipesage_dev \
  > backup/recipesage-$(date +%F).sql
```

Grocy (SQLite is a single file; use the sqlite backup command rather than a
raw copy so a mid-write snapshot cannot corrupt the backup):

```sh
docker compose exec grocy sqlite3 /config/data/grocy.db \
  ".backup /config/data/grocy-backup.db"
docker cp "$(docker compose ps -q grocy)":/config/data/grocy-backup.db \
  backup/grocy-$(date +%F).db
```

Barcode Buddy state is reconstructible (reconfigure + rescan unknowns), so
backing up its volume is optional but cheap:

```sh
docker run --rm -v barcodebuddy-data:/data -v "$PWD/backup":/backup alpine \
  tar czf /backup/barcodebuddy-$(date +%F).tgz -C /data .
```

## Restoring

Restore both databases from the **same backup run**. The alias table in
Postgres references Grocy product ids; restoring only one side leaves aliases
pointing at products that may not exist (harmless — unmatched aliases are
ignored — but user overrides silently vanish).

1. Stop the stack.
2. Restore the Postgres dump into a fresh database.
3. Copy the Grocy backup file over `/config/data/grocy.db` in the grocy
   volume.
4. Start the stack; verify the pantry page lists the expected stock.

## Scheduling on the Pi

A nightly cron entry on the Pi host covering both commands is sufficient for
household use. Keep at least a week of dated files and copy them off the Pi
(the SD card is the most likely component to fail).
