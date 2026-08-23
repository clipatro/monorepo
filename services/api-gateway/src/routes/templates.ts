/**
 * D017: Video template CRUD routes + channel-template assignment.
 *
 * Endpoints:
 * - GET    /api/video-templates           — list all templates
 * - GET    /api/video-templates/:id       — get a single template
 * - POST   /api/video-templates           — create a custom template
 * - PUT    /api/video-templates/:id       — update a template (non-system only)
 * - DELETE /api/video-templates/:id       — delete a template (non-system only)
 * - GET    /api/channels/:id/template     — get the channel's active template + overrides
 * - PUT    /api/channels/:id/template     — assign/update a channel's template + overrides
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb, type VideoTemplateRow, type ChannelTemplateRow } from "@automation/database";
import type { TemplateConfig, ChannelTemplateOverrides } from "@automation/contracts";

export function registerTemplateRoutes(app: Hono): void {
  // === List all templates ===
  app.get("/api/video-templates", async (c) => {
    const db = getDb();
    const rows = await db.prepare(`
      SELECT id, name, description, version, is_system, created_at, updated_at
      FROM video_templates ORDER BY is_system DESC, name ASC
    `).all() as Omit<VideoTemplateRow, "config">[];

    return c.json({ templates: rows });
  });

  // === Get a single template (with full config) ===
  app.get("/api/video-templates/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const row = await db.prepare(`
      SELECT * FROM video_templates WHERE id = ?
    `).get(id) as VideoTemplateRow | null;

    if (!row) {
      return c.json({ error: "Template not found" }, 404);
    }

    return c.json({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      config: JSON.parse(row.config),
      isSystem: row.is_system === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // === Create a custom template ===
  const createTemplateSchema = z.object({
    id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(""),
    config: z.record(z.any()), // TemplateConfig — validated by the loader
  });

  app.post("/api/video-templates", zValidator("json", createTemplateSchema), async (c) => {
    const data = c.req.valid("json");
    const db = getDb();

    // Check for duplicate id
    const existing = await db.prepare("SELECT id FROM video_templates WHERE id = ?").get(data.id);
    if (existing) {
      return c.json({ error: "Template id already exists" }, 409);
    }

    // Validate the config by parsing it as a TemplateConfig
    try {
      JSON.stringify(data.config);
    } catch {
      return c.json({ error: "Invalid config JSON" }, 400);
    }

    const configJson = typeof data.config === "string" ? data.config : JSON.stringify(data.config);

    await db.prepare(`
      INSERT INTO video_templates (id, name, description, version, config, is_system)
      VALUES (?, ?, ?, 1, ?, 0)
    `).run(data.id, data.name, data.description, configJson);

    return c.json({
      id: data.id,
      name: data.name,
      description: data.description,
      version: 1,
      isSystem: false,
      message: "Template created",
    }, 201);
  });

  // === Update a template (non-system only) ===
  const updateTemplateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    config: z.record(z.any()).optional(),
  });

  app.put("/api/video-templates/:id", zValidator("json", updateTemplateSchema), async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const db = getDb();

    const row = await db.prepare("SELECT is_system FROM video_templates WHERE id = ?").get(id) as { is_system: number } | null;
    if (!row) {
      return c.json({ error: "Template not found" }, 404);
    }
    if (row.is_system === 1) {
      return c.json({ error: "Cannot modify system templates" }, 403);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      params.push(data.description);
    }
    if (data.config !== undefined) {
      updates.push("config = ?");
      params.push(typeof data.config === "string" ? data.config : JSON.stringify(data.config));
    }

    if (updates.length === 0) {
      return c.json({ message: "No changes" });
    }

    updates.push("updated_at = now()");
    params.push(id);

    await db.prepare(`UPDATE video_templates SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return c.json({ id, message: "Template updated" });
  });

  // === Delete a template (non-system only) ===
  app.delete("/api/video-templates/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const row = await db.prepare("SELECT is_system FROM video_templates WHERE id = ?").get(id) as { is_system: number } | null;
    if (!row) {
      return c.json({ error: "Template not found" }, 404);
    }
    if (row.is_system === 1) {
      return c.json({ error: "Cannot delete system templates" }, 403);
    }

    // Check if any channels are using it
    const usage = await db.prepare("SELECT COUNT(*) as count FROM channel_templates WHERE template_id = ?").get(id) as { count: number };
    if (usage.count > 0) {
      return c.json({ error: "Template is in use by channels — reassign them first" }, 409);
    }

    await db.prepare("DELETE FROM video_templates WHERE id = ?").run(id);
    return c.json({ id, message: "Template deleted" });
  });

  // === Get a channel's active template + overrides ===
  app.get("/api/channels/:id/template", async (c) => {
    const channelId = c.req.param("id");
    const db = getDb();

    const row = await db.prepare(`
      SELECT ct.id, ct.channel_id, ct.template_id, ct.config, ct.is_active, ct.created_at, ct.updated_at,
             vt.name as template_name, vt.description as template_description, vt.config as template_config,
             vt.version as template_version, vt.is_system as template_is_system
      FROM channel_templates ct
      JOIN video_templates vt ON vt.id = ct.template_id
      WHERE ct.channel_id = ? AND ct.is_active = 1
    `).get(channelId) as (ChannelTemplateRow & {
      template_name: string;
      template_description: string;
      template_config: string;
      template_version: number;
      template_is_system: number;
    }) | null;

    if (!row) {
      return c.json({ error: "No active template for this channel" }, 404);
    }

    return c.json({
      channelId: row.channel_id,
      templateId: row.template_id,
      templateName: row.template_name,
      templateDescription: row.template_description,
      templateVersion: row.template_version,
      templateIsSystem: row.template_is_system === 1,
      templateConfig: JSON.parse(row.template_config) as TemplateConfig,
      overrides: JSON.parse(row.config) as ChannelTemplateOverrides,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // === Assign/update a channel's template + overrides ===
  const assignTemplateSchema = z.object({
    templateId: z.string().min(1),
    overrides: z.record(z.any()).default({}),
  });

  app.put("/api/channels/:id/template", zValidator("json", assignTemplateSchema), async (c) => {
    const channelId = c.req.param("id");
    const { templateId, overrides } = c.req.valid("json");
    const db = getDb();

    // Verify the template exists
    const tmpl = await db.prepare("SELECT id FROM video_templates WHERE id = ?").get(templateId);
    if (!tmpl) {
      return c.json({ error: "Template not found" }, 404);
    }

    // Verify the channel exists
    const ch = await db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
    if (!ch) {
      return c.json({ error: "Channel not found" }, 404);
    }

    const overridesJson = JSON.stringify(overrides);

    // Upsert the channel_templates row
    const existing = await db.prepare("SELECT id FROM channel_templates WHERE channel_id = ?").get(channelId) as { id: string } | null;

    if (existing) {
      await db.prepare(`
        UPDATE channel_templates
        SET template_id = ?, config = ?, is_active = 1, updated_at = now()
        WHERE channel_id = ?
      `).run(templateId, overridesJson, channelId);
    } else {
      await db.prepare(`
        INSERT INTO channel_templates (id, channel_id, template_id, config, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(crypto.randomUUID(), channelId, templateId, overridesJson);
    }

    // Also update the channel's video_template column for backward compat
    await db.prepare("UPDATE channels SET video_template = ? WHERE id = ?").run(templateId, channelId);

    return c.json({
      channelId,
      templateId,
      overrides,
      message: "Template assigned",
    });
  });
}
