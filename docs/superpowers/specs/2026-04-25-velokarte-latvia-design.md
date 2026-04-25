---
title: Velokarte — Latvia cycling map (CicloMapa fork)
status: design-approved
date: 2026-04-25
upstream: https://github.com/cmdalbem/ciclomapa
fork: https://github.com/dzervelce/ciclomapa
deploy_target: velokarte.pocs.dev
license: GPL-3.0 (inherited from upstream)
---

# Velokarte — design spec

## 1. Goal

Run a self-hosted Latvian cycling-infrastructure map at `velokarte.pocs.dev` for personal/friends use, derived from a fork of `cmdalbem/ciclomapa` with three principal swaps: Firebase → PostgreSQL 18, Mapbox → MapLibre + MapTiler, Portuguese-only UI → Latvian + English.

The fork is optimized for low long-term maintenance: maximize pure additions and small configuration edits, minimize patches to upstream React source files. Periodic upstream merges should land with minimal conflict.

## 2. Non-goals

- Multi-tenant / multi-country support. Latvia only.
- User accounts, comments, contributor flows. Read-only public site; the only writer is the app itself when refreshing OSM data.
- Vendor parity with CicloMapa's hosted instance. Subset of features: AnalyticsSidebar and Directions stay; Comments/Airtable is removed.
- Mobile-native apps. PWA is kept (already wired upstream); no native build.
- Horizontal scaling. Single VPS, single Postgres instance.

## 3. Architecture

```
                   Internet
                      │
            velokarte.pocs.dev (HTTPS)
                      │
                 ┌────▼────┐
                 │  Caddy  │
                 └────┬────┘
        ┌─────────────┼─────────────┬──────────────┐
        │             │             │              │
   /  (static)    /api/*       (browser            /pmtiles/*
                                directly to        (static
                                MapTiler)           file)
        │             │                            │
   ┌────▼────┐   ┌────▼────┐                  ┌────▼─────┐
   │ React   │   │  Bun    │                  │ static   │
   │ build   │   │ server  │                  │ PMTiles  │
   │ (dist)  │   │  :8080  │                  │  file    │
   └─────────┘   └────┬────┘                  └────▲─────┘
                      │                            │
                 ┌────▼────┐                       │
                 │ Postgres│                       │ regenerated
                 │   18    │                       │ hourly by
                 └─────────┘                       │   cron
                                              ┌────┴─────┐
                                              │ Overpass │
                                              │ (public) │
                                              └──────────┘
```

A single Hetzner VPS hosts three systemd-managed services: `caddy`, `velokarte-api` (Bun), `postgresql`. The PMTiles file is a static asset served by Caddy. Map basemap tiles are loaded by the browser directly from MapTiler's CDN; the VPS does not proxy or cache them.

## 4. Stack

| Layer | Choice |
|---|---|
| OS | Ubuntu 24.04 LTS, upgraded to 26.04 LTS via `do-release-upgrade -d` post-install |
| Web server / TLS | Caddy (auto-HTTPS) |
| Frontend runtime / build | Bun (also serves as package manager) |
| Frontend framework | React 19 + CRA + craco (inherited from upstream) |
| Map renderer | MapLibre GL JS, installed via npm package alias as `mapbox-gl` |
| Geocoder | `@maplibre/maplibre-gl-geocoder` aliased to `@mapbox/mapbox-gl-geocoder`; backend = Nominatim (public) |
| Basemap tiles | MapTiler free tier |
| Cycling overlay tiles | Self-hosted PMTiles, generated from Overpass via the upstream script |
| Routing | OpenRouteService free tier (2000 req/day) |
| Backend runtime | Bun |
| Backend DB driver | `bun:sql` (native, no `pg`) |
| Database | PostgreSQL 18 (PGDG apt repo) |
| i18n | `react-i18next` + `i18next-browser-languagedetector` |
| Locales | `lv` (default by browser-detect), `en` (fallback) |
| CI/CD | GitHub Actions on push-to-`main` → SSH rsync deploy |

## 5. Repository layout

The fork **stays at the repo root** (no restructuring) so upstream merges never conflict on file moves. New top-level directories (`backend/`, `infra/`, `docs/`, `.github/`) are pure additions that upstream does not have.

