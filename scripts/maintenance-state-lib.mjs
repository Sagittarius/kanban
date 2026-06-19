import fs from "node:fs";
import path from "node:path";
import { readAppVersion, readImageTag, resolveDatabasePath } from "./sqlite-migration-lib.mjs";

export function resolveMaintenanceStatePath() {
  return (
    process.env.KANBAN_MAINTENANCE_STATE_PATH ??
    path.join(path.dirname(resolveDatabasePath()), "kanban-maintenance.json")
  );
}

export function resolveMaintenanceLockPath() {
  return `${resolveMaintenanceStatePath()}.lock`;
}

export function readMaintenanceState() {
  const statePath = resolveMaintenanceStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

export function writeMaintenanceState(payload) {
  const statePath = resolveMaintenanceStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        appVersion: readAppVersion(),
        imageTag: readImageTag(),
        updatedAt: new Date().toISOString(),
        ...payload,
      },
      null,
      2
    )
  );
  return statePath;
}

export function clearMaintenanceState() {
  const statePath = resolveMaintenanceStatePath();
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
}

export function withMaintenanceLock(run) {
  const lockPath = resolveMaintenanceLockPath();
  let handle;

  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    handle = fs.openSync(lockPath, "wx");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      const existingState = readMaintenanceState();
      if (existingState?.mode !== "upgrade_running") {
        writeMaintenanceState({
          ...(existingState ?? {}),
          mode: "upgrade_running",
          message: "已有升级任务正在执行",
        });
      }
      throw new Error("UPGRADE_ALREADY_RUNNING");
    }
    throw error;
  }

  try {
    return run();
  } finally {
    if (typeof handle === "number") {
      fs.closeSync(handle);
    }
    fs.rmSync(lockPath, { force: true });
  }
}
