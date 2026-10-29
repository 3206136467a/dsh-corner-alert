#!/usr/bin/env bash
# Install dsh-corner-alert into a DeepSeek Harness (DSH) profile — macOS / Linux.
#
# Usage:
#   ./install.sh            # profile defaults to $DSH_PROFILE or 'desktop'
#   ./install.sh web        # explicit profile name
#
# Prefers the `dsh plugin` CLI (which also updates dsh.profile.bundles). Falls
# back to editing package.json + pnpm install when the CLI is unavailable.
set -euo pipefail

PROFILE="${1:-${DSH_PROFILE:-desktop}}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$DSH_HOME/plugins/dsh-corner-alert"
PROF="$DSH_HOME/profiles/$PROFILE"

echo "[1/3] copy plugin -> $DEST"
mkdir -p "$DSH_HOME/plugins"
if [ "$SRC" != "$DEST" ]; then
  mkdir -p "$DEST"
  # copy everything except VCS / backups / node_modules
  (cd "$SRC" && tar --exclude=.git --exclude=node_modules --exclude='*.bak' --exclude='*.bak-*' --exclude='*.log' -cf - .) | (cd "$DEST" && tar -xf -)
fi

if [ ! -d "$PROF" ]; then
  echo "Profile '$PROFILE' not found at $PROF. Start DSH once with that profile first." >&2
  exit 1
fi

if command -v dsh >/dev/null 2>&1; then
  echo "[2/3] dsh plugin --profile $PROFILE add file:$DEST"
  dsh plugin --profile "$PROFILE" add "file:$DEST"
else
  echo "[2/3] dsh CLI not found; editing package.json + pnpm install"
  node - "$PROF/package.json" "$DEST" <<'NODE'
const fs = require('fs');
const [pkgPath, dest] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies['dsh-corner-alert'] = 'file:' + dest;
pkg.dsh = pkg.dsh || {};
pkg.dsh.profile = pkg.dsh.profile || {};
const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
if (!bundles.includes('dsh-corner-alert')) bundles.push('dsh-corner-alert');
pkg.dsh.profile.bundles = bundles;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
NODE
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$PROF" && pnpm install)
  else
    echo "pnpm not found. Run 'pnpm install' in $PROF before starting DSH." >&2
  fi
fi

echo "[3/3] done."
echo "Next: restart DSH (or refresh the web UI). Verify with __dshCornerAlert.test() in the DevTools console."
echo "Uninstall: dsh plugin --profile $PROFILE remove dsh-corner-alert"
