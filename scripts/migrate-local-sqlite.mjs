import { DatabaseSync } from "node:sqlite";
import {
  applyMigrations,
  ensureDatabaseDirectory,
  resolveDatabasePath,
  resolveMigrationsDir,
} from "./sqlite-migration-lib.mjs";

const databasePath = resolveDatabasePath();
const migrationsDir = resolveMigrationsDir();

ensureDatabaseDirectory(databasePath);

const database = new DatabaseSync(databasePath);
const { applied } = applyMigrations(database, migrationsDir);

database.close();
console.log(
  applied > 0
    ? `Applied ${applied} migration(s) to ${databasePath}`
    : `No migrations to apply for ${databasePath}`
);
