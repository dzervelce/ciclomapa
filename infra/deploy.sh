#!/bin/bash
# Post-rsync hook run by GitHub Actions over SSH as the `deploy` user.
# /etc/sudoers.d/velokarte permits the two systemctl commands without password.
set -euo pipefail

cd /srv/velokarte/backend

# Install/refresh production deps for backend (and transitively for scripts/ via NODE_PATH).
/usr/local/bin/bun install --production

# Apply any pending migrations (idempotent).
/usr/local/bin/bun run migrate.ts

# Reload Caddy (picks up any Caddyfile change without dropping connections).
sudo /bin/systemctl reload caddy

# Restart the API so a fresh server.ts is loaded.
sudo /bin/systemctl restart velokarte-api

echo "deploy complete"
