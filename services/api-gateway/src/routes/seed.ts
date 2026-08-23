import type { Hono, AppConfig } from "@automation/server";
import { seedAll } from "@automation/database";

/**
 * POST /api/seed — seed all default channels and characters.
 *
 * Body (optional):
 *   { "reset": false }  — if true, drops and re-creates existing seed channels
 *
 * Idempotent by default — skips channels that already exist.
 */
export function registerSeedRoutes(app: Hono, _config: AppConfig): void {
  app.post("/api/seed", async (c) => {
    let reset = false;
    try {
      const body = await c.req.json();
      reset = Boolean(body?.reset);
    } catch {
      // No body or invalid JSON — default to non-reset
    }

    try {
      const result = await seedAll(reset);
      return c.json({
        ok: true,
        channels: result.channels,
        message: `Seeded ${result.channels.filter((ch) => ch.created).length} channel(s), skipped ${result.channels.filter((ch) => !ch.created).length}`,
      });
    } catch (err) {
      console.error("[seed] Failed:", err);
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "Seed failed" },
        500,
      );
    }
  });
}
