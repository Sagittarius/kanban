import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const migrationsDir = path.join(process.cwd(), "migrations", "postgres");
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("POSTGRES_URL or DATABASE_URL is required when KANBAN_DB_DRIVER=postgres.");
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  console.log(`[kanban-postgres-migrate] migrations directory not found: ${migrationsDir}`);
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.POSTGRES_CA
    ? { ca: fs.readFileSync(process.env.POSTGRES_CA, "utf8") }
    : process.env.POSTGRES_SSL === "true"
      ? { rejectUnauthorized: true }
      : undefined,
});

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

async function main() {
  const client = await pool.connect();
  let applied = 0;

  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS kanban_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL)"
    );

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const migration of migrationFiles) {
      const existing = await client.query("SELECT name FROM kanban_migrations WHERE name = $1", [migration]);
      if (existing.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
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
      await client.query("INSERT INTO kanban_migrations (name) VALUES ($1)", [migration]);
      applied += 1;
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    applied > 0
      ? `[kanban-postgres-migrate] applied ${applied} migration(s)`
      : "[kanban-postgres-migrate] no migrations to apply"
  );
}

main().catch((error) => {
  console.error("[kanban-postgres-migrate] migration failed");
  console.error(error);
  process.exitCode = 1;
});
