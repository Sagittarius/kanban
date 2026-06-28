import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { resolveDatabasePath } from "./sqlite-migration-lib.mjs";

const { Pool } = pg;

const TABLES = [
  {
    name: "users",
    keyColumns: ["id"],
    columns: [
      "id",
      "username",
      "password_hash",
      "role",
      "display_name",
      "phone",
      "avatar_key",
      "job_title",
      "tech_stacks",
      "timezone",
      "is_active",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "boards",
    keyColumns: ["id"],
    columns: ["id", "name", "description", "owner_user_id", "created_at", "updated_at"],
  },
  {
    name: "board_members",
    keyColumns: ["board_id", "user_id"],
    columns: ["board_id", "user_id", "role", "created_at"],
  },
  {
    name: "teams",
    keyColumns: ["id"],
    columns: ["id", "name", "description", "owner_user_id", "color", "created_at", "updated_at"],
  },
  {
    name: "team_members",
    keyColumns: ["team_id", "user_id"],
    columns: ["team_id", "user_id", "created_at"],
  },
  {
    name: "board_teams",
    keyColumns: ["board_id", "team_id"],
    columns: ["board_id", "team_id", "created_at"],
  },
  {
    name: "projects",
    keyColumns: ["id"],
    columns: [
      "id",
      "board_id",
      "team_id",
      "name",
      "description",
      "owner",
      "color",
      "health",
      "status",
      "summary",
      "archived_at",
      "order_index",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "tasks",
    keyColumns: ["id"],
    columns: [
      "id",
      "project_id",
      "title",
      "description",
      "status",
      "priority",
      "owner_user_id",
      "owner",
      "tester_user_id",
      "tester",
      "workload_days",
      "start_date",
      "test_due_date",
      "design_due_date",
      "due_date",
      "estimate",
      "progress",
      "blockers",
      "blocked_reason",
      "tags",
      "order_index",
      "deleted_at",
      "completed_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "subtasks",
    keyColumns: ["id"],
    columns: ["id", "task_id", "title", "done", "order_index", "created_at", "updated_at"],
  },
  {
    name: "task_activity",
    keyColumns: ["id"],
    columns: [
      "id",
      "board_id",
      "entity_type",
      "entity_id",
      "project_id",
      "task_id",
      "action",
      "message",
      "meta",
      "created_at",
    ],
  },
  {
    name: "audit_logs",
    keyColumns: ["id"],
    columns: [
      "id",
      "actor_user_id",
      "actor_username",
      "actor_role",
      "action",
      "resource_type",
      "resource_id",
      "board_id",
      "result",
      "message",
      "ip_address",
      "user_agent",
      "request_id",
      "metadata",
      "created_at",
    ],
  },
  {
    name: "system_parameters",
    keyColumns: ["key"],
    columns: [
      "key",
      "value",
      "label",
      "value_type",
      "parameter_group",
      "unit",
      "min_value",
      "max_value",
      "order_index",
      "updated_at",
    ],
  },
];

const INSERT_BATCH_SIZE = 200;

export async function inspectSqliteToPostgresMigration(options = {}) {
  const sourcePath = options.sourcePath ?? resolveDatabasePath();
  const postgresUrl = resolvePostgresUrl();
  const source = openSourceDatabase(sourcePath);
  const pool = new Pool({ connectionString: postgresUrl, ssl: resolveSslConfig() });

  try {
    const sourceCounts = Object.fromEntries(
      TABLES.map((table) => [table.name, countSqliteRows(source, table.name)])
    );

    await applyPostgresMigrations(pool);

    const targetCounts = await countPostgresRows(pool);
    const nonEmptyTables = Object.entries(targetCounts)
      .filter(([, count]) => count > 0)
      .map(([name]) => name);

    return {
      sourcePath,
      postgresUrlRedacted: redactPostgresUrl(postgresUrl),
      sourceCounts,
      targetCounts,
      targetEmpty: nonEmptyTables.length === 0,
      nonEmptyTables,
    };
  } finally {
    source.close();
    await pool.end();
  }
}

export async function migrateSqliteToPostgres(options = {}) {
  const sourcePath = options.sourcePath ?? resolveDatabasePath();
  const forceClear = options.forceClear === true;
  const postgresUrl = resolvePostgresUrl();
  const source = openSourceDatabase(sourcePath);
  const pool = new Pool({ connectionString: postgresUrl, ssl: resolveSslConfig() });

  try {
    await applyPostgresMigrations(pool);

    const targetCounts = await countPostgresRows(pool);
    const nonEmptyTables = Object.entries(targetCounts)
      .filter(([, count]) => count > 0)
      .map(([name]) => name);

    if (nonEmptyTables.length > 0 && !forceClear) {
      throw new Error(
        `Target PostgreSQL is not empty. Non-empty tables: ${nonEmptyTables.join(", ")}. Re-run with --force-clear to truncate target tables before import.`
      );
    }

    const importedCounts = {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (forceClear && nonEmptyTables.length > 0) {
        await truncateTargetTables(client);
      }

      for (const table of TABLES) {
        const rows = readSqliteRows(source, table);
        importedCounts[table.name] = rows.length;
        if (rows.length === 0) {
          continue;
        }
        for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
          await insertBatch(client, table, rows.slice(start, start + INSERT_BATCH_SIZE));
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    console.log(`[kanban-pg-migrate] migrated SQLite -> PostgreSQL`);
    console.log(`[kanban-pg-migrate] source: ${sourcePath}`);
    console.log(`[kanban-pg-migrate] target: ${redactPostgresUrl(postgresUrl)}`);
    for (const table of TABLES) {
      console.log(`- ${table.name}: ${importedCounts[table.name] ?? 0}`);
    }

    const verification = await verifyMigration(source, pool);
    if (!verification.ok) {
      console.error("[kanban-pg-migrate] verification failed:");
      for (const difference of verification.differences) {
        console.error(`- ${difference}`);
      }
      throw new Error("SQLite -> PostgreSQL verification failed");
    }
    console.log("[kanban-pg-migrate] verification passed");

    return {
      sourcePath,
      postgresUrlRedacted: redactPostgresUrl(postgresUrl),
      importedCounts,
      verification,
    };
  } finally {
    source.close();
    await pool.end();
  }
}

function resolvePostgresUrl() {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required.");
  }
  return url;
}

function resolveSslConfig() {
  if (process.env.POSTGRES_CA) {
    return { ca: fs.readFileSync(process.env.POSTGRES_CA, "utf8") };
  }
  if (process.env.POSTGRES_SSL === "true") {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

function openSourceDatabase(sourcePath) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`SQLite source database not found: ${resolved}`);
  }
  return new DatabaseSync(resolved);
}

function countSqliteRows(database, tableName) {
  if (!sqliteTableExists(database, tableName)) {
    return 0;
  }
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count ?? 0);
}

function readSqliteRows(database, table) {
  if (!sqliteTableExists(database, table.name)) {
    return [];
  }
  const availableColumns = sqliteColumns(database, table.name);
  const selectedColumns = table.columns.filter((column) => availableColumns.has(column));
  if (selectedColumns.length === 0) {
    return [];
  }
  return database
    .prepare(`SELECT ${selectedColumns.join(", ")} FROM ${table.name}`)
    .all()
    .map((row) =>
      Object.fromEntries(
        table.columns.map((column) => [
          column,
          availableColumns.has(column) ? row[column] : defaultSqliteValue(table.name, column),
        ])
      )
    );
}

async function insertBatch(client, table, rows) {
  const columns = table.columns.join(", ");
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const start = rowIndex * table.columns.length;
    table.columns.forEach((column) => {
      values.push(normalizeValue(row[column]));
    });
    const rowPlaceholders = table.columns.map((_, columnIndex) => `$${start + columnIndex + 1}`);
    return `(${rowPlaceholders.join(", ")})`;
  });

  await client.query(
    `INSERT INTO ${table.name} (${columns}) VALUES ${placeholders.join(", ")}`,
    values
  );
}

