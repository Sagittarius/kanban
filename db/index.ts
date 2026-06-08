import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

type LocalSQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Record<string, unknown>[];
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
    run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  };
};

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let cachedLocalClient: AnyD1Database | null = null;
let storageMode: "d1" | "sqlite" = "d1";

export async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  // Prefer local SQLite when running in Node.js (dev or on-prem)
  const sqliteClient = await tryGetLocalSQLiteD1Client();
  if (sqliteClient) {
    storageMode = "sqlite";
    cachedDb = drizzle(sqliteClient, { schema });
    return cachedDb;
  }

  // Fall back to Cloudflare D1 (Workers / vinext Miniflare)
  const cloudflareDb = await getCloudflareD1Binding();
  if (cloudflareDb) {
    storageMode = "d1";
    cachedDb = drizzle(cloudflareDb, { schema });
    return cachedDb;
  }

  throw new Error("No database available. Set KANBAN_SQLITE_PATH or configure D1.");
}

async function tryGetLocalSQLiteD1Client(): Promise<AnyD1Database | null> {
  try {
    return await getLocalSQLiteD1Client();
  } catch {
    return null;
  }
}

export function getStorageMode() {
  return storageMode;
}

async function getCloudflareD1Binding(): Promise<AnyD1Database | null> {
  try {
    if (process.env.KANBAN_SQLITE_PATH) {
      return null;
    }
  } catch {
    // process.env not available in this runtime
  }
  try {
    const { env } = (await import("cloudflare:workers")) as {
      env?: { DB?: unknown };
    };
    return env?.DB ? (env.DB as AnyD1Database) : null;
  } catch {
    return null;
  }
}

async function getLocalSQLiteD1Client(): Promise<AnyD1Database> {
  if (cachedLocalClient) {
    return cachedLocalClient;
  }

  const [{ DatabaseSync }, fs, path] = await Promise.all([
    import("node:sqlite"),
    import("node:fs"),
    import("node:path"),
  ]);
  const databasePath =
    process.env.KANBAN_SQLITE_PATH ??
    path.join(process.cwd(), ".data", "kanban.sqlite");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath) as LocalSQLiteDatabase;
  applyLocalMigrations(database, fs, path);

  cachedLocalClient = createD1CompatClient(database);
  return cachedLocalClient;
}

function applyLocalMigrations(
  database: LocalSQLiteDatabase,
  fs: typeof import("node:fs"),
  path: typeof import("node:path")
) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"
  );

  const migrationsDir = path.join(process.cwd(), "drizzle");
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

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
      if (trimmed) {
        database.exec(trimmed);
      }
    }
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migration);
  }
}

function createD1CompatClient(database: LocalSQLiteDatabase): AnyD1Database {
  return {
    prepare(sql: string) {
      return createPreparedStatement(database, sql, []);
    },
    async batch(statements: ReturnType<typeof createPreparedStatement>[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.all());
      }
      return results;
    },
  } as unknown as AnyD1Database;
}

function createPreparedStatement(
  database: LocalSQLiteDatabase,
  sql: string,
  params: unknown[]
) {
  return {
    bind(...nextParams: unknown[]) {
      return createPreparedStatement(database, sql, nextParams);
    },
    async all() {
      const rows = database.prepare(sql).all(...normalizeParams(params));
      return { results: rows, success: true, meta: {} };
    },
    async raw() {
      const rows = database.prepare(sql).all(...normalizeParams(params));
      return rows.map((row) => Object.values(row));
    },
    async first(column?: string) {
      const row = database.prepare(sql).get(...normalizeParams(params));
      if (!row) {
        return null;
      }
      return column ? row[column] : row;
    },
    async run() {
      const result = database.prepare(sql).run(...normalizeParams(params));
      return {
        results: [],
        success: true,
        meta: {
          changes: result.changes,
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    },
  };
}

function normalizeParams(params: unknown[]) {
  return params.map((value) => {
    if (value === undefined) {
      return null;
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value;
  });
}