```
velokarte/                         # Renamed fork of cmdalbem/ciclomapa
├── src/                           # Existing (from upstream); patches in-place
│   ├── locales/                   # NEW: lv.json, en.json
│   ├── i18n.ts                    # NEW: react-i18next bootstrap
│   ├── Storage.js                 # REWRITTEN: REST → /api/*
│   ├── config/
│   │   ├── constants.js           # PATCHED: Latvia values
│   │   ├── citySlugCatalog.js     # PATCHED: Latvian cities
│   │   └── topCitiesCatalog.js    # PATCHED: Latvian cities
│   ├── AboutModal.js              # PATCHED: Velokarte copy
│   ├── Map.js                     # PATCHED: 1-2 lines (style URL)
│   ├── index.js                   # PATCHED: imports ./i18n
│   └── ...                        # everything else untouched
├── public/
│   ├── index.html                 # PATCHED: title, meta
│   └── favicon.ico                # REPLACED
├── package.json                   # PATCHED: npm aliases, deps
├── scripts/                       # Existing (untouched)
├── ...                            # all other upstream files untouched
│
├── backend/                       # NEW (top-level addition)
│   ├── server.ts                  # ~120 LOC, all REST endpoints
│   ├── refresh-pmtiles.ts         # Hourly cron entry
│   ├── migrate.ts                 # Idempotent migration runner
│   ├── migrations/
│   │   └── 001_init.sql
│   └── package.json
├── infra/                         # NEW
│   ├── Caddyfile
│   ├── systemd/
│   │   ├── velokarte-api.service
│   │   ├── velokarte-pmtiles.service
│   │   └── velokarte-pmtiles.timer
│   └── deploy.sh
├── docs/                          # NEW
│   └── superpowers/specs/
│       └── 2026-04-25-velokarte-latvia-design.md
└── .github/                       # NEW
    └── workflows/
        └── deploy.yml
```

Upstream merges only ever touch existing files (`src/`, `public/`, `package.json`, etc.). The new top-level directories are conflict-free by construction; upstream has no `backend/`, `infra/`, `docs/`, or `.github/workflows/` of its own.

If upstream ever does add a `backend/` or `infra/` dir, we revisit naming (e.g., rename to `velokarte-backend/`). Probability is low.

## 6. Frontend changes

### 6.1 package.json (patched)

- npm package alias: `"mapbox-gl": "npm:maplibre-gl@^4.7"`. Imports remain `from 'mapbox-gl'`.
- npm package alias: `"@mapbox/mapbox-gl-geocoder": "npm:@maplibre/maplibre-gl-geocoder@^1.x"`. May require a small adapter if API surface differs.
- Add: `react-i18next`, `i18next`, `i18next-browser-languagedetector`.
- Remove: `firebase`, `aws-sdk`, `@mapbox/mapbox-sdk`, Airtable-related (none currently — handled at runtime).

### 6.2 Storage.js (rewritten)

Same exported interface as upstream (`save`, `load`, `getCityStatsDoc`, `getAllCitiesStats`, etc.) so callers do not change. Internals replaced with `fetch('/api/cities/:slug')` etc. Local IndexedDB cache via `idb-keyval` is kept as-is. Approx. 150 LOC.

### 6.3 Configuration patches

`src/config/constants.js`:
- `SUPPORTED_COUNTRIES` → `[{ code: 'lv', labelLv: 'Latvija', flag: '🇱🇻' }]`
- `DEFAULT_AREA = 'Rīga, Latvija'`, `DEFAULT_LNG = 24.105186`, `DEFAULT_LAT = 56.946285`, `DEFAULT_ZOOM = 11`
- `ENABLE_COMMENTS = false`
- `OSM_DATA_MAX_AGE_DAYS = 0.04` (≈ 1 hour)
- New: `MAPTILER_STYLE_URL = process.env.REACT_APP_MAPTILER_STYLE_URL`
- `AREA_ID_OVERRIDES` → `{}` (empty unless a Latvian city fails to resolve via OSM relation lookup; fill ad hoc)

`src/config/citySlugCatalog.js` and `topCitiesCatalog.js`:
- Replace Brazilian entries with: Rīga, Liepāja, Daugavpils, Jelgava, Jūrmala, Ventspils, Rēzekne, Valmiera, Cēsis, Kuldīga, Sigulda, Tukums.

### 6.4 i18n (new)

`src/i18n.ts` initializes `react-i18next` with `LanguageDetector`, `lv` default, `en` fallback. Locale files `src/locales/{lv,en}.json` flat key-value structures. `src/index.js` adds one import: `import './i18n';`.

User-visible strings throughout the JSX are wrapped: `<span>texto</span>` → `<span>{t('key')}</span>`. This is the single largest patch surface and is accepted as a one-time cost. Upstream string changes will surface as i18n key additions — manageable.

### 6.5 Map.js (minimal patch)

The Mapbox style URL constant is replaced with `MAPTILER_STYLE_URL`. All other Mapbox API usage (sources, layers, expressions, popups, geocoder mount) is style-spec-standard and works unchanged on MapLibre via the npm alias.

### 6.6 Branding

`public/index.html`: title, meta description, OG tags, manifest reference → "Velokarte". `favicon.ico` and PWA icons replaced (generated by `scripts/generate-pwa-icons.js` from a source SVG when one exists).

