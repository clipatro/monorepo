import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { noveltySchema } from "../schemas";
import { cosineSimilarity, getEmbeddings } from "../similarity";

// === Novelty context ===

export function registerNoveltyRoutes(app: Hono, _config: AppConfig): void {
  app.post("/novelty", zValidator("json", noveltySchema), async (c) => {
    const { channelId, topic, limit } = c.req.valid("json");
    const db = getDb();

    // Get existing stories for this channel
    const stories = (await db.prepare(`
      SELECT s.id, s.title, sv.story_json
      FROM stories s
      LEFT JOIN story_versions sv ON s.canonical_version_id = sv.id
      WHERE s.channel_id = ? AND s.canonical_version_id IS NOT NULL
      ORDER BY s.approved_at DESC
      LIMIT ?
    `).all(channelId, limit ?? 10)) as Array<{ id: string; title: string; story_json: string | null }>;

    if (stories.length === 0) {
      return c.json({ noveltyContext: "", nearestStories: [] });
    }

    // Get embeddings for the topic and existing stories
    const existingTexts = stories.map((s) => {
      if (s.story_json) {
        const data = JSON.parse(s.story_json) as { title?: string; premise?: string; storyline?: string };
        return `${data.title ?? s.title} ${data.premise ?? ""} ${data.storyline ?? ""}`;
      }
      return s.title;
    });

    try {
      const allTexts = [topic, ...existingTexts];
      const embeddings = await getEmbeddings(allTexts);
      const topicEmbedding = embeddings[0]!;

      const scored = stories.map((s, i) => ({
        id: s.id,
        title: s.title,
        similarity: cosineSimilarity(topicEmbedding, embeddings[i + 1]!),
      })).sort((a, b) => b.similarity - a.similarity);

      const top = scored.slice(0, 5);
      const noveltyContext = top
        .filter((s) => s.similarity > 0.5)
        .map((s) => `- ${s.title} (similarity: ${s.similarity.toFixed(2)})`)
        .join("\n");

      return c.json({ noveltyContext, nearestStories: top });
    } catch {
      // If embedding service is down, return titles as context
      const noveltyContext = stories.slice(0, 5).map((s) => `- ${s.title}`).join("\n");
      return c.json({ noveltyContext, nearestStories: stories.map((s) => ({ id: s.id, title: s.title, similarity: 0 })) });
    }
  });
}
