import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  applyMigrations,
  ensureDatabaseDirectory,
  ensureUpgradeMetadataTables,
  filesystemSafeTimestamp,
  formatLogTimestamp,
  getPendingMigrations,
  readAppVersion,
  recordUpgradeSuccess,
  resolveDatabasePath,
  resolveMigrationsDir,
} from "./sqlite-migration-lib.mjs";

export function inspectUpgradeState() {
  const databasePath = resolveDatabasePath();
  const migrationsDir = resolveMigrationsDir();
  const appVersion = readAppVersion();

  ensureDatabaseDirectory(databasePath);

  if (!fs.existsSync(databasePath)) {
    const pending = listPendingForMissingDatabase(databasePath, migrationsDir);
    return {
      appVersion,
      databasePath,
      exists: false,
      pending,
      lastVersion: "uninitialized",
    };
  }

  const database = new DatabaseSync(databasePath);
  const pending = getPendingMigrations(database, migrationsDir);
  ensureUpgradeMetadataTables(database);
  const lastVersion =
    database
      .prepare("SELECT value FROM kanban_runtime_meta WHERE key = ?")
      .get("app_version")?.value ?? "unknown";
  database.close();

  return {
    appVersion,
    databasePath,
    exists: true,
    pending,
    lastVersion: String(lastVersion),
  };
}

export function checkUpgrade() {
  const state = inspectUpgradeState();

  if (!state.exists) {
    console.log(`[kanban-upgrade] database does not exist yet: ${state.databasePath}`);
    if (state.pending.length > 0) {
      console.log("[kanban-upgrade] initial setup is required before serving business pages.");
      for (const name of state.pending) {
        console.log(`- ${name}`);
      }
      console.log(`[kanban-upgrade] target app version: ${state.appVersion}`);
      process.exitCode = 2;
    }
    return state;
  }

  if (state.pending.length === 0) {
    console.log(
      `[kanban-upgrade] database is up to date. app=${state.appVersion} db_version=${state.lastVersion}`
    );
    return state;
  }

  console.log(`[kanban-upgrade] pending migrations for ${state.databasePath}:`);
  for (const name of state.pending) {
    console.log(`- ${name}`);
  }
  console.log(`[kanban-upgrade] target app version: ${state.appVersion}`);
  process.exitCode = 2;
  return state;
}

export function runSafeUpgrade() {
  const databasePath = resolveDatabasePath();
  const migrationsDir = resolveMigrationsDir();
  const appVersion = readAppVersion();
  const startedAt = formatLogTimestamp();
  const backupDir =
    process.env.KANBAN_SQLITE_BACKUP_DIR ??
    path.join(path.dirname(databasePath), "backups");

  ensureDatabaseDirectory(databasePath);
  fs.mkdirSync(backupDir, { recursive: true });

  const pending = inspectUpgradeState().pending;
  if (pending.length === 0) {
    console.log(`[kanban-upgrade] no upgrade needed for ${databasePath}`);
    return {
      databasePath,
      appVersion,
      backupPath: "",
      applied: 0,
      pending,
    };
  }

  const backupPath = buildBackupPath(databasePath, backupDir, startedAt, appVersion);
  const tempPath = buildTempPath(databasePath, startedAt);

  try {
    if (fs.existsSync(databasePath)) {
      fs.copyFileSync(databasePath, backupPath);
      fs.copyFileSync(databasePath, tempPath);
      console.log(`[kanban-upgrade] backup created: ${backupPath}`);
    } else {
      fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    }

    const database = new DatabaseSync(tempPath);
    const result = applyMigrations(database, migrationsDir);
    database.exec("PRAGMA integrity_check;");
    recordUpgradeSuccess(database, {
      appVersion,
      startedAt,
      completedAt: formatLogTimestamp(),
      databasePath,
      backupPath: fs.existsSync(backupPath) ? backupPath : "",
      details: `applied=${result.applied};pending=${result.pending.join(",")}`,
    });
    database.close();

    fs.renameSync(tempPath, databasePath);
    console.log(
      `[kanban-upgrade] upgrade completed. applied ${result.applied} migration(s). database=${databasePath}`
    );

    return {
      databasePath,
      appVersion,
      backupPath: fs.existsSync(backupPath) ? backupPath : "",
      applied: result.applied,
      pending,
    };
  } catch (error) {
    cleanupTempFile(tempPath);
    console.error(`[kanban-upgrade] upgrade failed. original database kept: ${databasePath}`);
    if (fs.existsSync(backupPath)) {
      console.error(`[kanban-upgrade] backup preserved at: ${backupPath}`);
    }
    if (error && typeof error === "object") {
      error.backupPath = fs.existsSync(backupPath) ? backupPath : "";
    }
    throw error;
  }
}

function listPendingForMissingDatabase(databasePath, migrationsDir) {
  const initialDatabase = new DatabaseSync(databasePath);
  const pending = getPendingMigrations(initialDatabase, migrationsDir);
  initialDatabase.close();
  fs.rmSync(databasePath, { force: true });
  return pending;
}

function buildBackupPath(databasePath, backupDir, startedAt, appVersion) {
  const timestamp = filesystemSafeTimestamp(startedAt);
  const baseName = path.basename(databasePath, path.extname(databasePath));
  return path.join(backupDir, `${baseName}.backup.${timestamp}.v${appVersion}.sqlite`);
}

function buildTempPath(databasePath, startedAt) {
  const timestamp = filesystemSafeTimestamp(startedAt);
  return `${databasePath}.upgrade.${timestamp}.tmp`;
}

function cleanupTempFile(tempPath) {
  if (fs.existsSync(tempPath)) {
    fs.rmSync(tempPath, { force: true });
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    checkUpgrade();
    return;
  }

  runSafeUpgrade();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