`AboutModal.js`: copy rewritten for Velokarte; attribution back to CicloMapa under GPLv3.

### 6.7 Comments / Airtable

Code paths gated by `ENABLE_COMMENTS = false` are left intact (not deleted) to minimize merge surface. Airtable env vars are documented as optional and unused.

## 7. Backend

### 7.1 Schema

`backend/migrations/001_init.sql`:

```sql
CREATE TABLE cities (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  geojson      JSONB NOT NULL,
  lengths      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stats (
  slug         TEXT PRIMARY KEY,
  lengths      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cities_updated_at_idx ON cities(updated_at);
```

Firestore's chunking workaround is dropped — Postgres has no 1MB row limit. PostGIS is not required; the database is a keyed JSONB blob store.

### 7.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/cities/:slug` | Return cached city geojson + lengths + updatedAt |
| `PUT` | `/api/cities/:slug` | Upsert; called by frontend after fresh Overpass fetch |
| `GET` | `/api/stats/:slug` | Return per-city length aggregates |
| `GET` | `/api/stats` | Return all city stats (city picker) |
| `PUT` | `/api/stats/:slug` | Upsert |
| `GET` | `/api/health` | Liveness probe (returns 200) |

No authentication on writes. The frontend is the only writer (browser-side after Overpass refresh). The cache-write semantics (idempotent upsert keyed by city slug) and the manual-refresh cooldown in the UI make abuse low-impact. Rate limiting can be added later if needed (see §8.1).

### 7.3 Cron — PMTiles refresh

`refresh-pmtiles.ts` runs hourly via `velokarte-pmtiles.timer` (`OnCalendar=hourly`).

1. Spawns `node /srv/velokarte/scripts/generate-pmtiles.js --area "Latvia" --output /tmp/latvia-new.pmtiles`. The `scripts/` dir is rsynced to the VPS as part of every deploy.
2. On success, atomic rename to `/srv/velokarte/pmtiles/latvia.pmtiles`.
3. On Overpass rate-limit / failure: log to journald, exit 0 (no retry storm). Next hourly tick tries again.

## 8. Infrastructure

### 8.1 Caddyfile

```caddyfile
velokarte.pocs.dev {
    encode gzip zstd

    # Static frontend (SPA fallback) — served from CRA build output
    root * /srv/velokarte/build
    file_server
    try_files {path} /index.html

    # API
    handle /api/* {
        reverse_proxy localhost:8080
    }

    # PMTiles (HTTP range requests)
    handle /pmtiles/* {
        root * /srv/velokarte
        file_server
        header Cache-Control "public, max-age=300"
    }
}
```

Caddy's stock distribution is sufficient — no custom plugins required. Rate limiting is intentionally omitted for v1 (personal-scale traffic, attack surface minimal). If abuse appears, revisit by building Caddy with `xcaddy` + `mholt/caddy-ratelimit`.

### 8.2 systemd

**`velokarte-api.service`**: runs `bun run /srv/velokarte/backend/server.ts`, `Restart=on-failure`, reads secrets from `/etc/velokarte/env` (mode 0600, owned by service user).

**`velokarte-pmtiles.timer`**: hourly trigger. **`velokarte-pmtiles.service`**: oneshot running `refresh-pmtiles.ts`.

### 8.3 Postgres

- Local socket only; no public bind.
- Strong randomly-generated password committed nowhere.
- Daily `pg_dump` to `/var/backups/velokarte/`, 7-day retention. Cron via `pg_dump`-aware script.

### 8.4 OS user model

- `root` — administration only.
- `deploy` — owned `/srv/velokarte/`, allowed to run two specific `sudo` commands (`systemctl reload caddy`, `systemctl restart velokarte-api`) via `/etc/sudoers.d/velokarte`. Receives the GitHub Actions deploy key.
- `velokarte-api` — service account running the Bun server. Owns nothing writable.
- `postgres` — standard.

## 9. Deployment

### 9.1 Pipeline

`.github/workflows/deploy.yml` triggers on push to `main`:

1. Checkout.
2. Setup Bun.
3. `bun install --frozen-lockfile && bun run build` at repo root → produces `./build/`.
4. Rsync `./build/` → `/srv/velokarte/build/` on VPS as `deploy` user.
5. Rsync `backend/`, `scripts/`, and `infra/` to `/srv/velokarte/` (preserving structure).
6. Rsync `infra/Caddyfile` → `/etc/caddy/Caddyfile`.
7. SSH `deploy@vps` → run `/srv/velokarte/infra/deploy.sh`.

### 9.2 deploy.sh

