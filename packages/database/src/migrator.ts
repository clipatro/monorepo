/**
 * Migration runner — typed, versioned PostgreSQL migrations.
 *
 * Migrations are numbered SQL files in ./migrations/.
 * The runner tracks applied migrations in a `_migrations` table.
 * Each migration runs in a transaction. If a migration fails, the transaction
 * rolls back and the runner throws.
 */

import { getDb, type Database } from "./connection.ts";
import { getMigrations, type Migration } from "./migrations/index.ts";

/** Ensure the _migrations tracking table exists. */
async function ensureMigrationsTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Get the list of already-applied migration ids. */
export async function getAppliedMigrations(): Promise<number[]> {
  const db = getDb();
  await ensureMigrationsTable(db);
  const rows = await db.prepare("SELECT id FROM _migrations ORDER BY id ASC").all();
  return rows.map((r) => r.id as number);
}

/** Run all pending migrations in order. */
export async function runMigrations(): Promise<{ applied: number; skipped: number }> {
  const db = getDb();
  await ensureMigrationsTable(db);

  const applied = await getAppliedMigrations();
  const migrations = getMigrations();
  let appliedCount = 0;
  let skippedCount = 0;

  for (const migration of migrations) {
    if (applied.includes(migration.id)) {
      skippedCount++;
      continue;
    }

    try {
      await db.transaction(async () => {
        // Split on semicolons that end statements (pg's query can run
        // multi-statement SQL, but splitting gives better error messages).
        await db.exec(migration.sql);
        await db.prepare("INSERT INTO _migrations (id, name) VALUES ($1, $2)").run(migration.id, migration.name);
      });
      appliedCount++;
      console.log(`  ✓ Migration ${migration.id}: ${migration.name}`);
    } catch (err) {
      console.error(`  ✗ Migration ${migration.id}: ${migration.name} FAILED`);
      console.error(`    ${err}`);
      throw err;
    }
  }

  if (appliedCount === 0 && skippedCount > 0) {
    console.log(`  All ${skippedCount} migrations already applied.`);
  }

  return { applied: appliedCount, skipped: skippedCount };
}
