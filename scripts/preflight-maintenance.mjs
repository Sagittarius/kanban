import { pathToFileURL } from "node:url";
import { inspectUpgradeState } from "./upgrade-local-sqlite.mjs";
import { clearMaintenanceState, writeMaintenanceState } from "./maintenance-state-lib.mjs";
import { readImageTag } from "./sqlite-migration-lib.mjs";

export function runPreflightMaintenance() {
  const state = inspectUpgradeState();

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

async function main() {
  runPreflightMaintenance();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
