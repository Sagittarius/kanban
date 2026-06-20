import fs from "node:fs";
import path from "node:path";

export function resolveDatabasePath() {
  return (
    process.env.KANBAN_SQLITE_PATH ??
    path.join(process.cwd(), ".data", "kanban.sqlite")
  );
}

export function resolveMigrationsDir() {
  return path.join(process.cwd(), "drizzle");
}

export function ensureDatabaseDirectory(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

export function ensureMigrationsTable(database) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"
  );
}

export function listMigrationFiles(migrationsDir = resolveMigrationsDir()) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export function getAppliedMigrationNames(database) {
  ensureMigrationsTable(database);
  const rows = database.prepare("SELECT name FROM d1_migrations ORDER BY name").all();
  return new Set(rows.map((row) => String(row.name)));
}

export function getPendingMigrations(database, migrationsDir = resolveMigrationsDir()) {
  const applied = getAppliedMigrationNames(database);
  return listMigrationFiles(migrationsDir).filter((name) => !applied.has(name));
}

export function applyMigrations(database, migrationsDir = resolveMigrationsDir()) {
  ensureMigrationsTable(database);

  const pending = getPendingMigrations(database, migrationsDir);
  let applied = 0;

  for (const migration of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
    for (const statement of splitStatements(sql)) {
      const trimmed = statement.trim();
      if (trimmed) {
        database.exec(trimmed);
      }
    }
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migration);
    applied += 1;
  }

  return { applied, pending };
}

export function splitStatements(sql) {
  return sql.split("--> statement-breakpoint");
}

export function readAppVersion() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return String(packageJson.version ?? "0.0.0");
}

export function readImageTag() {
  const configuredTag = process.env.KANBAN_IMAGE_TAG;
  const appVersion = readAppVersion();
  if (!configuredTag) {
    return `kanban:${appVersion}`;
  }
  return configuredTag.replaceAll("{version}", appVersion);
}

export function ensureUpgradeMetadataTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS kanban_upgrade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_version TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      database_path TEXT NOT NULL,
      backup_path TEXT,
      details TEXT DEFAULT ''
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS kanban_runtime_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function recordUpgradeSuccess(database, payload) {
  ensureUpgradeMetadataTables(database);
  const completedAt = payload.completedAt ?? new Date().toISOString();
  database
    .prepare(
      `INSERT INTO kanban_upgrade_history (
        app_version, status, started_at, completed_at, database_path, backup_path, details
      ) VALUES (?, 'success', ?, ?, ?, ?, ?)`
    )
    .run(
      payload.appVersion,
      payload.startedAt,
      completedAt,
      payload.databasePath,
      payload.backupPath ?? "",
      payload.details ?? ""
    );
  upsertRuntimeMeta(database, "app_version", payload.appVersion, completedAt);
  upsertRuntimeMeta(database, "last_upgrade_at", completedAt, completedAt);
  if (payload.backupPath) {
    upsertRuntimeMeta(database, "last_backup_path", payload.backupPath, completedAt);
  }
}

function upsertRuntimeMeta(database, key, value, updatedAt) {
  database
    .prepare(
      `INSERT INTO kanban_runtime_meta (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, updatedAt);
}
