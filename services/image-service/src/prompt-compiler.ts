import { getDb } from "@automation/database";
import type {
  SceneRow, CharacterVersionRow, ChannelRow, SceneCharacterRow,
  CharacterReferenceRow,
} from "@automation/database";
import { getCharacterSceneModel, getNonCharacterSceneModel } from "./constants";
import type { CompiledPrompt } from "./types";

// === Constants ===

/**
 * Maximum reference images per generation request.
 * Allocated as: 1 portrait per character (up to 3) + 1 last-scene image.
 * With 3 characters: 3 portraits + 1 last-scene = 4 (full).
 * With 2 characters: 2 portraits + 1 last-scene = 3 (1 spare for extra portrait).
 * With 1 character: 1 portrait + 1 last-scene = 2 (2 spare for extra portraits).
 * With 0 characters: 0 portraits + 1 last-scene = 1 (non-character scene).
 */
const MAX_REFERENCES = 4;
const MAX_CHARACTERS_PER_SCENE = 3;

// === Prompt Compiler ===

/**
 * Build a detailed character identity block from the bible.
 * Includes physical traits, wardrobe, and visual style — everything the
 * image model needs to maintain consistency across scenes.
 */
function buildCharacterIdentity(bible: Record<string, unknown>): string {
  const name = typeof bible.name === "string" && bible.name.trim() ? bible.name.trim() : "the recurring character";
  const traits: string[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) traits.push(`${label}: ${value.trim()}`);
    if (typeof value === "number") traits.push(`${label}: ${value}`);
    if (Array.isArray(value) && value.length > 0) traits.push(`${label}: ${value.join(", ")}`);
  };

  // Physical identity (immutable)
  add("apparent age", bible.age);
  add("gender presentation", bible.gender);
  add("heritage", bible.heritage ?? bible.ethnicity);
  add("skin tone", bible.skinTone);
  add("face shape", bible.faceShape ?? bible.facialFeatures);
  add("eye color", bible.eyeColor);
  add("hair color", bible.hairColor);
  add("hairstyle", bible.hairStyle);
  add("facial hair", bible.facialHair);
  add("build", bible.build);
  add("distinguishing features", bible.distinguishingFeatures);

  // Wardrobe (canonical — must be consistent across scenes)
  if (bible.wardrobe) {
    if (typeof bible.wardrobe === "string") {
      add("canonical wardrobe", bible.wardrobe);
    } else if (typeof bible.wardrobe === "object" && bible.wardrobe !== null) {
      const wardrobeItems = Object.entries(bible.wardrobe as Record<string, unknown>)
        .map(([key, val]) => `${key}: ${val}`)
        .join("; ");
      if (wardrobeItems) add("canonical wardrobe", wardrobeItems);
    }
  }

  // Immutable traits (if specified)
  add("immutable traits", bible.immutableTraits);

  // Visual style
  add("visual style", bible.visualStyle);

  // Expression baseline
  add("default expression", bible.expression);

  return traits.length > 0 ? `${name} — ${traits.join("; ")}` : name;
}

/**
 * Select the best single portrait reference for a character version.
 * Priority: front > three-quarter > side > expression > first available.
 * We send only 1 portrait per character to stay within the 4-reference limit.
 */
function selectBestPortrait(refs: CharacterReferenceRow[]): CharacterReferenceRow | null {
  if (refs.length === 0) return null;
  const priority = ["front", "three-quarter", "side", "expression"];
  for (const role of priority) {
    const ref = refs.find((r) => r.role === role);
    if (ref) return ref;
  }
  return refs[0]!;
}

/**
 * Compile a 10-part structured prompt for a scene.
 *
 * Reference image allocation strategy (max 4 references per request):
 *   - 1 portrait per character mentioned in the scene (up to 3 characters)
 *   - 1 slot reserved for the last-scene image (visual continuity)
 *   - If fewer than 3 characters, spare slots go to additional portraits
 *     of the first character (for stronger identity)
 *
 * The prompt includes the FULL character bible for each character — physical
 * traits, canonical wardrobe, visual style — so the model has a text description
 * to anchor identity even beyond what the reference images show.
 */
