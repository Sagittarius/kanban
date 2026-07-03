import fs from "node:fs";
import path from "node:path";

const SQLITE_MIGRATIONS_TABLE = "kanban_migrations";
// Historical compatibility only: older SQLite builds reused the legacy
// "d1_migrations" table name. This project no longer supports D1.
const SQLITE_HISTORICAL_MIGRATIONS_TABLE = "d1_migrations";
const DEFAULT_TIMEZONE = "Asia/Shanghai";

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
    `CREATE TABLE IF NOT EXISTS ${SQLITE_MIGRATIONS_TABLE} (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`
  );
  migrateLegacyMigrationsTable(database);
}

export function listMigrationFiles(migrationsDir = resolveMigrationsDir()) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export function getAppliedMigrationNames(database) {
  ensureMigrationsTable(database);
  const rows = database.prepare(`SELECT name FROM ${SQLITE_MIGRATIONS_TABLE} ORDER BY name`).all();
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
        try {
          database.exec(trimmed);
        } catch (error) {
          if (isIgnorableSchemaConflict(trimmed, error)) {
            console.log(`[kanban-migrate] skipped already-applied statement in ${migration}: ${summarizeStatement(trimmed)}`);
            continue;
          }
          throw error;
        }
      }
    }
    database.prepare(`INSERT INTO ${SQLITE_MIGRATIONS_TABLE} (name) VALUES (?)`).run(migration);
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

export function resolveLogTimeZone() {
  return process.env.TZ?.trim() || process.env.KANBAN_DEFAULT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

export function formatLogTimestamp(value = new Date(), timeZone = resolveLogTimeZone()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const offset = String(parts.timeZoneName ?? "GMT+00:00").replace(/^GMT/, "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond ?? "000"}${offset}`;
}

export function filesystemSafeTimestamp(value = new Date(), timeZone = resolveLogTimeZone()) {
  return formatLogTimestamp(value, timeZone).replace(/:/g, "-");
}

function isIgnorableSchemaConflict(statement, error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = statement.toLowerCase();
  if (normalized.includes("alter table") && normalized.includes("add") && message.includes("duplicate column name")) {
    return true;
  }
  if (normalized.includes("create index") && message.includes("already exists")) {
    return true;
  }
  if (normalized.includes("create table") && message.includes("already exists")) {
    return true;
  }
  return false;
}

function summarizeStatement(statement) {
  return statement.replace(/\s+/g, " ").trim().slice(0, 120);
}

function migrateLegacyMigrationsTable(database) {
  const legacyExists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(SQLITE_HISTORICAL_MIGRATIONS_TABLE);

  if (!legacyExists) {
    return;
  }

  database.exec(
    `INSERT OR IGNORE INTO ${SQLITE_MIGRATIONS_TABLE} (name, applied_at)
     SELECT name, applied_at FROM ${SQLITE_HISTORICAL_MIGRATIONS_TABLE}`
  );
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
