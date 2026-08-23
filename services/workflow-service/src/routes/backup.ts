import type { Hono, AppConfig } from "@automation/server";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// === Backup and restore ===
// With PostgreSQL (Neon), database backup/restore is handled via pg_dump/pg_restore
// or Neon's branching feature. These routes now only back up the artifact store.
// Database backups should be configured at the Neon dashboard level.

export function registerBackupRoutes(app: Hono, config: AppConfig): void {
  // POST /backup — create a backup of the artifact store
  // Note: Database backups are managed by Neon (point-in-time recovery, branching).
  app.post("/backup", async (c) => {
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { join } = await import("node:path");
      const { existsSync, mkdirSync } = await import("node:fs");
      const execAsync = promisify(exec);

      const backupDir = join(config.artifactStorePath, "..", "backups");
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const artifactsBackupPath = join(backupDir, `artifacts-${timestamp}.tar.gz`);

      // Backup the artifact store (tar.gz)
      if (existsSync(config.artifactStorePath)) {
        await execAsync(`tar czf "${artifactsBackupPath}" -C "${config.artifactStorePath}" .`, {
          maxBuffer: 500 * 1024 * 1024,
        });
      }

      return c.json({
        success: true,
        timestamp,
        files: {
          database: null, // Database backups managed by Neon
          ledger: null,   // Cost ledger now in PostgreSQL
          artifacts: existsSync(config.artifactStorePath) ? artifactsBackupPath : null,
        },
        note: "Database backups are managed by Neon (point-in-time recovery, branching). Use the Neon dashboard for database backup/restore.",
      }, 201);
    } catch (err) {
      return c.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, 500);
    }
  });

  // GET /backups — list available backups
  app.get("/backups", async (c) => {
    try {
      const { join } = await import("node:path");
      const { existsSync, readdirSync, statSync } = await import("node:fs");

      const backupDir = join(config.artifactStorePath, "..", "backups");
      if (!existsSync(backupDir)) return c.json({ backups: [] });

      const files = readdirSync(backupDir);
      const backups = files.map((f) => {
        const path = join(backupDir, f);
        const stat = statSync(path);
        return { filename: f, path, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return c.json({ backups });
    } catch {
      return c.json({ backups: [] });
    }
  });

  // POST /restore — restore artifacts from a backup
  // Note: Database restore should be done via Neon's branching/restore features.
  app.post("/restore", zValidator("json", z.object({
    backupTimestamp: z.string().min(1),
    confirm: z.boolean().refine(v => v === true, "Must set confirm=true to restore"),
  })), async (c) => {
    const { backupTimestamp } = c.req.valid("json");
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");
      const execAsync = promisify(exec);

      const backupDir = join(config.artifactStorePath, "..", "backups");
      const artifactsBackup = join(backupDir, `artifacts-${backupTimestamp}.tar.gz`);

      const restored: string[] = [];

      if (existsSync(artifactsBackup)) {
        await execAsync(`rm -rf "${config.artifactStorePath}"/*`);
        await execAsync(`tar xzf "${artifactsBackup}" -C "${config.artifactStorePath}"`, {
          maxBuffer: 500 * 1024 * 1024,
        });
        restored.push("artifacts");
      }

      return c.json({
        success: true,
        restored,
        timestamp: backupTimestamp,
        note: restored.length === 0
          ? "No matching backup found. Database restore should be done via Neon dashboard."
          : undefined,
      });
    } catch (err) {
      return c.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, 500);
    }
  });
}
