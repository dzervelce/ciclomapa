#!/usr/bin/env sh
# Fail if a globally-routable IPv6 literal appears in tracked files.
#
# Guards against accidentally committing the VPS /64 (OVERPASS_BIND_PREFIX),
# which must live ONLY in /etc/velokarte/env on the server — never in the repo.
# The pattern is GENERIC (it does not encode the real address). Documentation
# range (2001:db8::/32) and link-local (fe80::/10) are allowlisted.
#
# Usage:
#   scripts/check-no-ipv6.sh            # scan committed working tree (CI)
#   scripts/check-no-ipv6.sh --cached   # scan the staged index (pre-commit)
#
# Uses `git grep` (portable regex engine) so it behaves the same on macOS and
# Linux, unlike `grep -P` which BSD grep lacks.
#
# The pattern requires a 2000::/3 or 3000::/3 leading group plus >=3 hextet
# groups, which matches the production /64 and full rotated addresses while
# staying false-positive-free on this repo. It would not catch an unusually short
# prefix (<3 hextet groups before '::'), which the production address is not.
set -eu

PATTERN='[23][0-9a-fA-F]{2,3}(:[0-9a-fA-F]{1,4}){2,7}'
ALLOW='2001:0?db8|fe80'

SRC=''
[ "${1:-}" = '--cached' ] && SRC='--cached'

HITS=$(git grep $SRC -InE "$PATTERN" -- \
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.sh' '*.yml' '*.yaml' '*.md' \
  ':!*lock*' 2>/dev/null | grep -ivE "$ALLOW" || true)

if [ -n "$HITS" ]; then
  echo 'ERROR: a globally-routable IPv6 literal is present in tracked files.' >&2
  echo 'Keep the VPS /64 out of the repo — it belongs only in' >&2
  echo '/etc/velokarte/env as OVERPASS_BIND_PREFIX. Offending lines:' >&2
  echo "$HITS" >&2
  exit 1
fi
