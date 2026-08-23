import { describe, expect, test } from "bun:test";
import type { ChannelRow, SceneRow, StoryRow } from "@automation/database";
import type { StoryCandidate } from "@automation/contracts";
import {
  CLASSIFICATION_SYSTEM_INSTRUCTION,
  buildClassificationPrompt,
} from "../services/story-service/src/routes/classify";
import {
  STORY_SYSTEM_INSTRUCTION,
  buildStoryGenerationPrompt,
  storyWordBudget,
} from "../services/story-service/src/routes/generate";
import {
  STORY_DNA_SYSTEM_INSTRUCTION,
  buildStoryDnaPrompt,
} from "../services/story-service/src/story-dna";
import {
  ORIGINALITY_SYSTEM_INSTRUCTION,
  buildOriginalityPrompt,
} from "../services/story-service/src/duplicate-detection";
import {
  RESEARCH_SYSTEM_INSTRUCTION,
  buildGroundingPrompt,
  buildStructuringPrompt,
} from "../services/research-service/src/researcher";
import {
  SCENE_PLANNER_SYSTEM_INSTRUCTION,
  buildScenePlanPrompt,
  sceneNarrationWordBudget,
} from "../services/image-service/src/scene-planner";
import {
  buildCharacterIdentity,
  compilePrompt,
} from "../services/image-service/src/prompt-compiler";
import { buildGeminiTtsPrompt } from "../services/voice-service/src/adapters/gemini-tts";

const channel = {
  id: "channel-1",
  name: "Mind in Motion",
  slug: "mind-in-motion",
  niche: "Human psychology through tense, relatable stories",
  locale: "en-US",
  content_types: '["fictional_story","psychology_concept_story","true_case"]',
  target_duration_seconds: 45,
  scene_min: 4,
  scene_max: 8,
  story_style: "direct, observant, emotionally restrained",
  visual_style: "Authentic documentary photography with natural available light",
  safety_rules: '["Never diagnose a real person","Do not fabricate quotes"]',
  active_character_version_id: "character-version-1",
  image_provider: "gemini",
  tts_provider: "kokoro",
  tts_voice_id: "am_michael",
  aspect_ratio: "9:16",
  similarity_policy: "{}",
  approval_enabled: 1,
  llm_config: null,
  image_model_character: null,
  image_model_non_character: null,
  created_at: "2026-08-21",
  updated_at: "2026-08-21",
} satisfies ChannelRow;

const candidate = {
  title: "The Promotion Trap",
  hook: "His promotion made leaving harder.",
  premise: "A capable employee mistakes status for progress and remains in a damaging job.",
  storyline: "His promotion made leaving harder. Each new title looked like progress, but the work kept shrinking his life. When he finally compared what he had gained with what he had stopped doing, the trap became obvious.",
  contentType: "psychology_concept_story",
  emotionalArc: "pride → unease → recognition → agency",
  corePsychologicalIdea: "sunk-cost effects and identity attachment",
  mainCharacterRole: "fictional example",
  keyEvents: ["He accepts a promotion", "His life narrows", "He recognizes the tradeoff"],
  twistOrResolution: "The reward is the mechanism keeping him stuck.",
  lessonOrTakeaway: "Progress that removes your choices may not be progress.",
  fingerprint: "A rewarded employee recognizes that status reinforces a harmful commitment.",
  sourceReferences: ["s1", "s2"],
} satisfies StoryCandidate;

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("classification prompt", () => {
  test("uses channel context and treats user text as data", () => {
    const prompt = buildClassificationPrompt("Why capable people stay in bad jobs", channel);
    expect(prompt).toContain(channel.niche);
    expect(prompt).toContain(channel.locale);
    expect(prompt).toContain("Why capable people stay in bad jobs");
    expect(prompt).toContain("explicitly real");
    expect(CLASSIFICATION_SYSTEM_INSTRUCTION).toContain("untrusted content");
  });
});