async function compilePrompt(
  scene: SceneRow,
  channel: ChannelRow,
  characterVersion: CharacterVersionRow | null,
  aspectRatio: string,
  characterModelOverride?: string,
  nonCharacterModelOverride?: string,
): Promise<CompiledPrompt> {
  const db = getDb();

  // Check for multi-character scene assignments (Phase 7)
  const sceneCharacters = await db.prepare(
    'SELECT * FROM scene_characters WHERE scene_id = ? ORDER BY "order" ASC',
  ).all(scene.id) as SceneCharacterRow[];

  // Cap at 3 characters per scene (matches the channel-level limit)
  const cappedSceneCharacters = sceneCharacters.slice(0, MAX_CHARACTERS_PER_SCENE);
  if (sceneCharacters.length > MAX_CHARACTERS_PER_SCENE) {
    console.warn(
      `[image-service] Scene ${scene.id} has ${sceneCharacters.length} characters — capping to ${MAX_CHARACTERS_PER_SCENE}`,
    );
  }

  const hasMultiCharacters = cappedSceneCharacters.length > 0;

  const isCharacterScene = scene.image_requirement === "character_scene" && (!!characterVersion || hasMultiCharacters);
  const model = isCharacterScene
    ? (characterModelOverride ?? getCharacterSceneModel())
    : (nonCharacterModelOverride ?? getNonCharacterSceneModel());

  const [aw, ah] = aspectRatio.split(":").map(Number);
  const orientation = aw && ah && ah > aw ? "Vertical" : aw && ah && aw > ah ? "Horizontal" : "Square";
  const parts: string[] = [];

  // 1. Provider instruction
  parts.push(`Create one authentic editorial photograph of a real, physically present moment. The result should feel captured by a human photographer in a real location, not rendered, illustrated, composited, staged as stock photography, or generated by AI. Depict one frame and one moment only. No text, watermark, border, logo, collage, or split screen.`);

  // 2. Character identity / reference
  // Collect character info for reference image allocation
  interface CharacterRefInfo {
    versionId: string;
    name: string;
    bible: Record<string, unknown>;
    bestPortrait: CharacterReferenceRow | null;
    allRefs: CharacterReferenceRow[];
  }

  const characterInfos: CharacterRefInfo[] = [];

  if (hasMultiCharacters) {
    // Multi-character scene — build identity blocks for each character
    const subjectBlocks: string[] = [];
    for (let i = 0; i < cappedSceneCharacters.length; i++) {
      const sc = cappedSceneCharacters[i]!;
      let bible: Record<string, unknown> = { name: sc.character_name };
      let versionId: string | null = sc.character_version_id;

      if (versionId) {
        const version = await db.prepare("SELECT * FROM character_versions WHERE id = ?").get(versionId) as CharacterVersionRow | null;
        if (version) {
          try {
            bible = JSON.parse(version.bible) as Record<string, unknown>;
          } catch {
            bible = { name: sc.character_name };
          }
        }
      }

      const identity = buildCharacterIdentity(bible);
      subjectBlocks.push(`Subject ${i + 1} — ${identity}
Role in scene: ${sc.role_in_scene}. Pose: ${sc.pose_and_expression || "natural for the situation"}.`);

      // Collect reference images for this character
      if (versionId) {
        const allRefs = await db.prepare(
          "SELECT * FROM character_references WHERE character_version_id = ? ORDER BY created_at ASC",
        ).all(versionId) as CharacterReferenceRow[];
        const bestPortrait = selectBestPortrait(allRefs);
        characterInfos.push({
          versionId,
          name: sc.character_name,
          bible,
          bestPortrait,
          allRefs,
        });
      }
    }

    parts.push(`CHARACTER IDENTITY LOCK — MULTIPLE SUBJECTS:
This scene features ${cappedSceneCharacters.length} character${cappedSceneCharacters.length > 1 ? "s" : ""}. Each character's portrait reference image is provided (one per character). Match each reference image to the subject description below, in order.

${subjectBlocks.join("\n\n")}

CRITICAL CONSISTENCY RULES:
- Each subject must maintain their own identity from their portrait reference. Do not blend features between subjects.
- Preserve distinct faces, hair, skin tone, build, and CANONICAL WARDROBE for each person as described above.
- The wardrobe described in each character's identity block is their canonical outfit — use it exactly unless the scene explicitly requires a change.
- Treat each subject as the same real actor photographed in a new situation, never as a redesign, look-alike, beautified version, or reinterpretation.
- If a previous scene image is provided as the last reference, use it for visual continuity of lighting, environment, and composition — but maintain each character's identity from their own portrait.`);
  } else if (isCharacterScene && characterVersion) {
    // Single character scene (legacy path)
    const bible = JSON.parse(characterVersion.bible) as Record<string, unknown>;
    const characterIdentity = buildCharacterIdentity(bible);

    // Collect reference images
    const allRefs = await db.prepare(
      "SELECT * FROM character_references WHERE character_version_id = ? ORDER BY created_at ASC",
    ).all(characterVersion.id) as CharacterReferenceRow[];
    const bestPortrait = selectBestPortrait(allRefs);
    characterInfos.push({
      versionId: characterVersion.id,
      name: typeof bible.name === "string" ? bible.name : "the character",
      bible,
      bestPortrait,
      allRefs,
    });

    parts.push(`CHARACTER IDENTITY LOCK:
Use the provided portrait reference image as strict evidence of the same person's identity. Preserve the exact face, facial proportions, natural asymmetry, apparent age, skin tone and texture, eyes, hair, body proportions, distinguishing features, and canonical wardrobe shown by the reference and described below.

Stored identity: ${characterIdentity}.

The reference image and identity description override any conflicting visual interpretation. Treat the subject as the same real actor photographed in a new situation, never as a redesign, look-alike, beautified version, or reinterpretation. Change only the action, restrained expression, pose, camera position, and environment required by this scene.

CANONICAL WARDROBE: The wardrobe described above is this character's canonical outfit. Use it exactly unless the scene explicitly requires a change. Do not invent new clothing or alter the outfit arbitrarily.

If a previous scene image is provided as the last reference, use it for visual continuity of lighting, environment, and composition — but maintain this character's identity from their portrait reference.`);
  } else {
    parts.push("SUBJECT RULE: This is a non-character scene. Do not introduce any recurring character. Do not add a prominent person unless the visual event explicitly requires one; anonymous background people must remain incidental and natural.");
  }

  // 3. Channel visual-style (includes D008 realistic block)
  if (channel.visual_style) {
    parts.push(channel.visual_style);
  } else {
    parts.push("STYLE: Natural documentary/editorial photography, restrained color, available light, realistic skin and materials, ordinary imperfections, and no glossy advertising finish.");
  }

  // 4. Scene action
  parts.push(`SCENE: Depict a single decisive moment — ${scene.visual_event}
Show the precise action or consequence described here. Do not combine earlier and later events, create a montage, or add generic symbolic objects.`);

  // 5. Environment
  parts.push(`ENVIRONMENT: ${scene.environment}
Make the location specific, inhabited, and physically coherent. Props, weather, surfaces, reflections, and background activity must belong to this exact place and moment.`);

  // 6. Pose / expression
  if (isCharacterScene && !hasMultiCharacters) {
    parts.push(`BODY LANGUAGE AND EXPRESSION: ${scene.pose_and_expression}
Keep emotion restrained and observable through posture, gaze, facial tension, and hand placement. Avoid theatrical posing, influencer expressions, and direct-to-camera smiling unless explicitly requested.`);
  }

  // 7. Camera / lens
  parts.push(`CAMERA: ${scene.camera_framing}
Use plausible photographic perspective, a level horizon unless the scene requires otherwise, believable depth of field, and a clear focal subject. Avoid extreme lens distortion and arbitrary Dutch angles.`);

  // 8. Lighting / mood
  parts.push(`LIGHT AND MOOD: ${scene.lighting_and_mood}
All illumination, shadows, reflections, catchlights, and color temperature must come from plausible sources in the environment. Keep grading restrained; no synthetic glow or exaggerated HDR.`);

  // 9. Aspect ratio
  const mobileGuidance = orientation === "Vertical"
    ? "Keep the face, hands, and essential action inside the central mobile-safe area. Avoid placing critical details against the extreme top, bottom, or side edges; use peripheral space for natural environment rather than artificial emptiness."
    : "Keep the focal action immediately legible and compose peripheral space from the real environment.";
  parts.push(`OUTPUT COMPOSITION: ${orientation} ${aspectRatio}. ${mobileGuidance} The image must remain clear at phone-screen size.`);

  // 10. Negative constraints
  parts.push("PHYSICAL AND REALISM CHECK: Hands, fingers, limbs, eyes, teeth when visible, hair, clothing seams, object contact points, reflections, shadows, perspective, and background geometry must be anatomically and physically coherent. Preserve natural pores, fine hair, fabric weave, small asymmetries, and believable wear. Avoid plastic skin, waxy faces, beauty retouching, duplicated features, merged objects, malformed anatomy, floating props, impossible reflections, fake blur, excessive bokeh, oversharpening, HDR, cinematic glow, CGI, illustration, painterly texture, and synthetic-looking details.");

  // 10b. Scene continuity note (when last-scene image will be provided)
  if (isCharacterScene) {
    parts.push("SCENE CONTINUITY: If a previous scene image is provided as the last reference image, maintain visual continuity — match the lighting direction, color temperature, environment textures, and character wardrobe from the previous scene. The scene should feel like the next frame in the same location, not a jump to a different setting.");
  }

  const prompt = parts.join("\n\n");

  // === Reference image allocation ===
  // Strategy: 1 portrait per character + 1 slot for last-scene image = max 4
  // Spare slots (when < 3 characters) go to extra portraits of the first character
  const referenceIds: string[] = [];

  // Add 1 best portrait per character
  for (const info of characterInfos) {
    if (info.bestPortrait) {
      referenceIds.push(info.bestPortrait.id);
    }
  }

  // Fill spare slots with extra portraits of the first character (for stronger identity)
  // Reserve 1 slot for the last-scene image (added by generate.ts at request time)
  const portraitSlotsUsed = referenceIds.length;
  const slotsForLastScene = isCharacterScene ? 1 : 0;
  const spareSlots = MAX_REFERENCES - portraitSlotsUsed - slotsForLastScene;

  if (spareSlots > 0 && characterInfos.length > 0) {
    const firstChar = characterInfos[0]!;
    const extraRefs = firstChar.allRefs
      .filter((r) => !referenceIds.includes(r.id))
      .slice(0, spareSlots);
    referenceIds.push(...extraRefs.map((r) => r.id));
  }

  return { prompt, isCharacterScene, model, referenceIds };
}

export { buildCharacterIdentity, compilePrompt, MAX_CHARACTERS_PER_SCENE, MAX_REFERENCES };