```bash
#!/bin/bash
set -euo pipefail
cd /srv/velokarte/backend
bun install --production --frozen-lockfile
bun run /srv/velokarte/backend/migrate.ts   # idempotent
sudo systemctl reload caddy
sudo systemctl restart velokarte-api
```

End-to-end push → live: 60–90 seconds. Frontend rsync sends only diffs (CRA hashes filenames). Bun restart ≈ 1s. Caddy reload is hot, no downtime. API restart causes a sub-2-second blip; acceptable for personal scale.

### 9.3 Secrets

**GitHub Actions Secrets** (used during build + deploy):
- `SSH_KEY` — private key for `deploy@vps`
- `VPS_HOST` — IP/hostname
- `REACT_APP_MAPTILER_API_KEY` — baked into the frontend bundle at `bun run build`
- `REACT_APP_MAPTILER_STYLE_URL` — same
- `REACT_APP_OPENROUTESERVICE_API_KEY` — same

**`/etc/velokarte/env` on VPS** (not in git, mode 0600, owned by `velokarte-api` user):
- `DATABASE_URL` — `postgres:///velokarte` via local socket; only consumer is the Bun server.

The `REACT_APP_*` variables are React-build-time only. Once the frontend is built, the values are static strings inside the JS bundle. They never need to live on the VPS at runtime.

## 10. Data refresh

| Layer | Mechanism | Frequency |
|---|---|---|
| Country PMTiles overlay | systemd timer → `refresh-pmtiles.ts` → upstream `generate-pmtiles.js "Latvia"` → atomic file swap | Hourly |
| Per-city detailed GeoJSON | Frontend hits Overpass on user click of refresh, or auto if `updatedAt > 1h old`. Result `PUT` to `/api/cities/:slug` | On demand |
| Stats per city | Computed at PUT time from the GeoJSON, stored alongside | With per-city refresh |
| "Last updated" badge in UI | Reads `updatedAt` from API responses | Real-time |

If Overpass rate-limits, the cron skips quietly. Per-city refresh button in the UI surfaces the same Overpass call and shows the same error to the user.

## 11. Upstream merge strategy

- **Branches in `dzervelce/ciclomapa` fork:**
  - `upstream-master` — tracks `cmdalbem/ciclomapa:master` exactly. Never patched directly.
  - `main` — default branch, contains all patches and additions. CI deploys from this branch.
- **Merge cadence:** monthly, or when upstream lands something interesting.
- **Workflow:**
  ```
  git fetch upstream
  git checkout upstream-master && git merge upstream/master
  git checkout main && git merge upstream-master
  # resolve conflicts (mostly package.json or i18n-wrapped JSX)
  bun install && bun run build  # smoke verify
  git push origin main
  # GitHub Actions deploys automatically
  ```
- **Patch hygiene:**
  - All new files live in clearly-named directories upstream wouldn't touch.
  - All edited files have minimal diffs. No drive-by reformatting.
  - `ENABLE_*` flags preferred over deletions; dormant code is cheaper than reapplying deletions on every merge.

## 12. Testing

CicloMapa upstream ships Jest + Playwright. Both are kept and run in CI on every push as a smoke check. Failing tests do not block deploy (personal scale).

- **Backend (new):** ~30 lines of `bun test` exercising each REST endpoint against a Postgres test container.
- **Frontend tests:** unchanged.
- **Manual smoke after each upstream merge:** load the site, search Riga, toggle layers, click refresh, plan a route. ~2 minutes.

No visual regression, no end-to-end gating, no load testing.

## 13. Open items / pre-launch checklist

1. Generate Hetzner SSH keypair (`~/.ssh/velokarte_ed25519`); upload public key to Hetzner.
2. Provision Hetzner VPS (Ubuntu 24.04 LTS); upgrade to 26.04 LTS via `do-release-upgrade -d`.
3. Generate GitHub Actions deploy SSH keypair; install on VPS for `deploy` user; store private key in repo Secrets.
4. Create MapTiler account; obtain API key; pick style URL (default: Streets v2).
5. Create OpenRouteService account; obtain API key.
6. Decide on logo (text-only "Velokarte" acceptable for v1).
7. Generate initial Latvia PMTiles file manually during VPS bootstrap (so the map renders before the first cron tick).
8. Postgres backup target: local-only for v1; offsite via Hetzner Storage Box later if desired.

## 14. Out-of-scope reminders

The following are explicitly deferred:

- Server-side proxy caching of MapTiler tiles (ToS unclear on free tier; revisit on paid plan or basemap swap).
- User authentication, accounts, multi-user.
- Comments, contributor flows, Airtable integration.
- Multi-country support.
- Native mobile apps.
- Monitoring / alerting (revisit after launch with Uptime Kuma if useful).
- OSM diff-stream integration (overkill for personal scale).
- Database schema migrations beyond `001_init.sql` until a real reason exists.
