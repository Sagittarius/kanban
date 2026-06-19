import { pathToFileURL } from "node:url";
import { readMaintenanceState, withMaintenanceLock, writeMaintenanceState, clearMaintenanceState } from "./maintenance-state-lib.mjs";
import { readImageTag } from "./sqlite-migration-lib.mjs";
import { runSafeUpgrade } from "./upgrade-local-sqlite.mjs";

export async function runMaintenanceUpgrade() {
  return withMaintenanceLock(() => {
    const previous = readMaintenanceState();
    writeMaintenanceState({
      ...(previous ?? {}),
      mode: "upgrade_running",
      imageTag: readImageTag(),
      message: "正在执行数据库升级",
    });

    try {
      const result = runSafeUpgrade();
      clearMaintenanceState();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upgrade failure";
      const backupPath =
        error && typeof error === "object" && "backupPath" in error && typeof error.backupPath === "string"
          ? error.backupPath
          : "";
      writeMaintenanceState({
        ...(previous ?? {}),
        mode: "upgrade_failed",
        imageTag: readImageTag(),
        databasePath: previous?.databasePath ?? "",
        pendingMigrations: previous?.pendingMigrations ?? [],
        lastKnownDbVersion: previous?.lastKnownDbVersion ?? "unknown",
        lastBackupPath: backupPath,
        lastUpgradeAt: "",
        message,
      });
      throw error;
    }
  });
}

async function main() {
  await runMaintenanceUpgrade();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
