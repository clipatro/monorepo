import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { AssetRow } from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { acceptSchema, rejectSchema } from "../schemas";

// === POST /accept — accept a generated image ===

export function registerAcceptRejectRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  app.post("/accept", zValidator("json", acceptSchema), async (c) => {
    const { assetId } = c.req.valid("json");

    const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as AssetRow | null;
    if (!asset) return c.json({ error: "Asset not found" }, 404);

    // Mark as accepted (we use the type field to track status: "image" = pending, "image_accepted" = accepted)
    await db.prepare("UPDATE assets SET type = 'image_accepted' WHERE id = ?").run(assetId);

    return c.json({ assetId, status: "accepted", filePath: asset.file_path });
  });

  // === POST /reject — reject a generated image (retain in history) ===

  app.post("/reject", zValidator("json", rejectSchema), async (c) => {
    const { assetId, reason } = c.req.valid("json");

    const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as AssetRow | null;
    if (!asset) return c.json({ error: "Asset not found" }, 404);

    // Mark as rejected (retain in history — don't delete the file)
    await db.prepare("UPDATE assets SET type = 'image_rejected' WHERE id = ?").run(assetId);

    // Log the rejection reason (store in a simple format)
    console.log(`[image-service] Asset ${assetId} rejected: ${reason ?? "no reason given"}`);

    return c.json({ assetId, status: "rejected", reason: reason ?? null, filePath: asset.file_path });
  });
}
