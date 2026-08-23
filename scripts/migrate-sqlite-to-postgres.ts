#!/usr/bin/env bun
/**
 * Data migration script — copies all data from the old SQLite database
 * to the new PostgreSQL (Neon) database.
 *
 * Usage:
 *   bun run scripts/migrate-sqlite-to-postgres.ts
 *
 * Required env vars:
 *   DATABASE_URL          — PostgreSQL connection string (Neon)
 *   SQLITE_PATH           — Path to the old SQLite database (default: ./data/app.sqlite)
 *   SQLITE_COST_LEDGER_PATH — Path to the old cost ledger SQLite (default: ./data/cost-ledger.sqlite)
 *
 * This script:
 *   1. Runs PostgreSQL migrations (creates empty tables)
 *   2. Reads all rows from the SQLite database
 *   3. Inserts them into PostgreSQL in dependency order
 *   4. Copies the cost_entries table from the cost ledger SQLite
 *   5. Reports row counts per table
 *
 * The script is idempotent — it truncates all PostgreSQL tables before
 * inserting. Run it once during the migration window.
 *
 * IMPORTANT: Stop all services before running this script to avoid
 * concurrent writes during the migration.
 */

import { Database as SqliteDatabase } from "bun:sqlite";
import { getDb, closeDb, runMigrations } from "@automation/database";
import { existsSync } from "fs";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/app.sqlite";
const SQLITE_COST_LEDGER_PATH = process.env.SQLITE_COST_LEDGER_PATH ?? "./data/cost-ledger.sqlite";

// Tables in dependency order (parents before children)
const TABLES_IN_ORDER = [
  "channels",
  "channel_versions",
  "channel_provider_settings",
  "channel_style_profiles",
  "workflow_runs",
  "characters",
  "character_versions",
  "character_references",
  "story_candidates",
  "stories",
  "story_versions",
  "story_sources",
  "story_claims",
  "story_embeddings",
  "similarity_checks",
  "story_fts",
  "story_dna",
  "scenes",
  "narration_segments",
  "image_prompts",
  "assets",
  "voiceovers",
  "timings",
  "captions",
  "workflow_steps",
  "workflow_step_attempts",
  "workflow_events",
  "approvals",
  "provider_usage",
  "channel_characters",
  "scene_characters",
  "video_templates",
  "channel_templates",
];

