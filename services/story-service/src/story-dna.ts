import type { LlmClient } from "@automation/contracts";
import type { StoryCandidate } from "@automation/contracts";
import { getModel } from "./constants";
import type { StoryDna } from "./types";

// === Story DNA extraction ===

const STORY_DNA_SYSTEM_INSTRUCTION = `You are an objective narrative structural analyst. Reduce stories to concise causal structure for duplicate detection. Ignore prose style, hook wording, names, and superficial details unless they materially change the plot. Do not invent missing motives or events. Return only the requested JSON.`;

function buildStoryDnaPrompt(candidate: StoryCandidate): string {
  return `Extract the story's narrative DNA as short, neutral structural descriptions.

NORMALIZATION RULES:
- Capture causal structure: who wants what, what triggers action, what blocks it, what changes, and how it resolves.
- Ignore prose style, title language, hook phrasing, and cosmetic setting details.
- Abstract proper names into functional roles while retaining causally important specifics.
- State the actual reversal or resolution; do not invent a twist when none exists.
- Name a psychological mechanism only when the story demonstrates one. Otherwise use an empty string.
- Keep each value to one concise sentence or phrase.

STORY:
- Title: ${JSON.stringify(candidate.title)}
- Hook: ${JSON.stringify(candidate.hook)}
- Premise: ${JSON.stringify(candidate.premise)}
- Storyline: ${JSON.stringify(candidate.storyline)}
- Key events: ${JSON.stringify(candidate.keyEvents)}
- Twist or resolution: ${JSON.stringify(candidate.twistOrResolution)}
- Lesson: ${JSON.stringify(candidate.lessonOrTakeaway)}
- Existing fingerprint: ${JSON.stringify(candidate.fingerprint)}

Return exactly:
{
  "protagonistArchetype": "...",
  "protagonistGoal": "...",
  "incitingIncident": "...",
  "centralConflict": "...",
  "mainObstacle": "...",
  "reversalOrTwist": "...",
  "resolution": "...",
  "psychologicalMechanism": "...",
  "lesson": "...",
  "setting": "..."
}`;
}

async function extractStoryDna(
  client: LlmClient,
  candidate: StoryCandidate,
  runId?: string,
  stepId?: string,
  model?: string,
): Promise<{ dna: StoryDna; costUsd: number }> {
  const result = await client.call({
    model: model ?? getModel(),
    prompt: buildStoryDnaPrompt(candidate),
    responseJson: true,
    systemInstruction: STORY_DNA_SYSTEM_INSTRUCTION,
    temperature: 0.1,
    maxOutputTokens: 2048,
    capability: "story.dna",
    runId,
    stepId,
  });

  return { dna: (result.json as StoryDna | null) ?? {}, costUsd: result.cost.totalCost };
}

export {
  STORY_DNA_SYSTEM_INSTRUCTION,
  buildStoryDnaPrompt,
  extractStoryDna,
};
