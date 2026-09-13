import { getDb } from "@automation/database";
import type {
  SceneRow, CharacterVersionRow, ChannelRow, SceneCharacterRow,
  CharacterReferenceRow,
} from "@automation/database";
import { getCharacterSceneModel, getNonCharacterSceneModel } from "./constants";
import { buildKidsImagePrompt } from "./kids-image";
import type { CompiledPrompt } from "./types";

// === Text-stripping safeguard (reusable, story-agnostic) ===
//
// Even with explicit instructions, LLMs sometimes include text descriptions
// in image prompts (e.g. "text saying 'Subscribe'" or "the words 'The End'").
// This function strips any text-related descriptions from the imagePrompt
// BEFORE it is sent to the image model, ensuring the model never receives
// instructions to generate text.

/**
 * Strip text-related descriptions from an image prompt so the image model
 * never receives instructions to generate text inside the artwork.
 * Returns a cleaned prompt that describes only visual elements.
 */
function stripTextFromPrompt(prompt: string): string {
  let cleaned = prompt;

  // ── Phase 1: Remove full text-description phrases ──
  const textPhrasePatterns = [
    // "the text '...' is written in a ... font" (full phrase, most common)
    /the\s+text\s+['"][^'"]*['"]\s+is\s+written\s+in\s+a\s+[\w\s,]*font/gi,
    // "the text '...' is written"
    /the\s+text\s+['"][^'"]*['"]\s+is\s+written/gi,
    // "text saying '...'" or "text saying \"...\""
    /text\s+saying\s+['"][^'"]*['"]/gi,
    // "the words '...'" or "the words \"...\""
    /the\s+words\s+['"][^'"]*['"]/gi,
    // "a sign reading '...'" or "sign reading \"...\""
    /(?:a\s+)?sign\s+reading\s+['"][^'"]*['"]/gi,
    // "text '...'" or "text \"...\""
    /text\s+['"][^'"]*['"]/gi,
    // "caption '...'" or "caption \"...\""
    /caption\s+['"][^'"]*['"]/gi,
    // "title '...'" or "title \"...\""
    /title\s+['"][^'"]*['"]/gi,
    // "label '...'" or "label \"...\""
    /label\s+['"][^'"]*['"]/gi,
    // "writing '...'" or "writing \"...\""
    /writing\s+['"][^'"]*['"]/gi,
    // "written in a ... font" or "written in ... font" (standalone)
    /written\s+in\s+a\s+[\w\s,]*font/gi,
    /written\s+in\s+[\w\s,]*font/gi,
    // "in a playful, rounded font" (standalone font descriptions)
    /in\s+a\s+[\w\s,]*font/gi,
    // "is written" (orphaned remnant after text removal)
    /is\s+written/gi,
  ];

  for (const pattern of textPhrasePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // ── Phase 2: Remove subscribe/channel-name/subtitle references ──
  // These are common in end-card prompts and should not appear as image content.
  // Also remove "subtitle at top/bottom" phrases — mentioning "subtitle" in
  // the image prompt can cause the model to generate subtitle text in the image.
  cleaned = cleaned.replace(/\bsubscribe\s+for\s+more\b[^.]*\./gi, "");
  cleaned = cleaned.replace(/\bsubscribe\s+button\b/gi, "decorative button shape");
  cleaned = cleaned.replace(/\bchannel\s+name\b/gi, "decorative text-free area");
  cleaned = cleaned.replace(/,\s*so\s+subtitle\s+at\s+(?:top|bottom)\b/gi, "");
  cleaned = cleaned.replace(/\bsubtitle\s+at\s+(?:top|bottom)\b/gi, "");
  cleaned = cleaned.replace(/\bsubtitle\s+(?:at\s+)?(?:top|bottom)\b/gi, "");

  // ── Phase 3: Clean up remnants and awkward phrasing ──
  // Remove orphaned "the" that was left before a removed text phrase
  cleaned = cleaned.replace(/\bthe\s+is\s+/gi, "");
  // Remove "Below the star," if it's now followed by nothing meaningful
  cleaned = cleaned.replace(/,\s*below\s+the\s+star\s*,\s*/gi, ". ");
  cleaned = cleaned.replace(/\bbelow\s+the\s+star\s*,\s*$/gi, "");

  // General cleanup: double spaces, orphaned commas, trailing connectors
  cleaned = cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();
  // Fix sentences that might start with a connector after removal
  cleaned = cleaned.replace(/^\s*and\s+/i, "").replace(/^\s*but\s+/i, "");
  // Fix orphaned commas at the start
  cleaned = cleaned.replace(/^\s*,\s*/g, "");

  return cleaned;
}

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

  // Kids templates use a dedicated prompt path (ported from the s23 spike):
  // locked character identity + 3D-animated-movie style + text-safe
  // composition instructions derived from the scene's selected component.
  const isKidsTemplate = channel.video_template === "kids-9x16" || channel.video_template === "kids-16x9";

  const [aw, ah] = aspectRatio.split(":").map(Number);
  const orientation = aw && ah && ah > aw ? "Vertical" : aw && ah && aw > ah ? "Horizontal" : "Square";
  const parts: string[] = [];

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
- Preserve distinct faces, hair, skin tone, build, and CANONICAL WARDROBE for each character as described above.
- The wardrobe described in each character's identity block is their canonical outfit — use it exactly unless the scene explicitly requires a change.
- Treat each subject as the same character depicted consistently in a new situation, never as a redesign, look-alike, beautified version, or reinterpretation.
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
Use the provided portrait reference image as strict evidence of the same character's identity. Preserve the exact face, proportions, apparent age, skin tone, eyes, hair, body build, distinguishing features, and canonical wardrobe shown by the reference and described below.

Stored identity: ${characterIdentity}.

The reference image and identity description override any conflicting visual interpretation. Treat the subject as the same character depicted consistently in a new situation, never as a redesign, look-alike, beautified version, or reinterpretation. Change only the action, expression, pose, camera position, and environment required by this scene.

CANONICAL WARDROBE: The wardrobe described above is this character's canonical outfit. Use it exactly unless the scene explicitly requires a change. Do not invent new clothing or alter the outfit arbitrarily.

If a previous scene image is provided as the last reference, use it for visual continuity of lighting, environment, and composition — but maintain this character's identity from their portrait reference.`);
  } else {
    parts.push("SUBJECT RULE: This is a non-character scene. Do not introduce any recurring character. Do not add a prominent person unless the visual event explicitly requires one; anonymous background people must remain incidental and natural.");
  }

  // === Kids template: dedicated prompt path (ported from the s23 spike) ===
  // Produces the spike's proven prompt structure — art-style prefix with the
  // character's lockedIdentity verbatim, stripped scene description, emotion,
  // and text-safe composition instructions derived from the component that
  // will render the scene. Runware is pure text-to-image: no reference IDs.
  if (isKidsTemplate) {
    const lastOrderRow = await db
      .prepare('SELECT MAX("order") as m FROM scenes WHERE story_id = ?')
      .get(scene.story_id) as { m: number | null } | null;
    const lastOrder = lastOrderRow?.m ?? scene.order;
    // Kids stories have a single locked character — prefer the story's frozen
    // character version bible when scene_characters rows aren't linked to a
    // version (planner may leave character_version_id NULL).
    const bible = characterInfos[0]?.bible
      ?? (characterVersion ? (JSON.parse(characterVersion.bible) as Record<string, unknown>) : null);
    const characterIdentity = bible ? buildCharacterIdentity(bible) : null;
    const cleanedVisualEvent = stripTextFromPrompt(scene.visual_event);
    if (cleanedVisualEvent !== scene.visual_event) {
      console.log(`[image-service] Scene ${scene.id}: stripped text descriptions from visual event`);
    }
    const kids = buildKidsImagePrompt({
      channel,
      scene,
      lastOrder,
      bible,
      characterIdentity,
      cleanedVisualEvent,
    });
    return {
      prompt: kids.prompt,
      isCharacterScene,
      model,
      referenceIds: [],
      negativePrompt: kids.negativePrompt,
    };
  }

  // 1. Provider instruction — adapt to the character's visual style
  // If the character bible specifies a visualStyle (e.g. "2D animated",
  // "illustration", "painterly"), use language appropriate to that style.
  // Otherwise, default to a neutral instruction that doesn't enforce realism.
  const characterVisualStyle = characterInfos.length > 0
    ? (characterInfos[0]!.bible.visualStyle as string | undefined)
    : undefined;
  const isAnimatedStyle = characterVisualStyle && (
    characterVisualStyle.toLowerCase().includes("animat") ||
    characterVisualStyle.toLowerCase().includes("illustrat") ||
    characterVisualStyle.toLowerCase().includes("painterly") ||
    characterVisualStyle.toLowerCase().includes("cartoon") ||
    characterVisualStyle.toLowerCase().includes("stylized") ||
    characterVisualStyle.toLowerCase().includes("storybook") ||
    characterVisualStyle.toLowerCase().includes("hand-drawn") ||
    characterVisualStyle.toLowerCase().includes("cel-shaded") ||
    characterVisualStyle.toLowerCase().includes("anime") ||
    characterVisualStyle.toLowerCase().includes("manga")
  );

  if (isAnimatedStyle) {
    parts.push(`Create one ${characterVisualStyle} image depicting a single moment. Follow the character's established visual style exactly. The result should feel consistent with the reference image's art style, not a different medium or interpretation. Depict one frame and one moment only. No text, watermark, border, logo, collage, or split screen.`);
  } else if (characterVisualStyle) {
    parts.push(`Create one image in this visual style: ${characterVisualStyle}. Depict a single moment consistent with the reference image's look and feel. Depict one frame and one moment only. No text, watermark, border, logo, collage, or split screen.`);
  } else {
    parts.push(`Create one image depicting a single moment. The result should feel consistent with the reference image's visual style and medium. Depict one frame and one moment only. No text, watermark, border, logo, collage, or split screen.`);
  }

  // 3. Channel visual-style
  if (channel.visual_style) {
    parts.push(channel.visual_style);
  } else if (characterVisualStyle) {
    // Use the character's visual style as the style guide
    parts.push(`STYLE: ${characterVisualStyle}.`);
  } else {
    parts.push("STYLE: Consistent with the channel's established visual identity. Restrained color, believable lighting, and no glossy advertising finish.");
  }

  // 4. Scene action
  parts.push(`SCENE: Depict a single decisive moment — ${scene.visual_event}
Show the precise action or consequence described here. Do not combine earlier and later events, create a montage, or add generic symbolic objects.`);

  // 5. Environment
  parts.push(`ENVIRONMENT: ${scene.environment}
Make the location specific and coherent. Props, weather, surfaces, and background activity must belong to this exact place and moment.`);

  // 6. Pose / expression
  if (isCharacterScene && !hasMultiCharacters) {
    parts.push(`BODY LANGUAGE AND EXPRESSION: ${scene.pose_and_expression}
Keep emotion restrained and observable through posture, gaze, facial tension, and hand placement. Avoid theatrical posing, influencer expressions, and direct-to-camera smiling unless explicitly requested.`);
  }

  // 7. Camera / lens
  parts.push(`CAMERA: ${scene.camera_framing}
Use consistent perspective with a level horizon unless the scene requires otherwise, appropriate depth of field, and a clear focal subject. Avoid extreme distortion and arbitrary Dutch angles.`);

  // 8. Lighting / mood
  parts.push(`LIGHT AND MOOD: ${scene.lighting_and_mood}
All illumination, shadows, and color temperature must be consistent with the established visual style. Keep grading restrained; no exaggerated HDR or synthetic glow unless the style calls for it.`);

  // 9. Aspect ratio
  const mobileGuidance = orientation === "Vertical"
    ? "Keep the face, hands, and essential action inside the central mobile-safe area. Avoid placing critical details against the extreme top, bottom, or side edges; use peripheral space for natural environment rather than artificial emptiness."
    : "Keep the focal action immediately legible and compose peripheral space from the real environment.";
  parts.push(`OUTPUT COMPOSITION: ${orientation} ${aspectRatio}. ${mobileGuidance} The image must remain clear at phone-screen size.`);

  // 10. Negative constraints — adapt to the visual style
  if (isAnimatedStyle) {
    parts.push("QUALITY CHECK: Hands, fingers, limbs, eyes, hair, clothing, and background elements must be internally coherent and consistent with the established art style. Avoid duplicated features, merged objects, malformed anatomy, floating props, broken perspective, and inconsistent line weight or coloring. Maintain the same medium, brushwork, line style, and color palette as the reference image.");
  } else {
    parts.push("QUALITY CHECK: Hands, fingers, limbs, eyes, teeth when visible, hair, clothing seams, object contact points, reflections, shadows, perspective, and background geometry must be anatomically and physically coherent. Avoid plastic skin, waxy faces, beauty retouching, duplicated features, merged objects, malformed anatomy, floating props, impossible reflections, fake blur, excessive bokeh, oversharpening, HDR, cinematic glow, and synthetic-looking details.");
  }

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
