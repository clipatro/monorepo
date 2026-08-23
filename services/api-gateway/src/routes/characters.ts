import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  ChannelRow,
  CharacterRow,
  CharacterVersionRow,
  CharacterReferenceRow,
} from "@automation/database";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createCharacterSchema, updateCharacterSchema, createCharacterVersionSchema } from "../schemas";
import {
  parseChannelRow,
  parseCharacterRow,
  parseCharacterVersionRow,
  parseCharacterReferenceRow,
} from "../parsers";
import { uuid, loadConfigSafe, getActiveCharacterIds } from "../utils";

export function registerCharacterRoutes(app: Hono, _config: AppConfig): void {
  // === Character CRUD ===

  // List characters for a channel (with optional search + pagination)
  app.get("/api/channels/:channelId/characters", async (c) => {
    const db = getDb();
    const channelId = c.req.param("channelId");
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const isPaginated = limit !== undefined || offset !== undefined;

    let whereClause = "WHERE channel_id = ?";
    const params: (string | number)[] = [channelId];
    if (search) {
      whereClause += " AND (name LIKE ? OR role LIKE ?)";
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    if (isPaginated) {
      const lim = Math.min(Number(limit ?? 50), 200);
      const off = Number(offset ?? 0);
      const rows = await db.prepare(`SELECT * FROM characters ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, lim, off) as CharacterRow[];
      const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM characters ${whereClause}`).get(...params) as { count: number };
      return c.json({ characters: rows.map(parseCharacterRow), total: totalRow.count });
    }

    const rows = await db.prepare(`SELECT * FROM characters ${whereClause} ORDER BY created_at DESC`).all(...params) as CharacterRow[];
    return c.json({ characters: rows.map(parseCharacterRow) });
  });

  // Get single character with versions
  app.get("/api/characters/:id", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const char = await db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | null;
    if (!char) return c.json({ error: "Character not found" }, 404);
    const versions = await db.prepare("SELECT * FROM character_versions WHERE character_id = ? ORDER BY version DESC").all(id) as CharacterVersionRow[];
    return c.json({
      character: parseCharacterRow(char),
      versions: versions.map(parseCharacterVersionRow),
    });
  });

  // Create character
  app.post("/api/channels/:channelId/characters", async (c) => {
    const channelId = c.req.param("channelId");
    const db = getDb();
    const channel = await db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    const body = await c.req.json();
    const parsed = createCharacterSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const id = uuid();
    await db.prepare("INSERT INTO characters (id, channel_id, name, role) VALUES (?, ?, ?, ?)").run(
      id, channelId, parsed.data.name, parsed.data.role,
    );

    const row = await db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow;
    return c.json({ character: parseCharacterRow(row) }, 201);
  });

  // Update character
  app.put("/api/characters/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const existing = await db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | null;
    if (!existing) return c.json({ error: "Character not found" }, 404);

    const body = await c.req.json();
    const parsed = updateCharacterSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.role !== undefined) { updates.push("role = ?"); values.push(data.role); }

    if (updates.length > 0) {
      updates.push("updated_at = now()");
      values.push(id);
      await db.prepare(`UPDATE characters SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const row = await db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow;
    return c.json({ character: parseCharacterRow(row) });
  });

  // Delete character
  app.delete("/api/characters/:id", async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const result = await db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    if (result.changes === 0) return c.json({ error: "Character not found" }, 404);
    return c.json({ deleted: true });
  });

  // === Character versions ===

  // Create a new character version (draft)
  app.post("/api/characters/:id/versions", async (c) => {
    const characterId = c.req.param("id");
    const db = getDb();
    const char = await db.prepare("SELECT * FROM characters WHERE id = ?").get(characterId) as CharacterRow | null;
    if (!char) return c.json({ error: "Character not found" }, 404);

    const body = await c.req.json();
    const parsed = createCharacterVersionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    // Get next version number
    const maxVersion = await db.prepare("SELECT MAX(version) as max FROM character_versions WHERE character_id = ?").get(characterId) as { max: number | null };
    const version = (maxVersion.max ?? 0) + 1;
    const id = uuid();

    await db.prepare("INSERT INTO character_versions (id, character_id, version, bible) VALUES (?, ?, ?, ?)").run(
      id, characterId, version, JSON.stringify(parsed.data.bible),
    );

    const row = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow;
    return c.json({ version: parseCharacterVersionRow(row) }, 201);
  });

  // Freeze a character version (lock it)
  app.post("/api/character-versions/:id/freeze", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow | null;
    if (!version) return c.json({ error: "Character version not found" }, 404);
    if (version.status === "frozen") return c.json({ error: "Version already frozen" }, 409);

    await db.prepare("UPDATE character_versions SET status = 'frozen', frozen_at = now() WHERE id = ?").run(id);

    // Archive older frozen versions
    await db.prepare("UPDATE character_versions SET status = 'archived' WHERE character_id = ? AND id != ? AND status = 'frozen'").run(version.character_id, id);

    const row = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow;
    return c.json({ version: parseCharacterVersionRow(row) });
  });

  // Update a draft version's bible (frozen/archived versions are immutable)
  app.put("/api/character-versions/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow | null;
    if (!version) return c.json({ error: "Character version not found" }, 404);
    if (version.status !== "draft") return c.json({ error: "Cannot edit a frozen or archived version" }, 409);

    const body = await c.req.json() as { bible?: Record<string, unknown> };
    if (!body.bible) return c.json({ error: "bible is required" }, 400);

    await db.prepare("UPDATE character_versions SET bible = ? WHERE id = ?").run(JSON.stringify(body.bible), id);
    const row = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow;
    return c.json({ version: parseCharacterVersionRow(row) });
  });

  // Delete a character version (and its reference images on disk)
  app.delete("/api/character-versions/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow | null;
    if (!version) return c.json({ error: "Character version not found" }, 404);

    // Check if this version's character is active in any channel via the junction
    const activeChannels = await db.prepare(`
      SELECT cc.channel_id FROM channel_characters cc
      WHERE cc.character_id = ? AND cc.is_active = 1
    `).all(version.character_id) as Array<{ channel_id: string }>;
    if (activeChannels.length > 0) {
      // Check if this specific version is the frozen version that would be used
      const isFrozen = version.status === "frozen";
      if (isFrozen) {
        return c.json({ error: "Cannot delete the frozen version of a character that is active in one or more channels. Deactivate it first." }, 409);
      }
    }

    // Delete reference files from disk
    const refs = await db.prepare("SELECT * FROM character_references WHERE character_version_id = ?").all(id) as CharacterReferenceRow[];
    for (const ref of refs) {
      try { Bun.file(ref.file_path).unlink?.(); } catch { /* file may not exist */ }
    }

    // Delete reference records from DB
    await db.prepare("DELETE FROM character_references WHERE character_version_id = ?").run(id);
    // Delete the version
    await db.prepare("DELETE FROM character_versions WHERE id = ?").run(id);

    return c.json({ deleted: true });
  });

  // === Character references ===

  // List references for a character version
  app.get("/api/character-versions/:id/references", async (c) => {
    const versionId = c.req.param("id");
    const db = getDb();
    const rows = await db.prepare("SELECT * FROM character_references WHERE character_version_id = ? ORDER BY created_at ASC").all(versionId) as CharacterReferenceRow[];
    return c.json({ references: rows.map(parseCharacterReferenceRow) });
  });

  // Upload a reference image (multipart form data)
  app.post("/api/character-versions/:id/references", async (c) => {
    const versionId = c.req.param("id");
    const db = getDb();
    const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(versionId) as CharacterVersionRow | null;
    if (!version) return c.json({ error: "Character version not found" }, 404);
    if (version.status === "frozen") return c.json({ error: "Cannot add references to a frozen version" }, 409);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const role = formData.get("role") as string | null;
    if (!file) return c.json({ error: "No file provided" }, 400);
    if (!role) return c.json({ error: "Role is required (e.g. front, three-quarter, side, expression)" }, 400);

    // Save the file to the artifact store
    const config = loadConfigSafe();
    const chars = await db.prepare("SELECT channel_id FROM characters WHERE id = ?").get(version.character_id) as { channel_id: string } | null;
    if (!chars) return c.json({ error: "Character not found" }, 404);
    const channelId = chars.channel_id;

    const ext = file.name.split(".").pop() ?? "png";
    const fileName = `${uuid()}.${ext}`;
    const dir = join(config.artifactStorePath, "channels", channelId, "characters", version.character_id, "versions", versionId);
    const filePath = join(dir, fileName);

    // Create the directory if it doesn't exist
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write the file
    const fileBuffer = await file.arrayBuffer();
    await Bun.write(filePath, fileBuffer);

    // Compute checksum
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const checksum = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Read actual image dimensions from the buffer
    const buf = Buffer.from(fileBuffer);
    const { width, height } = readImageDimensions(buf);

    const id = uuid();
    await db.prepare(`
      INSERT INTO character_references (id, character_version_id, role, file_path, checksum, mime_type, width, height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, versionId, role, filePath, checksum, file.type, width, height);

    const row = await db.prepare("SELECT * FROM character_references WHERE id = ?").get(id) as CharacterReferenceRow;
    return c.json({ reference: parseCharacterReferenceRow(row) }, 201);
  });

  // Delete a reference
  app.delete("/api/references/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const ref = await db.prepare("SELECT * FROM character_references WHERE id = ?").get(id) as CharacterReferenceRow | null;
    if (!ref) return c.json({ error: "Reference not found" }, 404);

    // Delete file
    try { Bun.file(ref.file_path).unlink?.(); } catch { /* file may not exist */ }

    await db.prepare("DELETE FROM character_references WHERE id = ?").run(id);
    return c.json({ deleted: true });
  });

  // GET /api/character-references/:id/file — serve a reference image file
  app.get("/api/character-references/:id/file", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const ref = await db.prepare("SELECT * FROM character_references WHERE id = ?").get(id) as CharacterReferenceRow | null;
    if (!ref) return c.json({ error: "Reference not found" }, 404);

    const file = Bun.file(ref.file_path);
    if (!file.exists()) return c.json({ error: "File not found on disk" }, 404);

    return new Response(file, {
      headers: {
        "Content-Type": ref.mime_type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  // GET /api/character-versions/:id — get a single character version with its references
  app.get("/api/character-versions/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(id) as CharacterVersionRow | null;
    if (!version) return c.json({ error: "Character version not found" }, 404);
    const refs = await db.prepare("SELECT * FROM character_references WHERE character_version_id = ? ORDER BY created_at ASC").all(id) as CharacterReferenceRow[];
    return c.json({
      version: parseCharacterVersionRow(version),
      references: refs.map(parseCharacterReferenceRow),
    });
  });

  // === Toggle channel active character ===

  // PUT /api/channels/:id/active-character — toggle a character active/inactive for a channel
  // Body: { characterId: string, active: boolean }
  // When active=true, the character's frozen version will be used for scene generation.
  // Multiple characters can be active simultaneously for multi-character stories.
  app.put("/api/channels/:id/active-character", async (c) => {
    const channelId = c.req.param("id");
    const db = getDb();
    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(channelId) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    const body = await c.req.json() as { characterId?: string; active?: boolean; characterVersionId?: string | null };

    // Legacy support: if characterVersionId is passed (old frontend), map it
    if (body.characterVersionId !== undefined && body.characterId === undefined) {
      if (body.characterVersionId === null) {
        // Legacy: clear all active — find the character and deactivate
        const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(body.characterVersionId) as CharacterVersionRow | null;
        if (version) {
          await db.prepare("UPDATE channel_characters SET is_active = 0 WHERE channel_id = ? AND character_id = ?").run(channelId, version.character_id);
        }
        const row = await db.prepare("SELECT * FROM channels WHERE id = ?").get(channelId) as ChannelRow;
        return c.json({ channel: parseChannelRow(row, await getActiveCharacterIds(channelId)) });
      }
      // Map versionId → characterId
      const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(body.characterVersionId) as CharacterVersionRow | null;
      if (!version) return c.json({ error: "Character version not found" }, 404);
      body.characterId = version.character_id;
      body.active = true;
    }

    if (!body.characterId) return c.json({ error: "characterId is required" }, 400);
    const characterId = body.characterId;
    const active = body.active ?? true;

    // Verify the character is assigned to this channel
    const junction = await db.prepare("SELECT * FROM channel_characters WHERE channel_id = ? AND character_id = ?").get(channelId, characterId) as { id: string; is_active: number } | null;
    if (!junction) {
      return c.json({ error: "Character is not assigned to this channel. Add it first." }, 400);
    }

    if (active) {
      // Verify the character has a frozen version
      const frozenVersion = await db.prepare(
        "SELECT * FROM character_versions WHERE character_id = ? AND status = 'frozen' ORDER BY version DESC LIMIT 1",
      ).get(characterId) as CharacterVersionRow | null;
      if (!frozenVersion) {
        return c.json({ error: "Character has no frozen version. Freeze a version before activating." }, 400);
      }
    }

    await db.prepare("UPDATE channel_characters SET is_active = ? WHERE channel_id = ? AND character_id = ?").run(active ? 1 : 0, channelId, characterId);

    const row = await db.prepare("SELECT * FROM channels WHERE id = ?").get(channelId) as ChannelRow;
    return c.json({ channel: parseChannelRow(row, await getActiveCharacterIds(channelId)) });
  });

  // === Global character routes (Phase 7 — characters independent of channels) ===

  // GET /api/characters — list all characters globally (with optional search + pagination)
  app.get("/api/characters", async (c) => {
    const db = getDb();
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const pageNum = Math.max(0, parseInt(offset ?? "0", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit ?? "50", 10)));

    let query = "SELECT * FROM characters";
    let countQuery = "SELECT COUNT(*) as total FROM characters";
    const params: string[] = [];

    if (search) {
      query += " WHERE name LIKE ? OR role LIKE ?";
      countQuery += " WHERE name LIKE ? OR role LIKE ?";
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const rows = await db.prepare(query).all(...params, pageSize, pageNum) as CharacterRow[];
    const total = await db.prepare(countQuery).get(...params) as { total: number };

    // For each character, get its channel associations
    const charactersWithChannels = await Promise.all(rows.map(async (row) => {
      const channels = await db.prepare(`
        SELECT c.id, c.name, c.slug, c.niche
        FROM channels c
        JOIN channel_characters cc ON cc.channel_id = c.id
        WHERE cc.character_id = ?
        ORDER BY cc.added_at ASC
      `).all(row.id) as Array<{ id: string; name: string; slug: string; niche: string }>;

      return {
        ...parseCharacterRow(row),
        channels,
      };
    }));

    return c.json({ characters: charactersWithChannels, total: total.total });
  });

  // POST /api/characters — create a global character (not tied to a specific channel)
  app.post("/api/characters", async (c) => {
    const db = getDb();
    const body = await c.req.json() as { name: string; role: string; channelIds?: string[] };
    const id = uuid();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO characters (id, channel_id, name, role, auto_created, source_run_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(id, "", body.name, body.role, now, now);

    // Add to specified channels via junction table
    if (body.channelIds && Array.isArray(body.channelIds)) {
      for (const channelId of body.channelIds) {
        await db.prepare(`
          INSERT INTO channel_characters (id, channel_id, character_id, added_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `).run(uuid(), channelId, id, now);
      }
    }

    const row = await db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow;
    return c.json({ character: parseCharacterRow(row) }, 201);
  });

  // GET /api/characters/:id/channels — list channels that use this character
  app.get("/api/characters/:id/channels", async (c) => {
    const db = getDb();
    const characterId = c.req.param("id");
    const channels = await db.prepare(`
      SELECT c.id, c.name, c.slug, c.niche, cc.added_at
      FROM channels c
      JOIN channel_characters cc ON cc.channel_id = c.id
      WHERE cc.character_id = ?
      ORDER BY cc.added_at ASC
    `).all(characterId) as Array<{ id: string; name: string; slug: string; niche: string; added_at: string }>;
    return c.json({ channels });
  });

  // POST /api/channels/:channelId/characters/:characterId — add character to channel
  app.post("/api/channels/:channelId/characters/:characterId", async (c) => {
    const db = getDb();
    const channelId = c.req.param("channelId");
    const characterId = c.req.param("characterId");

    // Verify both exist
    const channel = await db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
    if (!channel) return c.json({ error: "Channel not found" }, 404);
    const character = await db.prepare("SELECT id FROM characters WHERE id = ?").get(characterId);
    if (!character) return c.json({ error: "Character not found" }, 404);

    await db.prepare(`
      INSERT INTO channel_characters (id, channel_id, character_id, added_at)
      VALUES (?, ?, ?, now())
      ON CONFLICT DO NOTHING
    `).run(uuid(), channelId, characterId);

    return c.json({ success: true });
  });

  // DELETE /api/channels/:channelId/characters/:characterId — remove character from channel
  app.delete("/api/channels/:channelId/characters/:characterId", async (c) => {
    const db = getDb();
    const channelId = c.req.param("channelId");
    const characterId = c.req.param("characterId");

    await db.prepare("DELETE FROM channel_characters WHERE channel_id = ? AND character_id = ?").run(channelId, characterId);
    return c.json({ success: true });
  });

  // GET /api/channels/:channelId/character-roster — get the channel's character roster with bibles
  app.get("/api/channels/:channelId/character-roster", async (c) => {
    const db = getDb();
    const channelId = c.req.param("channelId");

    // Get character IDs + is_active from junction table (with fallback to legacy channel_id)
    let characterRows: Array<{ character_id: string; is_active: number }> = await db.prepare(
      "SELECT character_id, is_active FROM channel_characters WHERE channel_id = ? ORDER BY added_at ASC",
    ).all(channelId) as Array<{ character_id: string; is_active: number }>;

    if (characterRows.length === 0) {
      characterRows = await db.prepare(
        "SELECT id as character_id, 0 as is_active FROM characters WHERE channel_id = ? ORDER BY created_at ASC",
      ).all(channelId) as Array<{ character_id: string; is_active: number }>;
    }

    const roster = (await Promise.all(characterRows.map(async ({ character_id, is_active }) => {
      const char = await db.prepare("SELECT * FROM characters WHERE id = ?").get(character_id) as CharacterRow | null;
      if (!char) return null;

      const frozenVersion = await db.prepare(
        "SELECT * FROM character_versions WHERE character_id = ? AND status = 'frozen' ORDER BY version DESC LIMIT 1",
      ).get(character_id) as CharacterVersionRow | null;

      const latestVersion = frozenVersion ?? await db.prepare(
        "SELECT * FROM character_versions WHERE character_id = ? ORDER BY version DESC LIMIT 1",
      ).get(character_id) as CharacterVersionRow | null;

      let bible: Record<string, unknown> = {};
      if (latestVersion) {
        try {
          bible = JSON.parse(latestVersion.bible) as Record<string, unknown>;
        } catch {
          bible = {};
        }
      }

      const refCount = latestVersion
        ? (await db.prepare("SELECT COUNT(*) as count FROM character_references WHERE character_version_id = ?").get(latestVersion.id) as { count: number }).count
        : 0;

      return {
        characterId: char.id,
        name: char.name,
        role: char.role,
        bible,
        hasReferenceImages: refCount > 0,
        frozenVersionId: frozenVersion?.id ?? null,
        autoCreated: char.auto_created === 1,
        isActive: is_active === 1,
      };
    }))).filter(Boolean);

    return c.json({ roster });
  });
}

// === Helper: read PNG/JPEG/WebP dimensions from a buffer (no external deps) ===

function readImageDimensions(buf: Buffer): { width: number; height: number } {
  // PNG: signature at 0, width at 16 (4 bytes BE), height at 20 (4 bytes BE)
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan markers for SOF (0xC0–0xCF, excluding 0xC4/0xC8/0xCC)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  }
  // WebP: RIFF header at 0, VP8/VP8L/VP8X at 12
  if (buf.length >= 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    const codec = buf.toString("ascii", 12, 16);
    if (codec === "VP8 ") {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    } else if (codec === "VP8L") {
      const b0 = buf[21] ?? 0, b1 = buf[22] ?? 0, b2 = buf[23] ?? 0, b3 = buf[24] ?? 0;
      return { width: 1 + ((b0 | ((b1 & 0x3f) << 8))), height: 1 + (((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10))) };
    } else if (codec === "VP8X") {
      return { width: 1 + (buf.readUIntLE(24, 3) & 0xffffff), height: 1 + (buf.readUIntLE(27, 3) & 0xffffff) };
    }
  }
  // Unknown format
  return { width: 0, height: 0 };
}
