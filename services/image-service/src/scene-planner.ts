import type { LlmClient, StoryCandidate, CharacterRosterEntry } from "@automation/contracts";
import { getContentTypeBehavior } from "@automation/contracts";
import type {
  StoryRow, StoryVersionRow, ChannelRow,
} from "@automation/database";
import { getScenePlanModel } from "./constants";
import type { ScenePlan } from "./types";

// === Scene Planner ===

const SCENE_PLANNER_SYSTEM_INSTRUCTION = `You are the final voice-over editor and visual beat director for short-form story videos. Convert the approved story into concise, natural spoken narration and one strong still-image moment per scene. Preserve the approved topic, facts, causal order, hook, and payoff. Do not add unsupported information. Apply general high-retention storytelling craft without imitating any named creator. Return only the requested JSON.`;

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
  const isVideoClipScene = scenePlanConfig?.sceneType === "video-clip-scene";

  const visualDirectionSection = isVideoClipScene
    ? [
        "- Each scene will be rendered as a short AI-generated video clip (5-10 seconds). visualEvent should describe a dynamic action with motion, not a static photograph.",
        "- Tie every visual to a concrete noun, action, or consequence from that scene's narration. Avoid generic symbolism, floating concepts, and stock poses.",
        "- Keep the essential subject and action immediately legible on a phone in ${channel.aspect_ratio}.",
        "- Preserve continuity in wardrobe, age, props, location, time progression, light direction, and weather where scenes share them.",
        "- cameraFraming must specify shot size, camera height/angle, and subject placement. For video, also indicate camera movement (static, pan, tilt, dolly, etc.).",
        "- lightingAndMood must describe plausible light sources and restrained emotional tone, not generic \"cinematic\" effects.",
        "- Each clip should be ${scenePlanConfig?.clipDurationSeconds?.min ?? 5}-${scenePlanConfig?.clipDurationSeconds?.max ?? 10} seconds long. Set expectedDurationSeconds accordingly.",
        "- Do not request text, captions, interface elements, or collage inside a clip.",
      ].join("\n").replace(/\$\{channel\.aspect_ratio\}/g, channel.aspect_ratio)
    : [
        "- One generated still image represents each scene, so visualEvent must describe one photographable instant, not a sequence, montage, split screen, before-and-after, or multiple locations.",
        "- Tie every visual to a concrete noun, action, or consequence from that scene's narration. Avoid generic symbolism, floating concepts, stock poses, and unexplained props.",
        "- Keep the essential subject and action immediately legible on a phone in ${channel.aspect_ratio}.",
        "- Preserve continuity in wardrobe, age, props, location, time progression, light direction, and weather where scenes share them.",
        "- Vary framing only when it serves the emotional progression; do not alternate shots mechanically.",
        "- cameraFraming must specify shot size, camera height/angle, natural lens perspective, and subject placement.",
        "- lightingAndMood must describe plausible light sources and restrained emotional tone, not generic \"cinematic\" effects.",
        "- Do not request text, captions, interface elements, collage, or impossible anatomy inside an image.",
      ].join("\n").replace(/\$\{channel\.aspect_ratio\}/g, channel.aspect_ratio);

  const jsonSchemaSection = isVideoClipScene
    ? `{
  "scenes": [
    {
      "order": 1,
      "storyPurpose": "one precise narrative job",
      "narrationText": "final voice-over text for this scene",
      "visualEvent": "one dynamic action with motion to be rendered as a video clip",
      "characterRole": "one allowed character role",
      "poseAndExpression": "specific observable body language and restrained expression, or N/A",
      "environment": "specific real setting with continuity details",
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
      "environment": "specific real setting with continuity details",
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
- Visual style: ${JSON.stringify(channel.visual_style || "authentic documentary photography with natural available light")}
- Safety rules: ${channel.safety_rules || "[]"}
- Output aspect ratio: ${channel.aspect_ratio}

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

NARRATION:
1. FIRST 2 SECONDS: Scene 1 must use the approved hook as its opening words, verbatim. Do not precede it with a greeting, label, or setup.
2. Preserve the exact topic, causal order, and meaning of the approved story. Do not add facts, people, events, or claims.
3. Use natural spoken ${channel.locale}: contractions, varied sentence lengths, concrete verbs, and clean TTS punctuation.
4. Keep each scene to 1-3 purposeful sentences. Remove repetition, recaps, filler, stage directions, headings, hashtags, and engagement requests.
5. Avoid AI-sounding or promotional phrases such as "delve into," "in today's world," "moreover," "here's the thing," "the truth is," "you won't believe," and "what happens next will shock you."
6. Spell numbers, abbreviations, and symbols as they should be spoken.
7. Land the final scene on the earned recognition or consequence. Do not append a generic moral.
8. For factual content, assign only available claim IDs to the exact scene using those claims. Never invent claim IDs.

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
