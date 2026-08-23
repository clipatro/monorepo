#!/usr/bin/env bun
/**
 * Migration CLI — run with `bun run migrate` or `bun run packages/database/src/migrate.ts`.
 *
 * Options:
 *   --status   Show applied migrations without running anything
 *   --db URL   Override the database URL
 */

import { runMigrations, getAppliedMigrations } from "./index.ts";

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const dbArg = args.find((a) => a.startsWith("--db="));
if (dbArg) {
  process.env.DATABASE_URL = dbArg.split("=")[1];
}

if (statusOnly) {
  const applied = await getAppliedMigrations();
  console.log(`Applied migrations: ${applied.length}`);
  for (const id of applied) {
    console.log(`  ✓ ${id}`);
  }
  process.exit(0);
}

console.log("Running database migrations...");
const result = await runMigrations();
console.log(`Done: ${result.applied} applied, ${result.skipped} already up to date.`);
process.exit(0);