// Tables to skip (FTS virtual tables in SQLite, generated columns in PG)
const SKIP_TABLES = new Set(["story_fts"]);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Set it in .env or environment.");
    process.exit(1);
  }

  if (!existsSync(SQLITE_PATH)) {
    console.error(`SQLite database not found: ${SQLITE_PATH}`);
    process.exit(1);
  }

  console.log("=== SQLite → PostgreSQL Data Migration ===\n");
  console.log(`SQLite:       ${SQLITE_PATH}`);
  console.log(`Cost ledger:  ${existsSync(SQLITE_COST_LEDGER_PATH) ? SQLITE_COST_LEDGER_PATH : "(not found)"}`);
  console.log(`PostgreSQL:   ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
  console.log();

  // === Step 1: Run PostgreSQL migrations ===
  console.log("Step 1: Running PostgreSQL migrations...");
  const pgDb = getDb();
  const migrationResult = await runMigrations();
  console.log(`  Migrations: ${migrationResult.applied} applied, ${migrationResult.skipped} up to date.\n`);

  // === Step 2: Open SQLite databases ===
  console.log("Step 2: Opening SQLite databases...");
  const sqliteDb = new SqliteDatabase(SQLITE_PATH, { readonly: true });
  console.log(`  Opened: ${SQLITE_PATH}`);

  let costLedgerDb: SqliteDatabase | null = null;
  if (existsSync(SQLITE_COST_LEDGER_PATH)) {
    costLedgerDb = new SqliteDatabase(SQLITE_COST_LEDGER_PATH, { readonly: true });
    console.log(`  Opened: ${SQLITE_COST_LEDGER_PATH}`);
  }
  console.log();

  // === Step 3: Get table list from SQLite ===
  const sqliteTables = sqliteDb
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations' AND name NOT LIKE 'fts_%'")
    .all() as Array<{ name: string }>;
  const sqliteTableNames = new Set(sqliteTables.map((t) => t.name));
  console.log(`SQLite tables found: ${sqliteTableNames.size}`);
  for (const t of sqliteTables) console.log(`  - ${t.name}`);
  console.log();

  // === Step 4: Truncate all PostgreSQL tables (in reverse dependency order) ===
  console.log("Step 3: Truncating PostgreSQL tables...");
  await pgDb.exec("SET session_replication_role = 'replica';"); // Disable FK checks
  for (const table of [...TABLES_IN_ORDER].reverse()) {
    if (SKIP_TABLES.has(table)) continue;
    if (!sqliteTableNames.has(table)) continue;
    await pgDb.exec(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
  await pgDb.exec("SET session_replication_role = 'origin';"); // Re-enable FK checks
  console.log("  All tables truncated.\n");

  // === Step 5: Copy data table by table ===
  console.log("Step 4: Copying data...\n");
  let totalRows = 0;

  for (const table of TABLES_IN_ORDER) {
    if (SKIP_TABLES.has(table)) {
      console.log(`  SKIP  ${table} (generated column in PG)`);
      continue;
    }
    if (!sqliteTableNames.has(table)) {
      console.log(`  SKIP  ${table} (not in SQLite)`);
      continue;
    }

    // Get column names from SQLite
    const columns = sqliteDb.query(`PRAGMA table_info("${table}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    if (columns.length === 0) {
      console.log(`  SKIP  ${table} (no columns)`);
      continue;
    }

    const columnNames = columns.map((c) => c.name);
    const quotedColumns = columnNames.map((c) => `"${c}"`).join(", ");
    const placeholders = columnNames.map(() => "?").join(", ");

    // Read all rows from SQLite
    const rows = sqliteDb.query(`SELECT ${quotedColumns} FROM "${table}"`).all() as Record<string, unknown>[];

    if (rows.length === 0) {
      console.log(`  EMPTY ${table}`);
      continue;
    }

    // Insert into PostgreSQL in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      // Build a multi-row INSERT
      const batchPlaceholders = batch
        .map((_, rowIdx) => {
          const offset = rowIdx * columnNames.length;
          return `(${columnNames.map((_, colIdx) => `$${offset + colIdx + 1}`).join(", ")})`;
        })
        .join(", ");

      const values: unknown[] = [];
      for (const row of batch) {
        for (const col of columnNames) {
          values.push(row[col] ?? null);
        }
      }

      await pgDb
        .prepare(`INSERT INTO "${table}" (${quotedColumns}) VALUES ${batchPlaceholders}`)
        .run(...values);
    }

    totalRows += rows.length;
    console.log(`  COPY  ${table.padEnd(30)} ${rows.length} rows`);
  }

  // === Step 6: Copy cost_entries from cost ledger SQLite ===
  if (costLedgerDb) {
    console.log("\nStep 5: Copying cost_entries from cost ledger...\n");

    // Check if cost_entries table exists in the cost ledger
    const costTables = costLedgerDb
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='cost_entries'")
      .all() as Array<{ name: string }>;

    if (costTables.length > 0) {
      // Ensure cost_entries table exists in PG (the cost-tracker creates it lazily)
      await pgDb.exec(`
        CREATE TABLE IF NOT EXISTS cost_entries (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
          run_id TEXT,
          step_id TEXT,
          capability TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          image_count INTEGER NOT NULL DEFAULT 0,
          image_resolution TEXT,
          grounding_queries INTEGER NOT NULL DEFAULT 0,
          input_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          output_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          image_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          grounding_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          is_free INTEGER NOT NULL DEFAULT 0,
          notes TEXT
        );
      `);

      // Truncate
      await pgDb.exec("TRUNCATE TABLE cost_entries;");

      // Get columns
      const costColumns = costLedgerDb.query("PRAGMA table_info(cost_entries)").all() as Array<{
        name: string;
      }>;
      const costColumnNames = costColumns.map((c) => c.name);
      const costQuotedColumns = costColumnNames.map((c) => `"${c}"`).join(", ");

      const costRows = costLedgerDb.query(`SELECT ${costQuotedColumns} FROM cost_entries`).all() as Record<string, unknown>[];

      if (costRows.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < costRows.length; i += BATCH_SIZE) {
          const batch = costRows.slice(i, i + BATCH_SIZE);
          const batchPlaceholders = batch
            .map((_, rowIdx) => {
              const offset = rowIdx * costColumnNames.length;
              return `(${costColumnNames.map((_, colIdx) => `$${offset + colIdx + 1}`).join(", ")})`;
            })
            .join(", ");

          const values: unknown[] = [];
          for (const row of batch) {
            for (const col of costColumnNames) {
              values.push(row[col] ?? null);
            }
          }

          await pgDb
            .prepare(`INSERT INTO cost_entries (${costQuotedColumns}) VALUES ${batchPlaceholders}`)
            .run(...values);
        }

        totalRows += costRows.length;
        console.log(`  COPY  cost_entries.padEnd(30) ${costRows.length} rows`);
      } else {
        console.log("  EMPTY cost_entries");
      }
    } else {
      console.log("  SKIP  cost_entries table not found in cost ledger");
    }
  }

  // === Step 7: Rebuild story_fts from story_versions ===
  console.log("\nStep 6: Rebuilding story_fts from story data...");
  // The story_fts table has a generated tsvector column. We need to insert
  // rows from the existing story data.
  await pgDb.exec(`
    INSERT INTO story_fts (story_id, title, premise, storyline)
    SELECT s.id, 
      COALESCE(sv.story_json::json->>'title', ''),
      COALESCE(sv.story_json::json->>'premise', ''),
      COALESCE(sv.story_json::json->>'storyline', '')
    FROM stories s
    JOIN story_versions sv ON sv.id = s.canonical_version_id
    WHERE s.canonical_version_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);
  const ftsCount = await pgDb.prepare("SELECT COUNT(*) as count FROM story_fts").get();
  console.log(`  story_fts rebuilt: ${(ftsCount as { count: number }).count} rows`);

  // === Summary ===
  console.log(`\n=== Migration Complete ===`);
  console.log(`Total rows copied: ${totalRows}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify data: bun run scripts/verify-migration.ts (if available)`);
  console.log(`  2. Start services: docker compose up`);
  console.log(`  3. Keep the SQLite file as backup until you've verified everything works`);

  // === Cleanup ===
  sqliteDb.close();
  if (costLedgerDb) costLedgerDb.close();
  await closeDb();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
