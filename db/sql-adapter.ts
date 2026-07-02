export type StorageMode = "sqlite" | "postgres";
export type SqlValue = string | number | boolean | null | undefined;

export type QueryResult = {
  changes?: number;
  lastInsertRowid?: number;
};

export type DatabaseAdapter = {
  mode: StorageMode;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: SqlValue[]
  ): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<QueryResult>;
};

type LocalSQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Record<string, unknown>[];
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
    run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  };
};

type PgPool = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

type MigrationTableConfig = {
  primary: string;
  legacy?: string;
};

let cachedAdapter: DatabaseAdapter | null = null;
let cachedLocalDatabase: LocalSQLiteDatabase | null = null;
let cachedPgPool: PgPool | null = null;

export async function getDbAdapter(): Promise<DatabaseAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const requested = normalizeStorageMode(process.env.KANBAN_DB_DRIVER ?? process.env.DB_DRIVER) ?? "sqlite";

  if (requested === "postgres") {
    cachedAdapter = await createPostgresAdapter();
    return cachedAdapter;
  }

  cachedAdapter = await createSQLiteAdapter();
  return cachedAdapter;
}

export function getStorageMode(): StorageMode {
  return cachedAdapter?.mode ?? normalizeStorageMode(process.env.KANBAN_DB_DRIVER ?? process.env.DB_DRIVER) ?? "sqlite";
}

function normalizeStorageMode(value: string | undefined | null): StorageMode | null {
  if (value === "sqlite" || value === "postgres") {
    return value;
  }
  return null;
}

async function createSQLiteAdapter(): Promise<DatabaseAdapter> {
  const [{ DatabaseSync }, fs, path] = await Promise.all([
    import("node:sqlite"),
    import("node:fs"),
    import("node:path"),
  ]);
  const databasePath = process.env.KANBAN_SQLITE_PATH ?? path.join(process.cwd(), ".data", "kanban.sqlite");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  cachedLocalDatabase = new DatabaseSync(databasePath) as LocalSQLiteDatabase;
  const adapter = createSQLiteAdapterFromDatabase(cachedLocalDatabase);
  await applyFileMigrations(adapter, ["drizzle"], {
    primary: "kanban_migrations",
    legacy: "d1_migrations",
  });
  return adapter;
}

function createSQLiteAdapterFromDatabase(database: LocalSQLiteDatabase): DatabaseAdapter {
  return {
    mode: "sqlite",
    async query<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      return database.prepare(sql).all(...normalizeParams(params)) as T[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      const result = database.prepare(sql).run(...normalizeParams(params));
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
  };
}

async function createPostgresAdapter(): Promise<DatabaseAdapter> {
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required when KANBAN_DB_DRIVER=postgres.");
  }

  if (!cachedPgPool) {
    const { Pool } = await import("pg");
    const sslConfig = process.env.POSTGRES_CA
      ? { ca: await loadFile(process.env.POSTGRES_CA) }
      : process.env.POSTGRES_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined;
    cachedPgPool = new Pool({
      connectionString,
      ssl: sslConfig,
    }) as PgPool;
  }

  const adapter: DatabaseAdapter = {
    mode: "postgres",
    async query<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const result = await cachedPgPool!.query(toPostgresSql(sql), normalizeParams(params));
      return result.rows as T[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      const result = await cachedPgPool!.query(toPostgresSql(sql), normalizeParams(params));
      return { changes: result.rowCount ?? undefined };
    },
  };

  await applyFileMigrations(adapter, ["migrations", "postgres"], {
    primary: "kanban_migrations",
  });
  return adapter;
}

async function loadFile(filePath: string): Promise<string> {
  const fs = await import("node:fs");
  return fs.readFileSync(filePath, "utf8");
}

async function applyFileMigrations(
  adapter: DatabaseAdapter,
  migrationsPath: string[],
  tableConfig: MigrationTableConfig
) {
  const [fs, path] = await Promise.all([import("node:fs"), import("node:path")]);
  const migrationsDir = path.join(process.cwd(), ...migrationsPath);
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const timestampType = adapter.mode === "postgres" ? "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP" : "TEXT DEFAULT CURRENT_TIMESTAMP";
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS ${tableConfig.primary} (name TEXT PRIMARY KEY NOT NULL, applied_at ${timestampType} NOT NULL)`
  );

  if (tableConfig.legacy && tableConfig.legacy !== tableConfig.primary) {
    const legacyExists = await tableExists(adapter, tableConfig.legacy);
    if (legacyExists) {
      await copyLegacyMigrations(adapter, tableConfig.primary, tableConfig.legacy);
    }
  }

  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const existing = await adapter.query<{ name: string }>(
      `SELECT name FROM ${tableConfig.primary} WHERE name = ?`,
      [migration]
    );
    if (existing.length > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
    for (const statement of splitSqlStatements(sql)) {
      try {
        await adapter.execute(statement);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate column")) {
          continue;
        }
        throw err;
      }
    }
    await adapter.execute(`INSERT INTO ${tableConfig.primary} (name) VALUES (?)`, [migration]);
  }
}

async function tableExists(adapter: DatabaseAdapter, tableName: string) {
  if (adapter.mode === "postgres") {
    const rows = await adapter.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?) AS exists",
      [tableName]
    );
    return rows[0]?.exists === true;
  }

  const rows = await adapter.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return rows.length > 0;
}

async function copyLegacyMigrations(adapter: DatabaseAdapter, targetTable: string, legacyTable: string) {
  const legacyRows = await adapter.query<{ name: string; applied_at?: string }>(
    `SELECT name, applied_at FROM ${legacyTable}`
  );

  for (const row of legacyRows) {
    await adapter.execute(
      `INSERT INTO ${targetTable} (name, applied_at) VALUES (?, ?)`,
      [row.name, row.applied_at ?? null]
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE") || message.includes("duplicate key")) {
        return { changes: 0 };
      }
      throw error;
    });
  }
}

function splitSqlStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeParams(params: SqlValue[]) {
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

function toPostgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}
