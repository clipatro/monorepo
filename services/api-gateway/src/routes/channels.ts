import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { ChannelRow } from "@automation/database";
import { loadConfig } from "@automation/config";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

import { createChannelSchema, updateChannelSchema } from "../schemas";
import { parseChannelRow } from "../parsers";
import { uuid, slugify, getActiveCharacterIds } from "../utils";

export function registerChannelRoutes(app: Hono, _config: AppConfig): void {
  // === Channel CRUD ===

  // List channels (with optional search + pagination)
  app.get("/api/channels", async (c) => {
    const db = getDb();
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const isPaginated = limit !== undefined || offset !== undefined;

    let whereClause = "";
    const params: (string | number)[] = [];
    if (search) {
      whereClause = "WHERE name LIKE ? OR niche LIKE ? OR slug LIKE ?";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    if (isPaginated) {
      const lim = Math.min(Number(limit ?? 50), 200);
      const off = Number(offset ?? 0);
      const rows = await db.prepare(`SELECT * FROM channels ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, lim, off) as ChannelRow[];
      const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM channels ${whereClause}`).get(...params) as { count: number };
      const channels = await Promise.all(rows.map(async (r) => parseChannelRow(r, await getActiveCharacterIds(r.id))));
      return c.json({ channels, total: totalRow.count });
    }

    const rows = await db.prepare(`SELECT * FROM channels ${whereClause} ORDER BY created_at DESC`).all(...params) as ChannelRow[];
    const channels = await Promise.all(rows.map(async (r) => parseChannelRow(r, await getActiveCharacterIds(r.id))));
    return c.json({ channels });
  });

  // Get single channel
  app.get("/api/channels/:id", async (c) => {
    const db = getDb();
    const row = await db.prepare("SELECT * FROM channels WHERE id = ?").get(c.req.param("id")) as ChannelRow | null;
    if (!row) return c.json({ error: "Channel not found" }, 404);
    return c.json({ channel: parseChannelRow(row, await getActiveCharacterIds(row.id)) });
  });

  // Create channel
  app.post("/api/channels", async (c) => {
    const body = await c.req.json();
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const data = parsed.data;
    const id = uuid();
    const slug = data.slug ?? slugify(data.name);
    const db = getDb();
    try {
      await db.prepare(`
        INSERT INTO channels (
          id, name, slug, niche, locale, content_types,
          target_duration_seconds, scene_min, scene_max,
          story_style, visual_style, image_provider, tts_provider, tts_voice_id, aspect_ratio,
          approval_enabled, llm_config, image_model_character, image_model_non_character,
          research_enabled, duplicate_adjudication_enabled, video_generation_enabled, video_template
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.name, slug, data.niche, data.locale, JSON.stringify(data.contentTypes),
        data.targetDurationSeconds, data.sceneMin, data.sceneMax,
        data.storyStyle, data.visualStyle, data.imageProvider, data.ttsProvider, data.ttsVoiceId, data.aspectRatio,
        data.approvalEnabled ? 1 : 0,
        data.llmConfig ? JSON.stringify(data.llmConfig) : null,
        data.imageModelCharacter, data.imageModelNonCharacter,
        data.researchEnabled ? 1 : 0,
        data.duplicateAdjudicationEnabled ? 1 : 0,
        data.videoGenerationEnabled ? 1 : 0,
        data.videoTemplate ?? "gameplay-with-image-scenes",
      );
    } catch (err) {
      if (String(err).includes("UNIQUE")) {
        return c.json({ error: "A channel with this slug already exists" }, 409);
      }
      throw err;
    }
    const row = await db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow;
    return c.json({ channel: parseChannelRow(row, await getActiveCharacterIds(row.id)) }, 201);
  });

  // Update channel
  app.put("/api/channels/:id", async (c) => {
    const body = await c.req.json();
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const db = getDb();
    const id = c.req.param("id");
    const existing = await db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | null;
    if (!existing) return c.json({ error: "Channel not found" }, 404);

    const data = parsed.data;
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.slug !== undefined) { updates.push("slug = ?"); values.push(data.slug); }
    if (data.niche !== undefined) { updates.push("niche = ?"); values.push(data.niche); }
    if (data.locale !== undefined) { updates.push("locale = ?"); values.push(data.locale); }
    if (data.contentTypes !== undefined) { updates.push("content_types = ?"); values.push(JSON.stringify(data.contentTypes)); }
    if (data.targetDurationSeconds !== undefined) { updates.push("target_duration_seconds = ?"); values.push(data.targetDurationSeconds); }
    if (data.sceneMin !== undefined) { updates.push("scene_min = ?"); values.push(data.sceneMin); }
    if (data.sceneMax !== undefined) { updates.push("scene_max = ?"); values.push(data.sceneMax); }
    if (data.storyStyle !== undefined) { updates.push("story_style = ?"); values.push(data.storyStyle); }
    if (data.visualStyle !== undefined) { updates.push("visual_style = ?"); values.push(data.visualStyle); }
    if (data.imageProvider !== undefined) { updates.push("image_provider = ?"); values.push(data.imageProvider); }
    if (data.ttsProvider !== undefined) { updates.push("tts_provider = ?"); values.push(data.ttsProvider); }
    if (data.ttsVoiceId !== undefined) { updates.push("tts_voice_id = ?"); values.push(data.ttsVoiceId); }
    if (data.aspectRatio !== undefined) { updates.push("aspect_ratio = ?"); values.push(data.aspectRatio); }
    if (data.approvalEnabled !== undefined) { updates.push("approval_enabled = ?"); values.push(data.approvalEnabled ? 1 : 0); }
    if (data.llmConfig !== undefined) { updates.push("llm_config = ?"); values.push(data.llmConfig ? JSON.stringify(data.llmConfig) : null); }
    if (data.imageModelCharacter !== undefined) { updates.push("image_model_character = ?"); values.push(data.imageModelCharacter as string | null); }
    if (data.imageModelNonCharacter !== undefined) { updates.push("image_model_non_character = ?"); values.push(data.imageModelNonCharacter as string | null); }
    if (data.researchEnabled !== undefined) { updates.push("research_enabled = ?"); values.push(data.researchEnabled ? 1 : 0); }
    if (data.duplicateAdjudicationEnabled !== undefined) { updates.push("duplicate_adjudication_enabled = ?"); values.push(data.duplicateAdjudicationEnabled ? 1 : 0); }
    if (data.videoGenerationEnabled !== undefined) { updates.push("video_generation_enabled = ?"); values.push(data.videoGenerationEnabled ? 1 : 0); }
    if (data.videoTemplate !== undefined) { updates.push("video_template = ?"); values.push(data.videoTemplate); }
    // D021: Flow config
    if (data.flowProjectUrl !== undefined) { updates.push("flow_project_url = ?"); values.push(data.flowProjectUrl as string | null); }
    if (data.flowCdpEndpoint !== undefined) { updates.push("flow_cdp_endpoint = ?"); values.push(data.flowCdpEndpoint); }
    if (data.flowInterRequestDelayMs !== undefined) { updates.push("flow_inter_request_delay_ms = ?"); values.push(data.flowInterRequestDelayMs); }

    if (updates.length > 0) {
      updates.push("updated_at = now()");
      values.push(id);
      await db.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const row = await db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow;
    return c.json({ channel: parseChannelRow(row, await getActiveCharacterIds(row.id)) });
  });

  // Delete channel
  app.delete("/api/channels/:id", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const result = await db.prepare("DELETE FROM channels WHERE id = ?").run(id);
    if (result.changes === 0) return c.json({ error: "Channel not found" }, 404);
    return c.json({ deleted: true });
  });

  // === Background audio ===

  // Upload background audio (multipart form data)
  app.post("/api/channels/:id/background-audio", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "No file provided" }, 400);

    const config = loadConfig("api-gateway");
    const dir = join(config.artifactStorePath, "channels", id);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Use a fixed filename so re-uploads replace the old file
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
    const fileName = `background-audio.${ext}`;
    const filePath = join(dir, fileName);

    const fileBuffer = await file.arrayBuffer();
    await Bun.write(filePath, fileBuffer);

    await db.prepare("UPDATE channels SET background_audio_path = ?, updated_at = now() WHERE id = ?").run(filePath, id);

    return c.json({ backgroundAudioPath: filePath }, 201);
  });

  // Download background audio
  app.get("/api/channels/:id/background-audio", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const channel = await db.prepare("SELECT background_audio_path FROM channels WHERE id = ?").get(id) as { background_audio_path: string | null } | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);
    if (!channel.background_audio_path) return c.json({ error: "No background audio set" }, 404);
    if (!existsSync(channel.background_audio_path)) return c.json({ error: "Background audio file not found on disk" }, 404);

    const file = Bun.file(channel.background_audio_path);
    const ext = channel.background_audio_path.split(".").pop()?.toLowerCase() ?? "mp3";
    const mime = ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg";
    return new Response(file, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="background-audio.${ext}"`,
      },
    });
  });

  // Delete background audio
  app.delete("/api/channels/:id/background-audio", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const channel = await db.prepare("SELECT background_audio_path FROM channels WHERE id = ?").get(id) as { background_audio_path: string | null } | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);
    if (channel.background_audio_path && existsSync(channel.background_audio_path)) {
      try { await Bun.file(channel.background_audio_path).unlink?.(); } catch { /* non-critical */ }
    }
    await db.prepare("UPDATE channels SET background_audio_path = NULL, updated_at = now() WHERE id = ?").run(id);
    return c.json({ deleted: true });
  });
}
