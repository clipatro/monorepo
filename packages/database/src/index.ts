/**
 * @automation/database — PostgreSQL connection, migration runner, and schema access.
 *
 * Uses node-postgres (`pg`) with a connection pool. Single database with
 * channel_id isolation. All services share the same database via DATABASE_URL.
 *
 * The `getDb()` function returns a `Database` wrapper that mimics the
 * bun:sqlite API but with **async** methods (`prepare().run/get/all`).
 */

export { getDb, closeDb, type DbConfig, type Database, type PreparedStatement, type RunResult } from "./connection.ts";
export { runMigrations, getAppliedMigrations } from "./migrator.ts";
export { seedAll, type SeedResult } from "./seed.ts";
export * from "./schema.ts";
