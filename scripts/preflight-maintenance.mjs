import { pathToFileURL } from "node:url";
import { inspectPostgresUpgradeState } from "./postgres-migration-lib.mjs";
import { clearMaintenanceState, writeMaintenanceState } from "./maintenance-state-lib.mjs";
import { readImageTag } from "./sqlite-migration-lib.mjs";

function resolveDatabaseDriver() {
  return process.env.KANBAN_DB_DRIVER ?? process.env.DB_DRIVER ?? "sqlite";
}

export async function runPreflightMaintenance() {
  const driver = resolveDatabaseDriver();
  const state = driver === "postgres"
    ? await inspectPostgresUpgradeState()
    : await inspectSqliteUpgradeState();

  if (state.pending.length === 0) {
    clearMaintenanceState();
    console.log("[kanban-maintenance] no maintenance mode required");
    return { maintenance: false, ...state };
  }

  const statePath = writeMaintenanceState({
    mode: "pending_upgrade",
    imageTag: readImageTag(),
    databasePath: state.databasePath,
    pendingMigrations: state.pending,
    lastKnownDbVersion: state.lastVersion,
    lastBackupPath: "",
    lastUpgradeAt: "",
    message: state.exists
      ? "检测到数据库待升级，业务页面已切换为维护模式"
      : "检测到数据库尚未初始化，需先完成初始化升级",
  });
  console.log(`[kanban-maintenance] maintenance mode enabled: ${statePath}`);
  console.log(`[kanban-maintenance] pending migrations for ${state.databasePath}:`);
  for (const name of state.pending) {
    console.log(`- ${name}`);
  }
  console.log(`[kanban-maintenance] target app version: ${state.appVersion}`);
  return { maintenance: true, statePath, ...state };
}

async function inspectSqliteUpgradeState() {
  const { inspectUpgradeState } = await import("./upgrade-local-sqlite.mjs");
  return inspectUpgradeState();
}

async function main() {
  await runPreflightMaintenance();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
