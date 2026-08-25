/**
 * Flow prompt compiler — compiles Google Flow-optimized prompts for scenes.
 *
 * Flow prompts differ from Gemini/Flux prompts:
 *   - Shorter and more visual (Flow's prompt box has limited space)
 *   - Character names are included explicitly (Flow uses its Characters feature)
 *   - No 10-part negative constraints (Flow doesn't need them)
 *   - Includes "4s video" or "static image" instruction based on media_type
 *   - Camera direction is concise (Flow understands natural language)
 *
 * Used by the `flow_prompt_compilation` workflow step (Phase 9, D021).
 */

import { getDb } from "@automation/database";
import type {
  SceneRow,
  CharacterVersionRow,
  ChannelRow,
  SceneCharacterRow,
} from "@automation/database";

// === Types ===

export interface FlowCompiledPrompt {
  sceneId: string;
  order: number;
  prompt: string;
  mediaType: "video-clip" | "image";
  expectedFilename: string;
  isCharacterScene: boolean;
  characterNames: string[];
}

export interface FlowPromptResult {
  storyId: string;
  prompts: FlowCompiledPrompt[];
}

// === Flow prompt compiler ===

/**
 * Compile a Flow-optimized prompt for a single scene.
 *
 * Flow prompts are structured as:
 *   [Character names] + [Visual action/scene description] + [Environment] +
 *   [Camera direction] + [Lighting/mood] + [Media type instruction]
 *
 * The prompt is concise (target: 1-3 sentences) and uses natural language
 * that Flow's model understands well.
 */
export async function compileFlowPrompt(
  scene: SceneRow,
  channel: ChannelRow,
  characterVersion: CharacterVersionRow | null,
): Promise<FlowCompiledPrompt> {
  const db = getDb();

  // Check for multi-character scene assignments
  const sceneCharacters = await db.prepare(
    'SELECT * FROM scene_characters WHERE scene_id = ? ORDER BY "order" ASC',
  ).all(scene.id) as SceneCharacterRow[];

  const mediaType = (scene.media_type === "image" ? "image" : "video-clip") as "video-clip" | "image";
  const isCharacterScene = scene.image_requirement === "character_scene" && (!!characterVersion || sceneCharacters.length > 0);

  // Collect character names
  const characterNames: string[] = [];
  if (sceneCharacters.length > 0) {
    for (const sc of sceneCharacters) {
      characterNames.push(sc.character_name);
    }
  } else if (characterVersion) {
    const bible = characterVersion.bible ? JSON.parse(characterVersion.bible) : {};
    if (typeof bible.name === "string" && bible.name.trim()) {
      characterNames.push(bible.name.trim());
    }
  }

  // Build the prompt parts
  const parts: string[] = [];

  // 1. Character names (Flow uses its Characters feature — just name them)
  if (characterNames.length > 0) {
    parts.push(characterNames.join(" and "));
  }

  // 2. Visual action / scene description
  if (scene.visual_event) {
    parts.push(scene.visual_event);
  }

  // 3. Environment
  if (scene.environment) {
    parts.push(`Setting: ${scene.environment}`);
  }

  // 4. Camera direction (concise)
  if (scene.camera_framing) {
    parts.push(`Camera: ${scene.camera_framing}`);
  }

  // 5. Lighting and mood
  if (scene.lighting_and_mood) {
    parts.push(`Lighting: ${scene.lighting_and_mood}`);
  }

  // 6. Pose and expression (for character scenes)
  if (isCharacterScene && scene.pose_and_expression) {
    parts.push(`Expression: ${scene.pose_and_expression}`);
  }

  // 7. Media type instruction
  if (mediaType === "video-clip") {
    parts.push("4-second video clip, cinematic motion");
  } else {
    parts.push("Static image, photographable moment");
  }

  // 8. Channel visual style (if set)
  if (channel.visual_style) {
    parts.push(`Style: ${channel.visual_style}`);
  }

  // 9. Aspect ratio
  parts.push(`Aspect ratio: ${channel.aspect_ratio}`);

  const prompt = parts.join(", ");

  // Expected filename
  const ext = mediaType === "video-clip" ? "mp4" : "png";
  const expectedFilename = `scene-${String(scene.order).padStart(2, "0")}.${ext}`;

  return {
    sceneId: scene.id,
    order: scene.order,
    prompt,
    mediaType,
    expectedFilename,
    isCharacterScene,
    characterNames,
  };
}

/**
 * Compile Flow prompts for all scenes in a story.
 */
export async function compileFlowPromptsForStory(
  storyId: string,
): Promise<FlowPromptResult> {
  const db = getDb();

  const scenes = await db.prepare(
    'SELECT * FROM scenes WHERE story_id = ? ORDER BY "order" ASC',
  ).all(storyId) as SceneRow[];

  if (scenes.length === 0) {
    return { storyId, prompts: [] };
  }

  const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(storyId) as { channel_id: string; character_version_id: string | null } | null;
  if (!story) {
    return { storyId, prompts: [] };
  }

  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").get(story.channel_id) as ChannelRow | null;
  if (!channel) {
    return { storyId, prompts: [] };
  }

  let characterVersion: CharacterVersionRow | null = null;
  if (story.character_version_id) {
    characterVersion = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(story.character_version_id) as CharacterVersionRow | null;
  }

  const prompts: FlowCompiledPrompt[] = [];
  for (const scene of scenes) {
    const compiled = await compileFlowPrompt(scene, channel, characterVersion);
    prompts.push(compiled);
  }

  return { storyId, prompts };
}
