import type { Hono } from "@automation/server";
import type { AppConfig } from "@automation/server";
import type { LlmClient, CharacterRosterEntry } from "@automation/contracts";
import { getDb } from "@automation/database";
import type {
  StoryRow, StoryVersionRow, ChannelRow,
  CharacterRow, CharacterVersionRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { scenePlanSchema } from "../schemas";
import { planScenes } from "../scene-planner";
import { uuid } from "../utils";

// === POST /scene-plan — plan scenes from an approved story ===

/**
 * Build the channel's character roster for scene planning.
 * Queries the channel_characters junction table (with legacy fallback).
 *
 * Enforces a maximum of 3 characters per channel for image generation.
 * The 4-reference-image limit per prompt is allocated as:
 *   - 1 portrait reference per character (up to 3)
 *   - 1 last-scene image for visual continuity
 * With more than 3 characters, the model cannot maintain identity
 * consistency, so we cap the roster at 3 (first 3 by add order).
 */
const MAX_CHARACTERS_PER_CHANNEL = 3;

async function buildRosterForScenePlan(channelId: string): Promise<CharacterRosterEntry[]> {
  const db = getDb();

  let characterIdRows: Array<{ character_id: string }> = await db.prepare(
    "SELECT character_id FROM channel_characters WHERE channel_id = ? ORDER BY added_at ASC",
  ).all(channelId) as Array<{ character_id: string }>;

  if (characterIdRows.length === 0) {
    characterIdRows = await db.prepare(
      "SELECT id as character_id FROM characters WHERE channel_id = ? ORDER BY created_at ASC",
    ).all(channelId) as Array<{ character_id: string }>;
  }

  // Enforce 3-character limit — take the first 3 by add order
  if (characterIdRows.length > MAX_CHARACTERS_PER_CHANNEL) {
    console.warn(
      `[image-service] Channel has ${characterIdRows.length} characters — capping roster to ${MAX_CHARACTERS_PER_CHANNEL} for image consistency`,
    );
    characterIdRows = characterIdRows.slice(0, MAX_CHARACTERS_PER_CHANNEL);
  }

  const roster: CharacterRosterEntry[] = [];
  for (const { character_id } of characterIdRows) {
    const char = await db.prepare("SELECT * FROM characters WHERE id = ?").get(character_id) as CharacterRow | null;
    if (!char) continue;

    const frozenVersion = await db.prepare(
      "SELECT * FROM character_versions WHERE character_id = ? AND status = 'frozen' ORDER BY version DESC LIMIT 1",
    ).get(character_id) as CharacterVersionRow | null;

    const latestVersion = frozenVersion ?? await db.prepare(
      "SELECT * FROM character_versions WHERE character_id = ? ORDER BY version DESC LIMIT 1",
    ).get(character_id) as CharacterVersionRow | null;

    let bible: Record<string, unknown> = { name: char.name };
    if (latestVersion) {
      try {
        bible = JSON.parse(latestVersion.bible) as Record<string, unknown>;
      } catch {
        bible = { name: char.name };
      }
    }

    const refCount = latestVersion
      ? (await db.prepare("SELECT COUNT(*) as count FROM character_references WHERE character_version_id = ?").get(latestVersion.id) as { count: number }).count
      : 0;

    roster.push({
      characterId: char.id,
      name: char.name,
      role: char.role,
      bible: bible as unknown as CharacterRosterEntry["bible"],
      hasReferenceImages: refCount > 0,
      frozenVersionId: frozenVersion?.id ?? null,
      autoCreated: char.auto_created === 1,
    } as CharacterRosterEntry);
  }
  return roster;
}

/**
 * Resolve a character name to its frozen character version ID from the roster.
 */
function resolveCharacterVersionId(name: string, roster: CharacterRosterEntry[]): string | null {
  const entry = roster.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return entry?.frozenVersionId ?? null;
}

export function registerScenePlanRoutes(app: Hono, config: AppConfig, client: LlmClient): void {
  const db = getDb();

  app.post("/scene-plan", zValidator("json", scenePlanSchema), async (c) => {
    const { storyId, runId, stepId, scenePlanConfig, llmProvider, llmModel } = c.req.valid("json");

    const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(storyId) as StoryRow | null;
    if (!story) return c.json({ error: "Story not found" }, 404);
    if (!story.canonical_version_id) return c.json({ error: "Story has no canonical version" }, 400);

    const storyVersion = await db.prepare("SELECT * FROM story_versions WHERE id = ?").get(story.canonical_version_id) as StoryVersionRow | null;
    if (!storyVersion) return c.json({ error: "Story version not found" }, 404);

    const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    try {
      const claims = await db.prepare(
        "SELECT claim_id AS id, claim FROM story_claims WHERE story_id = ? ORDER BY created_at ASC",
      ).all(storyId) as Array<{ id: string; claim: string }>;

      // Build character roster for multi-character scene planning
      const roster = await buildRosterForScenePlan(story.channel_id);

      const plan = await planScenes(
        client,
        story,
        storyVersion,
        channel,
        claims,
        roster,
        runId,
        stepId,
        llmProvider,
        llmModel,
        scenePlanConfig,
      );

      // Delete existing scenes and scene_characters for this story (idempotent re-plan)
      await db.prepare("DELETE FROM scene_characters WHERE scene_id IN (SELECT id FROM scenes WHERE story_id = ?)").run(storyId);
      await db.prepare("DELETE FROM scenes WHERE story_id = ?").run(storyId);

      // Insert scenes + scene_characters
      const scenes: Array<{ id: string; order: number }> = [];
      for (const s of plan.scenes) {
        const id = uuid();
        await db.prepare(`
          INSERT INTO scenes (
            id, story_id, "order", story_purpose, narration_text, visual_event,
            character_role, pose_and_expression, environment, camera_framing,
            lighting_and_mood, expected_duration_seconds, image_requirement, source_claim_ids
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, storyId, s.order, s.storyPurpose, s.narrationText, s.visualEvent,
          s.characterRole, s.poseAndExpression, s.environment, s.cameraFraming,
          s.lightingAndMood, s.expectedDurationSeconds, s.imageRequirement,
          JSON.stringify(s.sourceClaimIds ?? []),
        );
        scenes.push({ id, order: s.order });

        // Store scene_characters for multi-character support
        if (s.characters && Array.isArray(s.characters)) {
          for (let i = 0; i < s.characters.length; i++) {
            const sc = s.characters[i]!;
            const versionId = resolveCharacterVersionId(sc.name, roster);
            await db.prepare(`
              INSERT INTO scene_characters (id, scene_id, character_version_id, character_name, role_in_scene, pose_and_expression, "order", created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, now())
            `).run(uuid(), id, versionId, sc.name, sc.roleInScene, sc.poseAndExpression, i);
          }
        }
      }

      return c.json({
        storyId,
        sceneCount: scenes.length,
        scenes,
        provider: plan.provider,
        model: plan.model,
        costUsd: plan.costUsd,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Scene planning failed", details: msg }, 500);
    }
  });
}
