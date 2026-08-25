import type { LlmClient, StoryCandidate, CharacterRosterEntry } from "@automation/contracts";
import { getContentTypeBehavior } from "@automation/contracts";
import type {
  StoryRow, StoryVersionRow, ChannelRow,
} from "@automation/database";
import { getScenePlanModel } from "./constants";
import type { ScenePlan } from "./types";

// === Scene Planner ===

const SCENE_PLANNER_SYSTEM_INSTRUCTION = `You are a world-class short-form video director and voice-over editor. You think in shots, not sentences. Your job is to convert the approved story into a scene-by-scene visual plan that a video production team could shoot — each scene is a different camera setup with its own shot size, camera movement, lighting, and emotional purpose. The narration must sound like a real person speaking, not a script being read. Apply general high-retention storytelling craft — immediate stakes, specificity, compression, escalation, and a clean payoff — without imitating any named creator. Preserve the approved topic, facts, causal order, hook, and payoff. Do not add unsupported information. Return only the requested JSON.`;

function sceneNarrationWordBudget(durationSeconds: number): { target: number; min: number; max: number } {
  const target = Math.max(24, Math.round(durationSeconds * 2.3));
  return {
    target,
    min: Math.max(20, Math.round(target * 0.9)),
    max: Math.round(target * 1.1),
  };
}

