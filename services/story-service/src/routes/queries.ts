import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { StoryRow, StoryVersionRow, StoryDnaRow } from "@automation/database";
import { parseStoryRow, parseDnaRow } from "../parsers";

// === List stories ===

export function registerQueryRoutes(app: Hono, _config: AppConfig): void {
  app.get("/stories", async (c) => {
    const channelId = c.req.query("channelId");
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const isPaginated = limit !== undefined || offset !== undefined;
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (channelId) {
      conditions.push("channel_id = ?");
      params.push(channelId);
    }
    if (search) {
      conditions.push("title LIKE ?");
      params.push(`%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = "ORDER BY approved_at DESC NULLS LAST";

    if (isPaginated) {
      const lim = Math.min(Number(limit ?? 50), 200);
      const off = Number(offset ?? 0);
      const stories = (await db.prepare(`SELECT * FROM stories ${whereClause} ${orderBy} LIMIT ? OFFSET ?`).all(...params, lim, off)) as StoryRow[];
      const totalRow = (await db.prepare(`SELECT COUNT(*) as count FROM stories ${whereClause}`).get(...params)) as { count: number };
      return c.json({ stories: stories.map(parseStoryRow), total: totalRow.count });
    }

    const stories = (await db.prepare(`SELECT * FROM stories ${whereClause} ${orderBy}`).all(...params)) as StoryRow[];
    return c.json({ stories: stories.map(parseStoryRow) });
  });

  // === Get story with version and DNA ===

  app.get("/stories/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const story = (await db.prepare("SELECT * FROM stories WHERE id = ?").get(id)) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);

    const version = story.canonical_version_id
      ? (await db.prepare("SELECT * FROM story_versions WHERE id = ?").get(story.canonical_version_id)) as StoryVersionRow | null
      : null;

    const dna = (await db.prepare("SELECT * FROM story_dna WHERE story_id = ?").get(id)) as StoryDnaRow | null;
    const sources = (await db.prepare("SELECT * FROM story_sources WHERE story_id = ?").all(id)) as Array<{ id: string; story_id: string; source_id: string; title: string; url: string | null; excerpt: string; created_at: string }>;
    const claims = (await db.prepare("SELECT * FROM story_claims WHERE story_id = ?").all(id)) as Array<{ id: string; story_id: string; claim_id: string; claim: string; source_ids: string; confidence: string; created_at: string }>;

    return c.json({
      story: parseStoryRow(story),
      version: version ? { ...version, storyJson: JSON.parse(version.story_json) } : null,
      dna: dna ? parseDnaRow(dna) : null,
      sources,
      claims: claims.map((cl) => ({ ...cl, sourceIds: JSON.parse(cl.source_ids) })),
    });
  });
}
