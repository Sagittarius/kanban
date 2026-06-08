import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath =
  process.env.KANBAN_SQLITE_PATH ??
  path.join(process.cwd(), ".data", "kanban.sqlite");
const migrationsDir = path.join(process.cwd(), "drizzle");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(
  "CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"
);

const migrations = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

let applied = 0;
for (const migration of migrations) {
  const existing = database
    .prepare("SELECT name FROM d1_migrations WHERE name = ?")
    .get(migration);
  if (existing) {
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    try {
      database.exec(trimmed);
    } catch (err) {
      // Skip statements that fail due to existing columns/tables (idempotent migration)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        console.warn(`  Skipping (already exists): ${trimmed.substring(0, 60)}...`);
        continue;
      }
      throw err;
    }
  }
  database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migration);
  applied += 1;
}

database.close();
console.log(
  applied > 0
    ? `Applied ${applied} migration(s) to ${databasePath}`
    : `No migrations to apply for ${databasePath}`
);