async function countPostgresRows(pool) {
  const entries = await Promise.all(
    TABLES.map(async (table) => {
      return [table.name, await countPostgresTable(pool, table.name)];
    })
  );
  return Object.fromEntries(entries);
}

async function countPostgresTable(pool, tableName) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function truncateTargetTables(client) {
  const ordered = [...TABLES].reverse().map((table) => table.name);
  await client.query(`TRUNCATE TABLE ${ordered.join(", ")} RESTART IDENTITY`);
}

async function verifyMigration(source, pool) {
  const differences = [];

  for (const table of TABLES) {
    const sourceCount = countSqliteRows(source, table.name);
    const targetCount = await countPostgresTable(pool, table.name);

    if (sourceCount !== targetCount) {
      differences.push(
        `${table.name}: row count mismatch, source=${sourceCount}, target=${targetCount}`
      );
    }

    const sourceKeys = readSqliteKeySet(source, table);
    const targetKeys = await readPostgresKeySet(pool, table);

    const missingInTarget = [...sourceKeys].filter((key) => !targetKeys.has(key));
    const extraInTarget = [...targetKeys].filter((key) => !sourceKeys.has(key));

    if (missingInTarget.length > 0) {
      differences.push(
        `${table.name}: missing ${missingInTarget.length} row(s) in target, sample=${missingInTarget.slice(0, 5).join(" | ")}`
      );
    }

    if (extraInTarget.length > 0) {
      differences.push(
        `${table.name}: extra ${extraInTarget.length} row(s) in target, sample=${extraInTarget.slice(0, 5).join(" | ")}`
      );
    }
  }

  return {
    ok: differences.length === 0,
    differences,
  };
}