function buildScenePlanPrompt(
  story: StoryRow,
  candidate: StoryCandidate,
  channel: ChannelRow,
  claims: Array<{ id: string; claim: string }> = [],
  characterRoster: CharacterRosterEntry[] = [],
  scenePlanConfig?: {
    sceneType?: string;
    imageRequirement?: boolean;
    visualPlanFields?: string[];
    clipPromptFields?: string[];
    clipDurationSeconds?: { min: number; max: number };
    maxClips?: number;
  },
): string {
  const wordBudget = sceneNarrationWordBudget(channel.target_duration_seconds);
  const behavior = getContentTypeBehavior(story.content_type);
  const characterRule = behavior.characterRole === "supporting_only"
    ? "The recurring channel character may appear only as a host or observer. Never portray that character as the real person in the case; use characterRole \"supporting\" for the host."
    : behavior.characterRole === "none"
      ? "This content type does not use characters. Use characterRole \"none\" for all scenes."
      : behavior.allowsDramatization
        ? "Use the recurring character as the protagonist when the approved story calls for it."
        : "Use the recurring character as a clearly fictional example, host or observer. Do not imply that a fictional scenario is a documented case.";

  // Build character roster section for multi-character scenes
  const rosterSection = characterRoster.length > 0
    ? characterRoster.map((entry) => {
        const parts: string[] = [entry.name];
        if (entry.bible.age) parts.push(`${entry.bible.age} years old`);
        if (entry.bible.gender) parts.push(entry.bible.gender);
        if (entry.bible.personality) parts.push(`personality: ${entry.bible.personality}`);
        if (entry.bible.background) parts.push(`background: ${entry.bible.background}`);
        if (entry.bible.relationships && Object.keys(entry.bible.relationships).length > 0) {
          const rels = Object.entries(entry.bible.relationships)
            .map(([name, rel]) => `${name} = ${rel}`)
            .join("; ");
          parts.push(`relationships: ${rels}`);
        }
        const refStatus = entry.hasReferenceImages ? "has reference images" : "no reference images yet";
        return `- ${parts.join("; ")}; ${refStatus}`;
      }).join("\n")
    : "No characters in the channel roster. Use characterRole \"none\" for all scenes.";

  // Build character assignments from the candidate (if present)
  const candidateCharactersSection = (candidate.characters && candidate.characters.length > 0) || (candidate.newCharacters && candidate.newCharacters.length > 0)
    ? [
        ...(candidate.characters ?? []).map((c) => `- ${c.name}: ${c.roleInStory} (existing character)`),
        ...(candidate.newCharacters ?? []).map((c) => `- ${c.name}: ${c.roleInStory} (new character)`),
      ].join("\n")
    : "No specific character assignments from the story.";

  // D017: Adapt visual direction and JSON schema based on template scenePlan config.
  // Default to image-scene behavior for backward compatibility.
  // D021: flow-hybrid is a mix of 4s video clips and static images.
  const isVideoClipScene = scenePlanConfig?.sceneType === "video-clip-scene";
  const isFlowHybrid = scenePlanConfig?.sceneType === "flow-hybrid";
  const maxClips = scenePlanConfig?.maxClips;
  const clipDurMin = scenePlanConfig?.clipDurationSeconds?.min ?? 4;
  const clipDurMax = scenePlanConfig?.clipDurationSeconds?.max ?? 4;

  const visualDirectionSection = isFlowHybrid
    ? [
        "- This video uses Google Flow to generate a hybrid of 4-second video clips and static images. Each scene is either a 4-second video clip or a single static image.",
        `- Maximum ${maxClips ?? 7} video clips total. You may include additional static image scenes if the story needs them, but no more than ${maxClips ?? 7} scenes may be video clips.`,
        "- For video-clip scenes: visualEvent should describe a dynamic action with motion that fits in 4 seconds. Keep it simple — one action, one camera move.",
        "- For image scenes: visualEvent should describe one decisive photographable instant, not a sequence.",
        "- Use mediaType to mark each scene as either \"video-clip\" or \"image\". Action scenes, emotional turning points, and moments with natural motion should be video clips. Atmospheric establishing shots, still-life details, and quiet contemplative moments should be images.",
        "- Tie every visual to a concrete noun, action, or consequence from that scene's narration. Avoid generic symbolism, floating concepts, and stock poses.",
        `- Keep the essential subject and action immediately legible on a phone in ${channel.aspect_ratio}.`,
        "- Preserve continuity in wardrobe, age, props, location, time progression, light direction, and weather where scenes share them.",
        "- cameraFraming must specify shot size, camera height/angle, and subject placement. For video clips, also indicate camera movement (static, pan, tilt, dolly, etc.).",
        "- lightingAndMood must describe light sources and emotional tone appropriate to the channel's visual style.",
        `- Video clip scenes should be ${clipDurMin}-${clipDurMax} seconds long. Set expectedDurationSeconds accordingly. Image scenes should have expectedDurationSeconds of 0.`,
        "- Do not request text, captions, interface elements, or collage inside a clip or image.",
        "",
        "CINEMATIC VARIETY — this is critical for avoiding the 'AI-generated' look:",
        "- NO TWO ADJACENT SCENES may share the same shot size. Alternate between wide, medium, and close-up to create visual rhythm.",
        "- NO TWO ADJACENT video clips may share the same camera movement. Mix static, pan, tilt, dolly, and handheld.",
        "- Vary lighting between scenes to match the emotional arc: brighter for warm moments, harsher for tension, softer for intimacy, cooler for melancholy.",
        "- Use at least one extreme close-up (on hands, food, an object, an eye) and at least one wide establishing shot across the full scene set.",
        "- Think like a film director: each scene is a different camera setup, not a re-aimed version of the previous one.",
        "- The first frame of each clip must be visually striking on its own — a viewer scrolling past should want to stop.",
      ].join("\n")
    : isVideoClipScene
    ? [
        "- Each scene will be rendered as a short AI-generated video clip (5-10 seconds). visualEvent should describe a dynamic action with motion, not a static image.",
        "- Tie every visual to a concrete noun, action, or consequence from that scene's narration. Avoid generic symbolism, floating concepts, and stock poses.",
        "- Keep the essential subject and action immediately legible on a phone in ${channel.aspect_ratio}.",
        "- Preserve continuity in wardrobe, age, props, location, time progression, light direction, and weather where scenes share them.",
        "- cameraFraming must specify shot size, camera height/angle, and subject placement. For video, also indicate camera movement (static, pan, tilt, dolly, etc.).",
        "- lightingAndMood must describe light sources and emotional tone appropriate to the channel's visual style.",
        "- Each clip should be ${scenePlanConfig?.clipDurationSeconds?.min ?? 5}-${scenePlanConfig?.clipDurationSeconds?.max ?? 10} seconds long. Set expectedDurationSeconds accordingly.",
        "- Do not request text, captions, interface elements, or collage inside a clip.",
        "",
        "CINEMATIC VARIETY — this is critical for avoiding the 'AI-generated' look:",
        "- NO TWO ADJACENT SCENES may share the same shot size. Alternate between wide, medium, and close-up to create visual rhythm.",
        "- NO TWO ADJACENT SCENES may share the same camera movement. Mix static, pan, tilt, dolly, and handheld. A static shot followed by a static shot feels flat.",
        "- Vary lighting between scenes to match the emotional arc: brighter for warm moments, harsher for tension, softer for intimacy, cooler for melancholy.",
        "- Vary the environment framing: some scenes tight on hands and objects, some wide on the room, some focused on the character's face. Do not put the character in the same spot in every scene.",
        "- Use at least one extreme close-up (on hands, food, an object, an eye) and at least one wide establishing shot across the full scene set.",
        "- Think like a film director: each scene is a different camera setup, not a re-aimed version of the previous one.",
        "- The first frame of each clip must be visually striking on its own — a viewer scrolling past should want to stop.",
      ].join("\n").replace(/\$\{channel\.aspect_ratio\}/g, channel.aspect_ratio)
    : [
        "- One generated still image represents each scene, so visualEvent must describe one visual instant, not a sequence, montage, split screen, before-and-after, or multiple locations.",
        "- Tie every visual to a concrete noun, action, or consequence from that scene's narration. Avoid generic symbolism, floating concepts, stock poses, and unexplained props.",
        "- Keep the essential subject and action immediately legible on a phone in ${channel.aspect_ratio}.",
        "- Preserve continuity in wardrobe, age, props, location, time progression, light direction, and weather where scenes share them.",
        "- Vary framing only when it serves the emotional progression; do not alternate shots mechanically.",
        "- cameraFraming must specify shot size, camera height/angle, perspective, and subject placement.",
        "- lightingAndMood must describe light sources and emotional tone appropriate to the channel's visual style.",
        "- Do not request text, captions, interface elements, collage, or impossible anatomy inside an image.",
        "",
        "VISUAL VARIETY — avoid the 'AI-generated' look:",
        "- NO TWO ADJACENT SCENES may share the same shot size. Alternate between wide, medium, and close-up.",
        "- Vary lighting between scenes to match the emotional arc.",
        "- Use at least one extreme close-up (on hands, an object, a face) and at least one wide establishing shot.",
        "- Each image should feel like a different photograph from a skilled photographer, not the same composition re-aimed.",
      ].join("\n").replace(/\$\{channel\.aspect_ratio\}/g, channel.aspect_ratio);

  const jsonSchemaSection = isFlowHybrid
    ? `{
  "scenes": [
    {
      "order": 1,
      "storyPurpose": "one precise narrative job",
      "narrationText": "final voice-over text for this scene",
      "visualEvent": "one dynamic action with motion (for video-clip) or one decisive photographable instant (for image)",
      "mediaType": "video-clip or image",
      "characterRole": "one allowed character role",
      "poseAndExpression": "specific observable body language and restrained expression, or N/A",
      "environment": "specific setting with continuity details",
      "cameraFraming": "shot size, angle, camera movement (static/pan/tilt/dolly) for video, or natural lens perspective for image, and subject placement",
      "lightingAndMood": "physical light source, time of day, color temperature, and restrained mood",
      "expectedDurationSeconds": ${clipDurMin} for video-clip, 0 for image,
      "imageRequirement": "one allowed image requirement",
      "sourceClaimIds": ["only valid claim IDs used in this scene"],
      "characters": [
        { "name": "character name from the story characters", "roleInScene": "protagonist|supporting|antagonist", "poseAndExpression": "specific body language and expression for this character in this scene" }
      ]
    }
  ]
}`
    : isVideoClipScene
    ? `{
  "scenes": [
    {
      "order": 1,
      "storyPurpose": "one precise narrative job",
      "narrationText": "final voice-over text for this scene",
      "visualEvent": "one dynamic action with motion to be rendered as a video clip",
      "characterRole": "one allowed character role",
      "poseAndExpression": "specific observable body language and restrained expression, or N/A",
      "environment": "specific setting with continuity details",
      "cameraFraming": "shot size, angle, camera movement (static/pan/tilt/dolly), and subject placement",
      "lightingAndMood": "physical light source, time of day, color temperature, and restrained mood",
      "expectedDurationSeconds": ${scenePlanConfig?.clipDurationSeconds?.min ?? 5},
      "imageRequirement": "one allowed image requirement",
      "sourceClaimIds": ["only valid claim IDs used in this scene"],
      "characters": [
        { "name": "character name from the story characters", "roleInScene": "protagonist|supporting|antagonist", "poseAndExpression": "specific body language and expression for this character in this scene" }
      ]
    }
  ]
}`
    : `{
  "scenes": [
    {
      "order": 1,
      "storyPurpose": "one precise narrative job",
      "narrationText": "final voice-over text for this scene",
      "visualEvent": "one decisive photographable instant",
      "characterRole": "one allowed character role",
      "poseAndExpression": "specific observable body language and restrained expression, or N/A",
      "environment": "specific setting with continuity details",
      "cameraFraming": "shot size, angle, natural lens perspective, and subject placement",
      "lightingAndMood": "physical light source, time of day, color temperature, and restrained mood",
      "expectedDurationSeconds": 0,
      "imageRequirement": "one allowed image requirement",
      "sourceClaimIds": ["only valid claim IDs used in this scene"],
      "characters": [
        { "name": "character name from the story characters", "roleInScene": "protagonist|supporting|antagonist", "poseAndExpression": "specific body language and expression for this character in this scene" }
      ]
    }
  ]
}`;

  return `Turn the approved story into the final narration and visual scene plan.

NON-NEGOTIABLE STORY SOURCE:
- Title: ${JSON.stringify(story.title)}
- Content type: ${story.content_type}
- Approved hook: ${JSON.stringify(candidate.hook)}
- Premise: ${JSON.stringify(candidate.premise)}
- Approved storyline: ${JSON.stringify(candidate.storyline)}
- Emotional arc: ${JSON.stringify(candidate.emotionalArc)}
- Core psychological idea: ${JSON.stringify(candidate.corePsychologicalIdea)}
- Key events: ${JSON.stringify(candidate.keyEvents)}
- Twist or resolution: ${JSON.stringify(candidate.twistOrResolution)}
- Takeaway: ${JSON.stringify(candidate.lessonOrTakeaway)}
- Approved source IDs: ${JSON.stringify(candidate.sourceReferences ?? [])}
- Available sourced claims: ${JSON.stringify(claims)}

CHANNEL PROFILE:
- Niche: ${JSON.stringify(channel.niche)}
- Audience locale: ${JSON.stringify(channel.locale)}
- Story style: ${JSON.stringify(channel.story_style || "direct, conversational, specific, and emotionally controlled")}
- Visual style: ${JSON.stringify(channel.visual_style || "consistent with the channel's established visual identity")}
- Safety rules: ${channel.safety_rules || "[]"}
- Output aspect ratio: ${channel.aspect_ratio}

CHANNEL FIDELITY — the niche is the creative north star:
- Every visual choice must serve the channel niche above. If the niche says "cooking and ASMR-style animated stories," the visuals must foreground hands, food, tools, and texture — not abstract emotion or generic storytelling poses.
- The visual style is a hard constraint, not a suggestion. If it specifies a medium (illustration, photorealistic, 2D animated), every scene must use that medium. If it specifies a color palette or texture, every scene must honor it.
- The story style governs narration tone. If it says "gentle, sensory, unhurried," the narration must not feel rushed, punchy, or dramatic. Match the channel's established voice.

STORY CHARACTERS (from the approved story):
${candidateCharactersSection}

CHANNEL CHARACTER ROSTER (available for scene assignment):
${rosterSection}

DURATION AND BEATS:
- Target duration: ${channel.target_duration_seconds} seconds.
- Choose the smallest effective scene count between ${channel.scene_min} and ${channel.scene_max}; do not pad the story.
- Total narration across every scene must be ${wordBudget.min}-${wordBudget.max} words, centered near ${wordBudget.target}.
- Estimate each scene at roughly 2.3 spoken words per second plus brief natural pauses. Scene durations must sum to within one second of ${channel.target_duration_seconds}.
- Each scene must perform one job: hook, essential context, escalation, turn, payoff, or brief breathing beat.
- VARY scene durations to create pacing rhythm. A hook scene should be shorter (3-5s) to grab attention fast. An escalation or turn scene can be longer (7-10s) to build tension. Do not make every scene the same length — uniform pacing feels mechanical and AI-generated.
- The first scene must be the shortest or among the shortest. Front-load tension; do not front-load context.

NARRATION:
1. FIRST 2 SECONDS: Scene 1 must use the approved hook as its opening words, verbatim. Do not precede it with a greeting, label, or setup.
2. Preserve the exact topic, causal order, and meaning of the approved story. Do not add facts, people, events, or claims.
3. Use natural spoken ${channel.locale}: contractions, varied sentence lengths, concrete verbs, and clean TTS punctuation.
4. Keep each scene to 1-3 purposeful sentences. Remove repetition, recaps, filler, stage directions, headings, hashtags, and engagement requests.
5. Avoid AI-sounding or promotional phrases such as "delve into," "in today's world," "moreover," "here's the thing," "the truth is," "you won't believe," and "what happens next will shock you."
6. Spell numbers, abbreviations, and symbols as they should be spoken.
7. Land the final scene on the earned recognition or consequence. Do not append a generic moral.
8. For factual content, assign only available claim IDs to the exact scene using those claims. Never invent claim IDs.
9. Write narration that sounds like a real person talking — not a narrator, not an essay, not a voiceover script. Use the kind of specific, sensory language a person would actually say: "the butter sizzled" not "the cooking process began."
10. Connect scenes with causality, not chronology. Each scene should answer "why" or "so what," not just "what happened next." If the connection between two scenes is only "and then," rewrite one of them.

VISUAL DIRECTION:
${visualDirectionSection}

CHARACTER USE:
${characterRule}

MULTI-CHARACTER SCENES:
- Each scene may feature 0, 1, or multiple characters from the story characters list.
- Assign characters by name, matching the STORY CHARACTERS above.
- For each character in a scene, specify their roleInScene and poseAndExpression.
- Use the "characters" array to list all characters appearing in each scene.
- If no characters appear in a scene, use an empty "characters" array, characterRole "none", and imageRequirement "non_character_scene".
- Otherwise use imageRequirement "character_scene".

Allowed characterRole values are "protagonist", "supporting", and "none". Allowed imageRequirement values are "character_scene" and "non_character_scene".
Return exactly this valid JSON shape:
${jsonSchemaSection}`;
}

