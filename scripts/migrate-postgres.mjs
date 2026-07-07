import { inspectPostgresUpgradeState, runPostgresMigrations } from "./postgres-migration-lib.mjs";

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    const state = await inspectPostgresUpgradeState();
    if (state.pending.length === 0) {
      console.log(`[kanban-postgres-migrate] database is up to date. app=${state.appVersion} db_version=${state.lastVersion}`);
      return;
    }
    console.log(`[kanban-postgres-migrate] pending migrations for ${state.databasePath}:`);
    for (const name of state.pending) {
      console.log(`- ${name}`);
    }
    console.log(`[kanban-postgres-migrate] target app version: ${state.appVersion}`);
    process.exitCode = 2;
    return;
  }

  const result = await runPostgresMigrations();
  console.log(
    result.applied > 0
      ? `[kanban-postgres-migrate] applied ${result.applied} migration(s)`
      : "[kanban-postgres-migrate] no migrations to apply"
  );
}

main().catch((error) => {
  console.error("[kanban-postgres-migrate] migration failed");
  console.error(error);
  process.exitCode = 1;
});
