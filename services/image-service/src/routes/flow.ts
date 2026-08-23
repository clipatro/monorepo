import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  SceneRow, StoryRow, ChannelRow, CharacterVersionRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { flowPromptsSchema } from "../schemas";
import { compilePrompt } from "../prompt-compiler";
import { uuid, sha256, validateImage, saveImageAsset } from "../utils";

// === POST /flow-prompts — generate numbered copy-ready prompts for manual Flow ===

export function registerFlowRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  app.post("/flow-prompts", zValidator("json", flowPromptsSchema), async (c) => {
    const { storyId, aspectRatio } = c.req.valid("json");

    const scenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];
    if (scenes.length === 0) return c.json({ error: "No scenes found — run scene-plan first" }, 400);

    const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(storyId) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);

    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    let characterVersion: CharacterVersionRow | null = null;
    if (story.character_version_id) {
      characterVersion = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(story.character_version_id) as CharacterVersionRow | null;
    }

    const prompts: Array<{
      sceneId: string;
      order: number;
      prompt: string;
      expectedFilename: string;
      isCharacterScene: boolean;
      model: string;
    }> = [];

    for (const scene of scenes) {
      const compiled = await compilePrompt(scene, channel, characterVersion, aspectRatio);
      const ext = "png";
      const expectedFilename = `scene-${String(scene.order).padStart(2, "0")}.${ext}`;
      prompts.push({
        sceneId: scene.id,
        order: scene.order,
        prompt: compiled.prompt,
        expectedFilename,
        isCharacterScene: compiled.isCharacterScene,
        model: compiled.model,
      });
    }

    return c.json({ storyId, aspectRatio, prompts });
  });

  // === POST /flow-import — import manually generated images ===

  app.post("/flow-import", async (c) => {
    const formData = await c.req.formData();
    const sceneId = formData.get("sceneId") as string | null;
    const runId = (formData.get("runId") as string | null) ?? "manual";
    const file = formData.get("file") as File | null;

    if (!sceneId) return c.json({ error: "sceneId is required" }, 400);
    if (!file) return c.json({ error: "No file provided" }, 400);

    const scene = await db.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as SceneRow | null;
    if (!scene) return c.json({ error: "Scene not found" }, 404);

    const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(scene.story_id) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);

    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    const imageBuffer = Buffer.from(await file.arrayBuffer());

    // Validate the imported image
    const validation = validateImage(imageBuffer, file.type, "9:16");
    if (!validation.valid) {
      return c.json({ error: "Image validation failed", details: validation.errors }, 400);
    }

    const checksum = sha256(imageBuffer);

    // Save the image
    const { filePath } = await saveImageAsset(
      channel.id, runId, sceneId, imageBuffer, file.type, config.artifactStorePath,
    );

    // Record the asset (marked as manually imported)
    const assetId = uuid();
    await db.prepare(`
      INSERT INTO assets (
        id, channel_id, run_id, scene_id, type, file_path, mime_type,
        width, height, checksum, provider, model, remote_request_id, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId, channel.id, runId, sceneId, "image",
      filePath, file.type, validation.width, validation.height,
      checksum, "manual", "flow", null, 0,
    );

    return c.json({
      assetId,
      sceneId,
      filePath,
      mimeType: file.type,
      width: validation.width,
      height: validation.height,
      checksum,
      provider: "manual",
      model: "flow",
      validation: { valid: true, errors: [] },
    }, 201);
  });
}
