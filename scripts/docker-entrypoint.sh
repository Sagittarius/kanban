#!/bin/sh
set -eu

AUTO_UPGRADE="${KANBAN_AUTO_UPGRADE:-true}"

if [ "$AUTO_UPGRADE" = "true" ]; then
  echo "[kanban-entrypoint] checking and applying safe SQLite upgrade"
  node scripts/upgrade-local-sqlite.mjs
  node --input-type=module -e "import('./scripts/maintenance-state-lib.mjs').then((m) => m.clearMaintenanceState())"
else
  echo "[kanban-entrypoint] auto upgrade disabled, running maintenance preflight"
  node scripts/preflight-maintenance.mjs
fi

exec node_modules/.bin/vinext start --hostname 0.0.0.0
