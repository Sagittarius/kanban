#!/bin/sh
set -eu

AUTO_UPGRADE="${KANBAN_AUTO_UPGRADE:-true}"
DB_DRIVER="${KANBAN_DB_DRIVER:-${DB_DRIVER:-sqlite}}"

if [ "$DB_DRIVER" = "postgres" ]; then
  echo "[kanban-entrypoint] applying PostgreSQL migrations"
  node scripts/migrate-postgres.mjs
else
  if [ "$AUTO_UPGRADE" = "true" ]; then
    echo "[kanban-entrypoint] checking and applying safe SQLite upgrade"
    node scripts/upgrade-local-sqlite.mjs
    node --input-type=module -e "import('./scripts/maintenance-state-lib.mjs').then((m) => m.clearMaintenanceState())"
  else
    echo "[kanban-entrypoint] auto upgrade disabled, running SQLite maintenance preflight"
    node scripts/preflight-maintenance.mjs
  fi
fi

exec node server.js
