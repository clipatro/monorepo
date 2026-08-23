import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  SceneRow, StoryRow, ChannelRow, CharacterVersionRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { compilePromptSchema } from "../schemas";
import { compilePrompt } from "../prompt-compiler";
import { uuid, sha256 } from "../utils";
import { getImageProvider } from "../constants";

// === POST /compile-prompt — compile a prompt for a single scene ===

export function registerCompilePromptRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  app.post("/compile-prompt", zValidator("json", compilePromptSchema), async (c) => {
    const { sceneId, aspectRatio } = c.req.valid("json");

    const scene = await db.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as SceneRow | null;
    if (!scene) return c.json({ error: "Scene not found" }, 404);

    const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(scene.story_id) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);

    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    // Get the frozen character version linked to this story
    let characterVersion: CharacterVersionRow | null = null;
    if (story.character_version_id) {
      characterVersion = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(story.character_version_id) as CharacterVersionRow | null;
    }

    const compiled = await compilePrompt(scene, channel, characterVersion, aspectRatio);

    // Store the compiled prompt
    const promptId = uuid();
    const promptHash = sha256(compiled.prompt);
    await db.prepare(`
      INSERT INTO image_prompts (id, scene_id, compiled_prompt, provider, model, prompt_hash, reference_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      promptId, sceneId, compiled.prompt, getImageProvider(), compiled.model,
      promptHash, JSON.stringify(compiled.referenceIds),
    );

    return c.json({
      promptId,
      prompt: compiled.prompt,
      isCharacterScene: compiled.isCharacterScene,
      model: compiled.model,
      referenceIds: compiled.referenceIds,
      promptHash,
    });
  });
}