function readSqliteKeySet(database, table) {
  if (!sqliteTableExists(database, table.name)) {
    return new Set();
  }
  const availableColumns = sqliteColumns(database, table.name);
  if (table.keyColumns.some((column) => !availableColumns.has(column))) {
    return new Set();
  }
  const rows = database
    .prepare(`SELECT ${table.keyColumns.join(", ")} FROM ${table.name}`)
    .all();
  return new Set(rows.map((row) => keyOf(row, table.keyColumns)));
}

function sqliteTableExists(database, tableName) {
  return Boolean(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
      .get(tableName)
  );
}

function sqliteColumns(database, tableName) {
  return new Set(database.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => String(row.name)));
}

function defaultSqliteValue(tableName, column) {
  if (tableName === "projects" && column === "team_id") {
    return "";
  }
  if (tableName === "tasks" && (column === "owner_user_id" || column === "tester_user_id")) {
    return "";
  }
  if (tableName === "users" && column === "tech_stacks") {
    return "[]";
  }
  if (tableName === "users" && column === "job_title") {
    return "";
  }
  if (tableName === "users" && column === "phone") {
    return "";
  }
  if (tableName === "tasks" && column === "workload_days") {
    return null;
  }
  return null;
}

async function readPostgresKeySet(pool, table) {
  const result = await pool.query(`SELECT ${table.keyColumns.join(", ")} FROM ${table.name}`);
  return new Set(result.rows.map((row) => keyOf(row, table.keyColumns)));
}

function keyOf(row, columns) {
  return columns
    .map((column) => {
      const value = row[column];
      return value === null || value === undefined ? "NULL" : String(value);
    })
    .join("::");
}

async function applyPostgresMigrations(pool) {
  const migrationsDir = path.join(process.cwd(), "migrations", "postgres");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`PostgreSQL migrations directory not found: ${migrationsDir}`);
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [72426101]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS kanban_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of migrationFiles) {
      const existing = await client.query("SELECT name FROM kanban_migrations WHERE name = $1 LIMIT 1", [file]);
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement);
        }
        await client.query("INSERT INTO kanban_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [72426101]);
    } catch {
      // ignore unlock failures during connection teardown
    }
    client.release();
  }
}

function splitSqlStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeValue(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value === undefined) {
    return null;
  }
  return value;
}

function redactPostgresUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  }
}

function parseArgs(argv) {
  const options = {
    check: false,
    forceClear: false,
    sourcePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--force-clear") {
      options.forceClear = true;
      continue;
    }
    if (arg === "--source") {
      options.sourcePath = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    const result = await inspectSqliteToPostgresMigration(options);
    console.log(`[kanban-pg-migrate] source: ${result.sourcePath}`);
    console.log(`[kanban-pg-migrate] target: ${result.postgresUrlRedacted}`);
    console.log(`[kanban-pg-migrate] target empty: ${result.targetEmpty ? "yes" : "no"}`);
    for (const table of TABLES) {
      console.log(
        `- ${table.name}: source=${result.sourceCounts[table.name] ?? 0}, target=${result.targetCounts[table.name] ?? 0}`
      );
    }
    if (!result.targetEmpty) {
      process.exitCode = 2;
    }
    return;
  }

  await migrateSqliteToPostgres(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
