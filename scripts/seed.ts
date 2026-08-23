/**
 * Seed script — seeds all default channels and characters.
 *
 * Delegates to the shared seedAll() in @automation/database, which is also
 * used by the POST /api/seed endpoint in the api-gateway.
 *
 * Channels:
 *   1. "Emily's Mediterranean Life" — short stories with 3 characters (Emily, George, Noah)
 *   2. "Unsolved & Unexplained" — historical mysteries, no characters, image + narration only
 *
 * Usage:
 *   bun run seed           # seed (idempotent — skips if already exists)
 *   bun run seed --reset   # drop and re-seed
 *
 * Or via the API (when the Docker stack is running):
 *   curl -X POST http://localhost:3000/api/seed
 *   curl -X POST http://localhost:3000/api/seed -d '{"reset":true}' -H 'Content-Type: application/json'
 *
 * Prerequisites:
 *   - Database migrated (bun run migrate)
 *   - Character images in characters/{Name}/optimized-512/
 */
import { seedAll } from "@automation/database";

const reset = process.argv.includes("--reset");

seedAll(reset).catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