/**
 * Plan scenes from an approved story using the configured LLM provider.
 * Produces 4-8 scenes with narration, visual events, and image requirements.
 * D017: When scenePlanConfig is provided, the prompt adapts to the template's
 * scene type (image-scene vs video-clip-scene).
 */
async function planScenes(
  client: LlmClient,
  story: StoryRow,
  storyVersion: StoryVersionRow,
  channel: ChannelRow,
  claims: Array<{ id: string; claim: string }> = [],
  characterRoster: CharacterRosterEntry[] = [],
  runId?: string,
  stepId?: string,
  llmProvider?: string,
  llmModel?: string,
  scenePlanConfig?: {
    sceneType?: string;
    imageRequirement?: boolean;
    visualPlanFields?: string[];
    clipPromptFields?: string[];
    clipDurationSeconds?: { min: number; max: number };
    maxClips?: number;
  },
): Promise<ScenePlan & { provider: string; model: string; costUsd: number }> {
  const candidate = JSON.parse(storyVersion.story_json) as StoryCandidate;
  const prompt = buildScenePlanPrompt(story, candidate, channel, claims, characterRoster, scenePlanConfig);
  const usedModel = llmModel ?? getScenePlanModel(llmProvider);

  const result = await client.call({
    model: usedModel,
    prompt,
    responseJson: true,
    systemInstruction: SCENE_PLANNER_SYSTEM_INSTRUCTION,
    temperature: 0.55,
    maxOutputTokens: 8192,
    capability: "image.scene_plan",
    runId,
    stepId,
  });

  const plan = result.json as ScenePlan | null;
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    throw new Error("Scene planner returned no scenes");
  }

  // Enforce scene count from channel config
  if (plan.scenes.length > channel.scene_max) {
    console.warn(
      `[image-service] Scene count ${plan.scenes.length} exceeds max ${channel.scene_max}, truncating`,
    );
    plan.scenes = plan.scenes.slice(0, channel.scene_max);
    // Re-number order
    plan.scenes.forEach((s, i) => (s.order = i + 1));
  }

  if (plan.scenes.length < channel.scene_min) {
    throw new Error(
      `Scene planner returned ${plan.scenes.length} scenes, minimum is ${channel.scene_min}`,
    );
  }

  // D021: Enforce maxClips constraint for flow-hybrid templates
  if (scenePlanConfig?.maxClips && scenePlanConfig?.sceneType === "flow-hybrid") {
    const videoClipScenes = plan.scenes.filter(
      (s) => (s as unknown as { mediaType?: string }).mediaType !== "image",
    );
    if (videoClipScenes.length > scenePlanConfig.maxClips) {
      console.warn(
        `[image-service] Video clip count ${videoClipScenes.length} exceeds max ${scenePlanConfig.maxClips}, converting excess clips to images`,
      );
      // Convert excess video clips to images (keep the first maxClips as clips)
      let clipCount = 0;
      for (const scene of plan.scenes) {
        const sceneWithMediaType = scene as unknown as { mediaType?: string };
        if (sceneWithMediaType.mediaType !== "image") {
          clipCount++;
          if (clipCount > scenePlanConfig.maxClips) {
            sceneWithMediaType.mediaType = "image";
            scene.expectedDurationSeconds = 0;
          }
        }
      }
    }
  }

  return {
    ...plan,
    provider: llmProvider ?? (process.env.LLM_PROVIDER ?? "gemini"),
    model: usedModel,
    costUsd: result.cost.totalCost,
  };
}

export {
  SCENE_PLANNER_SYSTEM_INSTRUCTION,
  buildScenePlanPrompt,
  sceneNarrationWordBudget,
  planScenes,
};
