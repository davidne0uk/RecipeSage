# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A fork of [julianpoy/recipesage](https://github.com/julianpoy/recipesage) (recipe keeper / meal planner / shopping lists) carrying the **smart pantry** feature on the `smart-pantry` branch: Grocy-backed stock tracking, barcode capture, vision-based product ID and jar fill estimation, and recipe/shopping-list stock integration. Upstream explicitly declined pantry management (upstream issues #1164/#1206), so this is fork-only by design — **no upstream PR is intended**, but follow upstream conventions strictly (file layout, procedure-per-file, i18n, spec tests) to keep rebases onto upstream master manageable. The OpenSpec change docs for the feature (proposal/design/specs/tasks) live in `../openspec/changes/smart-pantry/`.

## Toolchain and commands

Nx monorepo, pnpm (`packageManager` pinned in package.json — if pnpm isn't on PATH, `npx pnpm@<pinned-version> ...`), Node 24. Single root package.json — there is **no pnpm workspace**; don't use `pnpm add -w`.

```sh
npx pnpm install --frozen-lockfile
npx pnpm exec prisma generate            # needs DATABASE_URL set (any value; no connection made)

# Lint / typecheck (per project or all)
npx pnpm exec nx run-many --targets=typecheck,lint --projects=util-shared,util-server,trpc,prisma,frontend

# Build the frontend (env vars are required)
ENVIRONMENT=development APP_VERSION=development npx pnpm exec nx build frontend

# Run a single test file (use --root of the owning package so path aliases resolve)
npx pnpm exec vitest run packages/util/server/src/general/grocy/grocyClient.spec.ts --root packages/util/server
```

**Test environment**: the config module (`packages/util/server/src/general/config.ts`) reads env at import and **throws on missing required vars**. Minimum for unit tests:

```sh
NODE_ENV=test API_PUBLIC_BASE_URL=http://localhost:3000 GRIP_URL=http://localhost:5561/ GRIP_KEY=changeme
```

The full CI env block is in `.circleci/config.yml`. Tests under `packages/trpc` and `*.int.spec.ts` files need a running Postgres (testutils fixtures create real users/sessions) — they pass in CI/dev containers, not on a bare laptop.

Husky pre-commit runs `nx affected -t lint,typecheck` + lint-staged (prettier reformats staged files — expect files to change during commit). It needs `pnpm` on PATH and the test env vars exported.

## Architecture

### Packages

- `packages/trpc` — the API. One procedure per file under `procedures/<domain>/`, each with `.meta({openapi})`, zod `.input()/.output()`, and a sibling `.spec.ts` using the `test` fixture from `testutils.ts` (DB-backed callers `trpc`/`trpc2` for two users). Routers register in `src/index.ts`.
- `packages/util/shared` — isomorphic code (zod `apiSchemas/`, ingredient parsers, pantry view models/matching). Frontend imports types from here and from `inferRouterInputs/Outputs<AppRouter>`.
- `packages/util/server` — server-only: `general/config.ts` (typed env config), `general/grocy/` (Grocy REST client), `general/pantry/`, `ml/` (AI layer), auth, queue.
- `packages/prisma` — schema at `src/prisma/schema.prisma`, handwritten SQL migrations in `src/prisma/migrations/`, generated client committed under `src/prisma/generated`.
- `packages/backend` — express app; prod entrypoint `node dist/apps/backend/main.cjs`. It spawns the BullMQ job worker itself via `JOB_QUEUE_WORKER_PATH` (needs valkey/redis at `JOB_QUEUE_REDIS_HOST`); no separate worker container in prod.
- `packages/frontend` — Angular/Ionic PWA, standalone components + signals. Key integration points when adding a page: `services/util.service.ts` (RouteMap), `app.routes.ts`, `app.component.ts` (menu + `addIcons`), `assets/i18n/en-us.json`, and a `*-actions.service.ts` under `services/server-actions/` registered in `server-actions.service.ts`. Frontend lint includes ngx-translate-lint — every template i18n key must exist in `en-us.json`.

### The ML/AI layer

`packages/util/server/src/ml/` uses the Vercel AI SDK with a pluggable provider (`AI_PROVIDER` + `AI_API_KEY`; openrouter/openai/anthropic/google). Pattern for vision/structured calls: `generateText` + `Output.object({schema})` wrapped in `withNoObjectRetry`, metrics via `metrics.llmTokensConsumed`. See `visionToRecipe.ts`, `photoToProduct.ts`.

### Smart pantry (fork feature)

Grocy (external service) is the single source of truth for stock; the app proxies it — the frontend never talks to Grocy. Flow: `pantry` tRPC router → `grocyTrpc()` error translation (`procedures/pantry/common.ts`: 412 = not configured, 500 = unreachable) → `GrocyClient` (`util/server/general/grocy/`). Container-unit products (Jar/Bottle) represent fill level as fractional stock amounts, mapped to buckets in `util/shared/pantry.ts`. Ingredient↔product matching (`util/shared/pantryMatching.ts`) is alias-first (`Pantry_Product_Aliases` table) then fuzzy; results cached by product-set hash. Pantry procedure specs mock Grocy's HTTP via `procedures/pantry/testGrocy.ts` and set `GROCY_URL`/`GROCY_API_KEY` with `vi.hoisted` before imports.

Station scanning: `scripts/pantry/scan-hid.py` (USB HID barcode scanner → Barcode Buddy → Grocy). Webcam decoding was validated and rejected (`scripts/pantry/README.md` has findings); `scan-webcam.sh` is a fallback only.

## Deployment

`deploy/nas/` is the production deployment (Dockge/compose stack: fork images + Grocy + Barcode Buddy). Images build on push to `smart-pantry` via `.github/workflows/build-selfhost-images.yml` → `ghcr.io/davidne0uk/recipesage:{api,static}-smart-pantry`. Docs: `deploy/nas/README.md`, `docs/pantry-setup.md`, `docs/pantry-backup.md`.

Hard-won deployment facts (each broke the first boot once):

- All `AI_MODEL_*` env vars are **required** at runtime outside `NODE_ENV=test` — the code-level defaults in config.ts never apply because `getEnvString` throws first.
- The frontend is built with `<base href="/app/">`; the stock selfhost proxy image predates this. `deploy/nas/proxy.conf` (path rewrite) and `static.conf` (SPA fallback) are mounted over the nginx defaults.
- `window.version` stamped into `index.html` must be semver-coercible ≥3.0.0 or the backend `/versioncheck` marks the client unsupported and the UI loops an "app out of date" alert. Fork builds use `3.99.<run_number>`.
- BullMQ's sandboxed-worker helper resolves relative to the bundled backend; `production.Dockerfile` symlinks `/app/dist/cjs` → `node_modules/bullmq/dist/cjs`.
- `f0rc3/barcodebuddy-docker` has no `latest` tag and no multi-arch manifests — tags are per-arch (`v1.8.1.5` amd64, `arm64v8-v1.8.1.5` arm64). Barcode Buddy 1.8.1.5 ignores `BBUDDY_*` env config; its Grocy connection must be written to the `BBConfig` table (or set via its UI).