describe("story-generation prompt", () => {
  test("locks topic, channel, hook, natural voice, duration, research, and novelty", () => {
    const prompt = buildStoryGenerationPrompt({
      channel: channel.id,
      topic: "Why capable people stay in bad jobs",
      contentType: "psychology_concept_story",
      targetDurationSeconds: 45,
      emotionalDirection: "quiet tension followed by recognition",
      requiredIdeas: ["sunk-cost effect"],
      forbiddenIdeas: ["diagnosing the viewer"],
      candidateCount: 3,
      noveltyContext: "- The Golden Handcuffs",
      research: {
        sources: [{ id: "s1", title: "Work study", excerpt: "Evidence", url: "https://example.com" }],
        claims: [{ id: "c1", claim: "Commitment can escalate after investment", sourceIds: ["s1"], confidence: "high" }],
        allowedFacts: ["Commitment can escalate after investment"],
        warnings: ["Do not diagnose individuals"],
      },
    }, channel, "CHARACTER CONTEXT:\nNo characters currently associated with this channel.");

    const budget = storyWordBudget(45);
    expect(prompt).toContain("Why capable people stay in bad jobs");
    expect(prompt).toContain(channel.niche);
    expect(prompt).toContain(channel.locale);
    expect(prompt).toContain(channel.story_style);
    expect(prompt).toContain("FIRST 2 SECONDS");
    expect(prompt).toContain(`${budget.min}-${budget.max} words`);
    expect(prompt).toContain("Enhance the angle, not the subject");
    expect(prompt).toContain("sunk-cost effect");
    expect(prompt).toContain("diagnosing the viewer");
    expect(prompt).toContain("Commitment can escalate after investment");
    expect(prompt).toContain("The Golden Handcuffs");
    expect(prompt).toContain("What happens next will shock you");
    expect(prompt).toContain("Do not imitate");
    expect(STORY_SYSTEM_INSTRUCTION).toContain("spoken aloud");
  });

  test("calculates a narration-sized word budget", () => {
    expect(storyWordBudget(30)).toEqual({ target: 69, min: 62, max: 76 });
    expect(storyWordBudget(60)).toEqual({ target: 138, min: 124, max: 152 });
  });
});

describe("research prompts", () => {
  test("prioritizes direct evidence and forbids invention", () => {
    const input = {
      channelId: channel.id,
      topic: "Why capable people stay in bad jobs",
      contentType: "psychology_concept_story" as const,
      requiredIdeas: ["escalation of commitment"],
      forbiddenIdeas: ["pop-psychology diagnosis"],
    };
    const grounding = buildGroundingPrompt(input, channel);
    expect(grounding).toContain(channel.locale);
    expect(grounding).toContain("primary");
    expect(grounding).toContain("peer-reviewed");
    expect(grounding).toContain("Do not write the video script");
    expect(grounding).toContain("escalation of commitment");
    expect(grounding).toContain("pop-psychology diagnosis");
    expect(RESEARCH_SYSTEM_INSTRUCTION).toContain("Never fabricate");

    const structured = buildStructuringPrompt(
      input,
      channel,
      "Grounded evidence text",
      [{ title: "Source one", uri: "https://example.com/source" }],
    );
    expect(structured).toContain("Do not invent URLs");
    expect(structured).toContain("atomic claim");
    expect(structured).toContain("allowedFacts");
    expect(structured).toContain("Source one");
  });
});

describe("similarity-analysis prompts", () => {
  test("normalizes story DNA rather than copying prose", () => {
    const prompt = buildStoryDnaPrompt(candidate);
    expect(prompt).toContain("causal structure");
    expect(prompt).toContain("Ignore prose style");
    expect(prompt).toContain(candidate.fingerprint);
    expect(STORY_DNA_SYSTEM_INSTRUCTION).toContain("structural analyst");
  });

  test("does not treat a shared theme as a duplicate", () => {
    const prompt = buildOriginalityPrompt(candidate, {
      title: "The Golden Handcuffs",
      premise: "A worker stays for benefits.",
      storyline: "A worker fears losing benefits and remains.",
      fingerprint: "A worker remains because leaving sacrifices benefits.",
    }, { lexicalScore: 0.4, semanticScore: 0.72, structuralScore: 0.55 });
    expect(prompt).toContain("Shared topic, genre, setting, archetype, or psychological concept alone is not duplication");
    expect(prompt).toContain("causal event sequence");
    expect(ORIGINALITY_SYSTEM_INSTRUCTION).toContain("false positives");
  });
});

