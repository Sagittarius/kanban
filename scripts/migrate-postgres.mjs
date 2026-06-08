import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("POSTGRES_URL or DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const migrationsDir = path.join(process.cwd(), "migrations", "postgres");

await pool.query(
  "CREATE TABLE IF NOT EXISTS kanban_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL)"
);

const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()
  : [];

let applied = 0;
for (const migration of migrations) {
  const existing = await pool.query("SELECT name FROM kanban_migrations WHERE name = $1", [migration]);
  if (existing.rowCount) {
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
  for (const statement of sql.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  await pool.query("INSERT INTO kanban_migrations (name) VALUES ($1)", [migration]);
  applied += 1;
}

await pool.end();
console.log(applied > 0 ? `Applied ${applied} PostgreSQL migration(s).` : "No PostgreSQL migrations to apply.");
