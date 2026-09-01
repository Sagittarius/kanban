import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { formatLogTimestamp, readAppVersion } from "./sqlite-migration-lib.mjs";

const POSTGRES_MIGRATIONS_TABLE = "kanban_migrations";

export function resolvePostgresMigrationsDir() {
  return path.join(process.cwd(), "migrations", "postgres");
}

export function resolvePostgresUrl() {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
}

export function describePostgresDatabase(connectionString = resolvePostgresUrl()) {
  if (!connectionString) {
    return "postgres://<not-configured>";
  }

  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "postgres://<configured>";
  }
}

export function listPostgresMigrationFiles(migrationsDir = resolvePostgresMigrationsDir()) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function inspectPostgresUpgradeState() {
  const connectionString = resolvePostgresUrl();
  if (!connectionString) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required when KANBAN_DB_DRIVER=postgres.");
  }

  const pool = createPostgresPool(connectionString);
  const client = await pool.connect();

  try {
    await ensurePostgresMigrationsTable(client);
    const migrationFiles = listPostgresMigrationFiles();
    const applied = await getAppliedPostgresMigrationNames(client);
    const pending = migrationFiles.filter((name) => !applied.has(name));
    const lastVersion = await readPostgresLastVersion(client);

    return {
      appVersion: readAppVersion(),
      databasePath: describePostgresDatabase(connectionString),
      exists: true,
      pending,
      lastVersion,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function runPostgresMigrations() {
  const connectionString = resolvePostgresUrl();
  if (!connectionString) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required when KANBAN_DB_DRIVER=postgres.");
  }

  const pool = createPostgresPool(connectionString);
  const client = await pool.connect();
  let applied = 0;
  const startedAt = formatLogTimestamp();

  try {
    await ensurePostgresMigrationsTable(client);

    for (const migration of listPostgresMigrationFiles()) {
      const existing = await client.query(`SELECT name FROM ${POSTGRES_MIGRATIONS_TABLE} WHERE name = $1`, [migration]);
      if (existing.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(resolvePostgresMigrationsDir(), migration), "utf8");
      for (const statement of splitSqlStatements(sql)) {
        try {
          await client.query(statement);
        } catch (error) {
          if (isIgnorableSchemaConflict(error)) {
            console.log(`[kanban-postgres-migrate] skipped already-applied statement in ${migration}`);
            continue;
          }
          throw error;
        }
      }
      await client.query(`INSERT INTO ${POSTGRES_MIGRATIONS_TABLE} (name) VALUES ($1)`, [migration]);
      applied += 1;
    }

    await recordPostgresUpgradeSuccess(client, {
      appVersion: readAppVersion(),
      startedAt,
      completedAt: formatLogTimestamp(),
      databasePath: describePostgresDatabase(connectionString),
      details: `applied=${applied}`,
    });

    return {
      databasePath: describePostgresDatabase(connectionString),
      appVersion: readAppVersion(),
      backupPath: "",
      applied,
      pending: [],
    };
  } finally {
    client.release();
    await pool.end();
  }
}

function createPostgresPool(connectionString) {
  return new Pool({
    connectionString,
    ssl: process.env.POSTGRES_CA
      ? { ca: fs.readFileSync(process.env.POSTGRES_CA, "utf8") }
      : process.env.POSTGRES_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });
}

async function ensurePostgresMigrationsTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${POSTGRES_MIGRATIONS_TABLE} (name TEXT PRIMARY KEY NOT NULL, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL)`
  );
}

async function getAppliedPostgresMigrationNames(client) {
  const result = await client.query(`SELECT name FROM ${POSTGRES_MIGRATIONS_TABLE} ORDER BY name`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function readPostgresLastVersion(client) {
  const metaExists = await client.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'kanban_runtime_meta') AS exists"
  );
  if (metaExists.rows[0]?.exists === true) {
    const row = await client.query("SELECT value FROM kanban_runtime_meta WHERE key = $1 LIMIT 1", ["app_version"]);
    if (row.rows[0]?.value) {
      return String(row.rows[0].value);
    }
  }

  const lastMigration = await client.query(`SELECT name FROM ${POSTGRES_MIGRATIONS_TABLE} ORDER BY applied_at DESC, name DESC LIMIT 1`);
  return lastMigration.rows[0]?.name ? String(lastMigration.rows[0].name) : "unknown";
}

async function recordPostgresUpgradeSuccess(client, payload) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS kanban_upgrade_history (
      id BIGSERIAL PRIMARY KEY,
      app_version TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      database_path TEXT NOT NULL,
      backup_path TEXT,
      details TEXT DEFAULT ''
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS kanban_runtime_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await client.query(
    `INSERT INTO kanban_upgrade_history (
      app_version, status, started_at, completed_at, database_path, backup_path, details
    ) VALUES ($1, 'success', $2, $3, $4, $5, $6)`,
    [payload.appVersion, payload.startedAt, payload.completedAt, payload.databasePath, "", payload.details ?? ""]
  );
  await upsertPostgresRuntimeMeta(client, "app_version", payload.appVersion, payload.completedAt);
  await upsertPostgresRuntimeMeta(client, "last_upgrade_at", payload.completedAt, payload.completedAt);
}

async function upsertPostgresRuntimeMeta(client, key, value, updatedAt) {
  await client.query(
    `INSERT INTO kanban_runtime_meta (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, updatedAt]
  );
}

function splitSqlStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isIgnorableSchemaConflict(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("already exists") || message.includes("duplicate column");
}
