import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAppVersion, getImageTag } from "@/lib/app-meta";

export type MaintenanceMode = "pending_upgrade" | "upgrade_running" | "upgrade_failed";

export type MaintenanceState = {
  mode: MaintenanceMode;
  appVersion: string;
  imageTag: string;
  databasePath: string;
  pendingMigrations: string[];
  lastKnownDbVersion: string;
  lastBackupPath: string;
  lastUpgradeAt: string;
  message: string;
  updatedAt: string;
};

export function getDatabasePath() {
  return process.env.KANBAN_SQLITE_PATH ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "kanban.sqlite");
}

export function getMaintenanceStatePath() {
  return (
    process.env.KANBAN_MAINTENANCE_STATE_PATH ??
    path.join(/* turbopackIgnore: true */ path.dirname(getDatabasePath()), "kanban-maintenance.json")
  );
}

export function buildMaintenanceDefaults() {
  return {
    appVersion: getAppVersion(),
    imageTag: getImageTag(),
    databasePath: getDatabasePath(),
  };
}

export async function readMaintenanceState(): Promise<MaintenanceState | null> {
  try {
    const text = await fs.readFile(/* turbopackIgnore: true */ getMaintenanceStatePath(), "utf8");
    const parsed = JSON.parse(text) as Partial<MaintenanceState>;
    if (!parsed.mode) {
      return null;
    }

    return {
      mode: parsed.mode,
      pendingMigrations: Array.isArray(parsed.pendingMigrations)
        ? parsed.pendingMigrations.filter((item): item is string => typeof item === "string")
        : [],
      lastKnownDbVersion: parsed.lastKnownDbVersion ?? "unknown",
      lastBackupPath: parsed.lastBackupPath ?? "",
      lastUpgradeAt: parsed.lastUpgradeAt ?? "",
      message: parsed.message ?? "",
      updatedAt: parsed.updatedAt ?? "",
      databasePath: parsed.databasePath ?? getDatabasePath(),
      appVersion: parsed.appVersion ?? getAppVersion(),
      imageTag: parsed.imageTag ?? getImageTag(),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function getMaintenanceEnvelope() {
  const state = await readMaintenanceState();
  return {
    active: Boolean(state),
    state,
    ...buildMaintenanceDefaults(),
  };
}

export async function guardMaintenanceApi() {
  const state = await readMaintenanceState();
  if (!state) {
    return null;
  }

  return NextResponse.json(
    {
      code: "MAINTENANCE_MODE",
      message: state.message || "系统正在维护升级中",
      active: true,
      appVersion: state.appVersion,
      imageTag: state.imageTag,
      pendingMigrations: state.pendingMigrations,
      mode: state.mode,
    },
    { status: 503 }
  );
}
