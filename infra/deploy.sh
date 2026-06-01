#!/bin/bash
# Post-rsync hook run by GitHub Actions over SSH as the `deploy` user via
# `sudo /srv/velokarte/infra/deploy.sh`. Because of the sudo, this script
# runs as root and can read /etc/velokarte/env.
set -euo pipefail

# Source DATABASE_URL etc. into the environment so migrate.ts sees it.
set -a
# shellcheck disable=SC1091
source /etc/velokarte/env
set +a

cd /srv/velokarte/backend

# Install/refresh production deps for backend (osmtogeojson for the pmtiles
# script via NODE_PATH; bun:sql is a built-in, no install needed).
/usr/local/bin/bun install --production

# Apply any pending migrations (idempotent).
/usr/local/bin/bun run migrate.ts

# Reload Caddy (picks up any Caddyfile change without dropping connections).
/bin/systemctl reload caddy

# IPv6 source rotation for the Overpass proxy. curl is required by server.ts;
# the AnyIP unit makes the OVERPASS_BIND_PREFIX /64 bindable. Both are no-ops at
# runtime unless OVERPASS_BIND_PREFIX is set in /etc/velokarte/env. Never let an
# AnyIP hiccup block the deploy — the proxy falls back to a plain fetch.
command -v curl >/dev/null 2>&1 \
  || { apt-get update -q && apt-get install -y -q curl; } \
  || echo "WARN: curl missing and install failed; Overpass source rotation inactive"
/usr/bin/install -m 644 /srv/velokarte/infra/systemd/velokarte-anyip.service \
  /etc/systemd/system/velokarte-anyip.service
/bin/systemctl daemon-reload
/bin/systemctl enable velokarte-anyip.service >/dev/null 2>&1 || true
/bin/systemctl restart velokarte-anyip.service \
  || echo "WARN: velokarte-anyip failed to apply (Overpass source rotation inactive)"

# Restart the API so a fresh server.ts is loaded.
/bin/systemctl restart velokarte-api

echo "deploy complete"
