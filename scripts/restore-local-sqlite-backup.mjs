import fs from "node:fs";
import path from "node:path";
import { filesystemSafeTimestamp, resolveDatabasePath } from "./sqlite-migration-lib.mjs";

const backupPath = process.argv[2];

if (!backupPath) {
  console.error("Usage: node scripts/restore-local-sqlite-backup.mjs <backup-file>");
  process.exit(1);
}

const databasePath = resolveDatabasePath();
const restoreSource = path.resolve(backupPath);

if (!fs.existsSync(restoreSource)) {
  console.error(`[kanban-restore] backup file not found: ${restoreSource}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

if (fs.existsSync(databasePath)) {
  const rollbackDir = path.join(path.dirname(databasePath), "manual-rollback");
  fs.mkdirSync(rollbackDir, { recursive: true });
  const timestamp = filesystemSafeTimestamp();
  const snapshotPath = path.join(
    rollbackDir,
    `${path.basename(databasePath, path.extname(databasePath))}.before-restore.${timestamp}.sqlite`
  );
  fs.copyFileSync(databasePath, snapshotPath);
  console.log(`[kanban-restore] current database snapshot saved to: ${snapshotPath}`);
}

fs.copyFileSync(restoreSource, databasePath);
console.log(`[kanban-restore] restored ${restoreSource} -> ${databasePath}`);
