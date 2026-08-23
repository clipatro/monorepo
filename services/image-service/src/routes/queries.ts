import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  SceneRow, ImagePromptRow, AssetRow,
} from "@automation/database";
import { existsSync } from "node:fs";

// === GET /scenes/:storyId — list scenes for a story ===

export function registerQueryRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  app.get("/scenes/:storyId", async (c) => {
    const storyId = c.req.param("storyId");
    const scenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];
    return c.json({ scenes });
  });

  // === GET /scenes/:storyId/accepted-images — all accepted images for a story ===
  //
  // Returns one image per scene (the latest accepted, or latest pending as fallback).
  // Used by the RunSummary dialog to show the actual final images rather than
  // the stale snapshot from the image_generation step's resultData.

  app.get("/scenes/:storyId/accepted-images", async (c) => {
    const storyId = c.req.param("storyId");
    const scenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];

    const images: Array<{
      assetId: string;
      sceneId: string;
      order: number;
      filePath: string;
      mimeType: string;
      width: number;
      height: number;
      checksum: string;
      provider: string;
      model: string;
      costUsd: number;
      isCharacterScene: boolean;
      createdAt: string;
    }> = [];
    for (const scene of scenes) {
      // Try accepted first, fall back to latest pending image
      let asset = await db.prepare(`
        SELECT * FROM assets WHERE scene_id = ? AND type = 'image_accepted'
        ORDER BY created_at DESC LIMIT 1
      `).get(scene.id) as AssetRow | null;

      if (!asset) {
        asset = await db.prepare(`
          SELECT * FROM assets WHERE scene_id = ? AND type = 'image'
          ORDER BY created_at DESC LIMIT 1
        `).get(scene.id) as AssetRow | null;
      }

      if (!asset) continue;

      images.push({
        assetId: asset.id,
        sceneId: scene.id,
        order: scene.order,
        filePath: asset.file_path,
        mimeType: asset.mime_type,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        checksum: asset.checksum,
        provider: asset.provider ?? "",
        model: asset.model ?? "",
        costUsd: asset.cost_usd ?? 0,
        isCharacterScene: scene.image_requirement === "character_scene",
        createdAt: asset.created_at,
      });
    }

    return c.json({ storyId, images });
  });

  // === GET /scene/:id — get a single scene with prompts ===

  app.get("/scene/:id", async (c) => {
    const id = c.req.param("id");
    const scene = await db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | null;
    if (!scene) return c.json({ error: "Scene not found" }, 404);

    const prompts = await db.prepare("SELECT * FROM image_prompts WHERE scene_id = ? ORDER BY created_at DESC").all(id) as ImagePromptRow[];

    return c.json({ scene, prompts });
  });

  // === GET /images/:sceneId — list images (accepted + rejected) for a scene ===

  app.get("/images/:sceneId", async (c) => {
    const sceneId = c.req.param("sceneId");
    const assets = await db.prepare(
      "SELECT * FROM assets WHERE scene_id = ? AND type LIKE 'image%' ORDER BY created_at DESC",
    ).all(sceneId) as AssetRow[];

    return c.json({
      images: assets.map((a) => ({
        id: a.id,
        type: a.type, // "image", "image_accepted", "image_rejected"
        filePath: a.file_path,
        mimeType: a.mime_type,
        width: a.width,
        height: a.height,
        checksum: a.checksum,
        provider: a.provider,
        model: a.model,
        costUsd: a.cost_usd,
        createdAt: a.created_at,
      })),
    });
  });

  // === GET /gallery — list ALL images across all stories with pagination + search ===

  app.get("/gallery", async (c) => {
    const search = c.req.query("search");
    const channelId = c.req.query("channelId");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const isPaginated = limit !== undefined || offset !== undefined;

    const conditions: string[] = ["a.type LIKE 'image%'"];
    const params: (string | number)[] = [];
    if (channelId) {
      conditions.push("a.channel_id = ?");
      params.push(channelId);
    }
    if (search) {
      conditions.push("(s.narration_text LIKE ? OR a.model LIKE ?)");
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const orderBy = "ORDER BY a.created_at DESC";

    const selectSql = `
      SELECT a.id, a.scene_id, s.story_id, s."order", a.type, a.file_path, a.mime_type,
             a.width, a.height, a.provider, a.model, a.cost_usd, a.created_at,
             s.narration_text
      FROM assets a
      LEFT JOIN scenes s ON a.scene_id = s.id
      ${whereClause}
      ${orderBy}
    `;

    if (isPaginated) {
      const lim = Math.min(Number(limit ?? 50), 200);
      const off = Number(offset ?? 0);
      const rows = await db.prepare(`${selectSql} LIMIT ? OFFSET ?`).all(...params, lim, off) as Array<{
        id: string;
        scene_id: string | null;
        story_id: string | null;
        order: number | null;
        type: string;
        file_path: string;
        mime_type: string;
        width: number | null;
        height: number | null;
        provider: string | null;
        model: string | null;
        cost_usd: number | null;
        created_at: string;
        narration_text: string | null;
      }>;
      const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM assets a LEFT JOIN scenes s ON a.scene_id = s.id ${whereClause}`).get(...params) as { count: number };
      return c.json({
        images: rows.map((r) => ({
          assetId: r.id,
          sceneId: r.scene_id,
          storyId: r.story_id,
          order: r.order,
          type: r.type,
          filePath: r.file_path,
          mimeType: r.mime_type,
          width: r.width,
          height: r.height,
          provider: r.provider,
          model: r.model,
          costUsd: r.cost_usd,
          createdAt: r.created_at,
          narrationText: r.narration_text,
        })),
        total: totalRow.count,
      });
    }

    const rows = await db.prepare(selectSql).all(...params) as Array<{
      id: string;
      scene_id: string | null;
      story_id: string | null;
      order: number | null;
      type: string;
      file_path: string;
      mime_type: string;
      width: number | null;
      height: number | null;
      provider: string | null;
      model: string | null;
      cost_usd: number | null;
      created_at: string;
      narration_text: string | null;
    }>;
    return c.json({
      images: rows.map((r) => ({
        assetId: r.id,
        sceneId: r.scene_id,
        storyId: r.story_id,
        order: r.order,
        type: r.type,
        filePath: r.file_path,
        mimeType: r.mime_type,
        width: r.width,
        height: r.height,
        provider: r.provider,
        model: r.model,
        costUsd: r.cost_usd,
        createdAt: r.created_at,
        narrationText: r.narration_text,
      })),
    });
  });

  // === GET /asset/:id — serve an image file by asset ID ===

  app.get("/asset/:id", async (c) => {
    const id = c.req.param("id");
    const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | null;
    if (!asset) return c.json({ error: "Asset not found" }, 404);
    if (!existsSync(asset.file_path)) return c.json({ error: "File not found on disk" }, 404);

    const file = Bun.file(asset.file_path);
    return new Response(file, {
      headers: {
        "Content-Type": asset.mime_type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
}
