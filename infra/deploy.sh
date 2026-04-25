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

# Restart the API so a fresh server.ts is loaded.
/bin/systemctl restart velokarte-api

echo "deploy complete"
