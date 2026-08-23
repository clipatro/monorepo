import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  SceneRow, StoryRow, ChannelRow, CharacterVersionRow, CharacterReferenceRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { checkBudget, estimateImageCost } from "@automation/cost-tracker";
import { generateSchema, generateBatchSchema } from "../schemas";
import { compilePrompt } from "../prompt-compiler";
import { generateWithGeminiFlashImage } from "../adapters/gemini-flash-image";
import { generateWithFal } from "../adapters/fal-image";
import { uuid, sha256, validateImage, saveImageAsset } from "../utils";
import {
  getCharacterSceneModel,
  getNonCharacterSceneModel,
  getFallbackModel,
  getImageProvider,
} from "../constants";

// === POST /generate — generate an image for a single scene ===

export function registerGenerateRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  app.post("/generate", zValidator("json", generateSchema), async (c) => {
    const { sceneId, runId, stepId, aspectRatio, temperature, customPrompt, prevSceneImagePath, imageProvider: reqImageProvider, imageModelCharacter, imageModelNonCharacter } = c.req.valid("json");

    const scene = await db.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as SceneRow | null;
    if (!scene) return c.json({ error: "Scene not found" }, 404);

    const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(scene.story_id) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);

    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    // Get the frozen character version
    let characterVersion: CharacterVersionRow | null = null;
    if (story.character_version_id) {
      characterVersion = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(story.character_version_id) as CharacterVersionRow | null;
    }

    // Compile the prompt — or use the custom prompt override if provided
    // Use per-request overrides if provided, otherwise fall back to env vars / defaults
    const imageProvider = reqImageProvider === "gemini" ? "gemini" : (reqImageProvider === "fal" ? "fal" : getImageProvider());
    const characterModel = imageModelCharacter ?? getCharacterSceneModel(imageProvider);
    const nonCharacterModel = imageModelNonCharacter ?? getNonCharacterSceneModel(imageProvider);
    const compiled = customPrompt && customPrompt.trim().length > 0
      ? {
          prompt: customPrompt.trim(),
          isCharacterScene: scene.image_requirement === "character_scene" && !!characterVersion,
          model: scene.image_requirement === "character_scene" && characterVersion
            ? characterModel
            : nonCharacterModel,
          referenceIds: [] as string[],
        }
      : await compilePrompt(scene, channel, characterVersion, aspectRatio, characterModel, nonCharacterModel);

    // Load reference images for character scenes.
    // The prompt compiler allocates reference slots: 1 portrait per character
    // (up to 3) + spare slots for extra portraits of the first character.
    // We load exactly the refs in compiled.referenceIds — NOT all refs of one version.
    const references: Array<{ buffer: Buffer; mimeType: string }> = [];
    if (compiled.isCharacterScene && compiled.referenceIds.length > 0) {
      // Load specific reference images by ID (in the order the compiler chose)
      const placeholders = compiled.referenceIds.map(() => "?").join(",");
      const refs = await db.prepare(
        `SELECT * FROM character_references WHERE id IN (${placeholders}) ORDER BY created_at ASC`,
      ).all(...(compiled.referenceIds as never[])) as CharacterReferenceRow[];
      // Sort by the order in compiled.referenceIds to preserve the compiler's allocation
      const refMap = new Map(refs.map((r) => [r.id, r]));
      for (const refId of compiled.referenceIds) {
        const ref = refMap.get(refId);
        if (!ref) continue;
        try {
          const buffer = await Bun.file(ref.file_path).arrayBuffer();
          references.push({ buffer: Buffer.from(buffer), mimeType: ref.mime_type });
        } catch (err) {
          console.warn(`[image-service] Could not load reference ${ref.file_path}: ${err}`);
        }
      }
    }

    // Append the previous scene's generated image as the last reference
    // for visual continuity (lighting, environment, composition).
    // This is the final slot in the 4-reference budget.
    if (prevSceneImagePath) {
      try {
        const buffer = await Bun.file(prevSceneImagePath).arrayBuffer();
        references.push({ buffer: Buffer.from(buffer), mimeType: "image/jpeg" });
        console.log(`[image-service] Loaded prev scene image for continuity: ${prevSceneImagePath}`);
      } catch (err) {
        console.warn(`[image-service] Could not load prev scene image ${prevSceneImagePath}: ${err}`);
      }
    }

    // Store the compiled prompt
    const promptId = uuid();
    const promptHash = sha256(compiled.prompt);
    await db.prepare(`
      INSERT INTO image_prompts (id, scene_id, compiled_prompt, provider, model, prompt_hash, reference_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      promptId, sceneId, compiled.prompt, imageProvider, compiled.model,
      promptHash, JSON.stringify(compiled.referenceIds),
    );

    try {
      // Generate the image — dispatch to the active provider's adapter.
      // Try the primary model first, fall back to the provider's fallback model if it fails.
      let result;
      let usedModel = compiled.model;
      let usedFallback = false;
      const fallbackModel = getFallbackModel();

      try {
        if (imageProvider === "fal") {
          result = await generateWithFal(
            config.falApiKey ?? "",
            compiled.model,
            compiled.prompt,
            references,
            temperature,
            runId,
            stepId,
            aspectRatio,
          );
        } else {
          result = await generateWithGeminiFlashImage(
            config.geminiApiKey ?? "",
            compiled.model,
            compiled.prompt,
            references,
            temperature,
            runId,
            stepId,
            aspectRatio,
          );
        }
      } catch (primaryErr) {
        // If the primary model fails, fall back to the provider's fallback model
        console.warn(`[image-service] Primary model ${compiled.model} failed, falling back to ${fallbackModel}: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`);
        if (imageProvider === "fal") {
          result = await generateWithFal(
            config.falApiKey ?? "",
            fallbackModel,
            compiled.prompt,
            references,
            temperature,
            runId,
            stepId,
            aspectRatio,
          );
        } else {
          result = await generateWithGeminiFlashImage(
            config.geminiApiKey ?? "",
            fallbackModel,
            compiled.prompt,
            [],
            temperature,
            runId,
            stepId,
            aspectRatio,
          );
        }
        usedModel = fallbackModel;
        usedFallback = true;
      }

      // Validate the image
      const validation = validateImage(result.imageBuffer, result.mimeType, aspectRatio);
      if (!validation.valid) {
        console.warn(`[image-service] Image validation warnings: ${validation.errors.join("; ")}`);
      }

      // Save the image to the artifact store.
      // Use "manual" as the directory name when no runId is provided,
      // but store NULL in the database run_id column (FK to workflow_runs).
      const effectiveRunId = runId ?? "manual";
      const { filePath } = await saveImageAsset(
        channel.id, effectiveRunId, sceneId,
        result.imageBuffer, result.mimeType, config.artifactStorePath,
      );

      // Record the asset in the database
      const assetId = uuid();
      await db.prepare(`
        INSERT INTO assets (
          id, channel_id, run_id, scene_id, type, file_path, mime_type,
          width, height, checksum, provider, model, remote_request_id, cost_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        assetId, channel.id, runId ?? null, sceneId, "image",
        filePath, result.mimeType, result.width, result.height,
        result.checksum, imageProvider, usedModel, result.remoteRequestId, result.costUsd,
      );

      return c.json({
        assetId,
        sceneId,
        promptId,
        filePath,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        checksum: result.checksum,
        costUsd: result.costUsd,
        model: usedModel,
        isCharacterScene: compiled.isCharacterScene,
        fallbackUsed: usedFallback,
        validation: { valid: validation.valid, errors: validation.errors },
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[image-service] Generate failed for scene ${sceneId}: ${msg}`);
      return c.json({ error: "Image generation failed", details: msg }, 500);
    }
  });

  // === POST /generate-batch — generate images for all scenes in a story ===

  app.post("/generate-batch", zValidator("json", generateBatchSchema), async (c) => {
    const { storyId, runId, stepId, aspectRatio, temperature, estimateOnly, imageProvider: reqImageProvider, imageModelCharacter, imageModelNonCharacter } = c.req.valid("json");

    const scenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];
    if (scenes.length === 0) return c.json({ error: "No scenes found — run scene-plan first" }, 400);

    // Compute a per-scene cost estimate before any paid calls.
    // Character scenes use the character model; non-character scenes use the non-character model.
    const charModel = getCharacterSceneModel();
    const nonCharModel = getNonCharacterSceneModel();
    const sceneEstimates = scenes.map((s) => {
      const isCharacterScene = s.image_requirement === "character_scene";
      const model = isCharacterScene ? charModel : nonCharModel;
      // Assume 1k resolution tier for estimation (most common for 9:16 short-form)
      const perImage = estimateImageCost(model, 1, "1k");
      return { sceneId: s.id, order: s.order, model, estimatedCostUsd: perImage };
    });
    const estimatedTotalCostUsd = sceneEstimates.reduce((sum, e) => sum + e.estimatedCostUsd, 0);

    // In estimate-only mode, return the cost breakdown without generating.
    if (estimateOnly) {
      return c.json({
        storyId,
        sceneCount: scenes.length,
        estimatedTotalCostUsd,
        sceneEstimates,
        budget: {
          perRun: config.costBudgetPerRun,
          perDay: config.costBudgetPerDay,
          global: config.costBudgetGlobal,
        },
      });
    }

    // Check budget for the full batch upfront before any paid calls.
    try {
      checkBudget(estimatedTotalCostUsd, { runId });
    } catch (err) {
      return c.json({
        error: "Budget exceeded for batch image generation",
        estimatedTotalCostUsd,
        sceneEstimates,
        details: err instanceof Error ? err.message : String(err),
      }, 402);
    }

    const results: Array<Record<string, unknown>> = [];
    const errors: Array<{ sceneId: string; order: number; error: string }> = [];

    // Track the last generated scene's image path to pass as a reference
    // to the next scene for visual continuity (lighting, environment, wardrobe).
    let prevSceneImagePath: string | undefined;

    for (const scene of scenes) {
      try {
        // Use relative URL — the batch endpoint calls itself
        const res = await fetch(`http://127.0.0.1:${config.port}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: scene.id,
            runId,
            stepId,
            aspectRatio,
            temperature,
            imageProvider: reqImageProvider,
            imageModelCharacter,
            imageModelNonCharacter,
            // Pass the previous scene's image path for visual continuity
            prevSceneImagePath,
          }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (res.ok) {
          results.push(data);
          // Update prevSceneImagePath for the next scene
          if (data.filePath && typeof data.filePath === "string") {
            prevSceneImagePath = data.filePath;
          }
        } else {
          errors.push({ sceneId: scene.id, order: scene.order, error: (data.error as string) ?? "unknown" });
        }
      } catch (err) {
        errors.push({ sceneId: scene.id, order: scene.order, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return c.json({
      storyId,
      generated: results.length,
      errors,
      results,
      estimatedTotalCostUsd,
      actualTotalCostUsd: (results as Array<{ costUsd?: number }>).reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    });
  });
}