describe("scene-planning prompt", () => {
  test("preserves the approved hook and creates narration-ready visual beats", () => {
    const story = {
      id: "story-1",
      channel_id: channel.id,
      run_id: "run-1",
      title: candidate.title,
      content_type: candidate.contentType,
      canonical_version_id: "version-1",
      character_version_id: "character-version-1",
      created_at: "2026-08-21",
      approved_at: "2026-08-21",
    } satisfies StoryRow;
    const prompt = buildScenePlanPrompt(story, candidate, channel, [
      { id: "c1", claim: "Commitment can escalate after investment" },
    ]);
    const budget = sceneNarrationWordBudget(45);
    expect(prompt).toContain(candidate.hook);
    expect(prompt).toContain("opening words");
    expect(prompt).toContain("FIRST 2 SECONDS");
    expect(prompt).toContain(`${budget.min}-${budget.max} words`);
    expect(prompt).toContain("one photographable instant");
    expect(prompt).toContain("Do not add facts, people, events, or claims");
    expect(prompt).toContain(channel.locale);
    expect(prompt).toContain(channel.aspect_ratio);
    expect(prompt).toContain("protagonist");
    expect(SCENE_PLANNER_SYSTEM_INSTRUCTION).toContain("final voice-over");
  });
});

describe("image prompt compiler", () => {
  test("describes identity without hardcoded gender", () => {
    const identity = buildCharacterIdentity({
      name: "Maya",
      gender: "female",
      age: 31,
      eyeColor: "green",
      hairColor: "dark brown",
      hairStyle: "shoulder-length natural waves",
      skinTone: "light olive",
      wardrobe: "a navy overshirt and cream T-shirt",
    });
    expect(identity).toContain("Maya");
    expect(identity).toContain("female");
    expect(identity).not.toContain("his exact");
  });

  test("uses channel style once and adds physical realism plus mobile composition", () => {
    const scene = {
      id: "scene-1",
      story_id: "story-1",
      order: 1,
      story_purpose: "Hook",
      narration_text: candidate.hook,
      visual_event: "A woman pauses with her hand on an office door after reading a promotion email",
      character_role: "none",
      pose_and_expression: "N/A",
      environment: "A real open-plan office at the end of the workday",
      camera_framing: "Eye-level medium shot, natural 50mm perspective",
      lighting_and_mood: "Cool window light with practical office lights, restrained unease",
      expected_duration_seconds: 6,
      image_requirement: "non_character_scene",
      source_claim_ids: "[]",
      created_at: "2026-08-21",
    } satisfies SceneRow;
    const compiled = compilePrompt(scene, channel, null, "9:16");
    expect(occurrences(compiled.prompt, channel.visual_style)).toBe(1);
    expect(compiled.prompt).toContain("single decisive moment");
    expect(compiled.prompt).toContain("authentic editorial photograph");
    expect(compiled.prompt).toContain("essential action inside the central mobile-safe area");
    expect(compiled.prompt).toContain("physically coherent");
    expect(compiled.prompt).toContain("Do not introduce the recurring character");
  });
});

describe("Gemini TTS prompt", () => {
  test("directs natural delivery while preserving exact script", () => {
    const script = "His promotion made leaving harder.";
    const prompt = buildGeminiTtsPrompt(script, "en-US", channel.story_style);
    expect(prompt).toContain("exactly as written");
    expect(prompt).toContain("no announcer voice");
    expect(prompt).toContain("start immediately");
    expect(prompt).toContain(channel.story_style);
    expect(occurrences(prompt, script)).toBe(1);
  });
});
