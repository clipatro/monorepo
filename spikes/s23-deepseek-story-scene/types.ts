/**
 * S23 — Typed inputs/outputs for the DeepSeek story + scene generation stage.
 *
 * These types are the contract between the spike entry point and the stage
 * functions. They mirror the production contracts in @automation/contracts
 * (StoryCandidate, ContentType) and the image-service ScenePlanItem shape,
 * but are declared locally so the spike is self-contained and type-safe
 * end-to-end without depending on internal service modules.
 *
 * Every stage function returns a discriminated union `StageResult<T>` so
 * errors are typed and visible at the call site — no silent throws.
 */

import type { ContentType, StoryCandidate } from "@automation/contracts";

// === Channel profile (the creative north star) ===

export interface ChannelProfile {
  id: string;
  name: string;
  niche: string;
  locale: string;
  /** Story style guidance, e.g. "direct, conversational, specific". */
  storyStyle: string;
  /** Visual style guidance (used by the scene planner). */
  visualStyle: string;
  /** Target video duration in seconds. */
  targetDurationSeconds: number;
  /** Minimum scene count. */
  sceneMin: number;
  /** Maximum scene count. */
  sceneMax: number;
  /** Output aspect ratio, e.g. "9:16". */
  aspectRatio: string;
  /** Safety rules array (passed through to the prompt). */
  safetyRules: string[];
}

// === Research evidence (optional — DeepSeek cannot ground, but can use
//     pre-grounded research supplied by the caller, e.g. from Gemini) ===

export interface ResearchEvidence {
  sources: Array<{
    id: string;
    title: string;
    url?: string;
    excerpt: string;
  }>;
  claims: Array<{
    id: string;
    claim: string;
    sourceIds: string[];
    confidence: "high" | "medium" | "low";
  }>;
  allowedFacts: string[];
  warnings: string[];
}

// === Character roster (optional — for multi-character scene assignment) ===

export interface CharacterRosterEntry {
  name: string;
  existingCharacterId: string | null;
  bible: {
    age?: string;
    gender?: string;
    personality?: string;
    background?: string;
    relationships?: Record<string, string>;
  };
  hasReferenceImages: boolean;
}

// === Scene plan item (mirrors image-service ScenePlanItem) ===

export interface SceneCharacter {
  name: string;
  roleInScene: "protagonist" | "supporting" | "antagonist";
  poseAndExpression: string;
}

export interface ScenePlanItem {
  order: number;
  storyPurpose: string;
  narrationText: string;
  visualEvent: string;
  characterRole: "protagonist" | "supporting" | "none";
  poseAndExpression: string;
  environment: string;
  cameraFraming: string;
  lightingAndMood: string;
  expectedDurationSeconds: number;
  imageRequirement: "character_scene" | "non_character_scene";
  sourceClaimIds: string[];
  characters: SceneCharacter[];
}

export interface ScenePlan {
  scenes: ScenePlanItem[];
}

// === Stage inputs ===

export interface StoryStageInput {
  topic: string;
  channel: ChannelProfile;
  /** Content type hint. If omitted, the model determines it from the topic. */
  contentType?: ContentType;
  /** Number of candidates to generate. Default: 3. */
  candidateCount?: number;
  /** Optional pre-grounded research evidence. */
  research?: ResearchEvidence;
  /** Optional "avoid repeating" novelty context. */
  noveltyContext?: string;
  /** Optional emotional direction. */
  emotionalDirection?: string;
  /** Required ideas that must materially affect the story. */
  requiredIdeas?: string[];
  /** Ideas that must not appear in the story. */
  forbiddenIdeas?: string[];
  /** Run id for cost tracking. */
  runId?: string;
  /** Step id for cost tracking. */
  stepId?: string;
}

export interface ScenePlanStageInput {
  /** The approved story candidate to plan scenes for. */
  story: StoryCandidate;
  channel: ChannelProfile;
  /** Sourced claims available for scene assignment. */
  claims?: Array<{ id: string; claim: string }>;
  /** Channel character roster available for scene assignment. */
  characterRoster?: CharacterRosterEntry[];
  /** Run id for cost tracking. */
  runId?: string;
  /** Step id for cost tracking. */
  stepId?: string;
}

// === Stage outputs ===

export interface StoryStageOutput {
  candidates: StoryCandidate[];
  /** The candidate selected for downstream scene planning (index 0 by default). */
  selectedCandidate: StoryCandidate;
  selectedIndex: number;
  provider: "deepseek";
  model: string;
  costUsd: number;
  dryRun: boolean;
  /** Token usage from the provider. */
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Raw parsed JSON response, retained for debugging/artifact persistence. */
  rawResponse: unknown;
}

export interface ScenePlanStageOutput {
  scenes: ScenePlanItem[];
  provider: "deepseek";
  model: string;
  costUsd: number;
  dryRun: boolean;
  /** Sum of expectedDurationSeconds across all scenes. */
  totalEstimatedDurationSeconds: number;
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  rawResponse: unknown;
}

// === Typed error ===

export type StageErrorKind =
  | "provider_error" // DeepSeek API returned an error (ProviderError)
  | "invalid_response" // Response was not valid JSON or missing required fields
  | "empty_result" // Response parsed but had zero candidates/scenes
  | "scene_count_violation" // Scene count outside channel min/max
  | "budget_exceeded" // Budget guard rejected the call
  | "unexpected"; // Anything else

export interface StageError {
  kind: StageErrorKind;
  message: string;
  provider: "deepseek";
  model: string;
  /** Whether the error is retryable (transient API issue). */
  retryable: boolean;
  /** The original error cause, if any. */
  cause?: unknown;
  /** Which stage produced the error. */
  stage: "story" | "scene_plan";
}

// === Discriminated result union ===

export type StageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StageError };

// === Pipeline-level composite ===

export interface StoryScenePipelineInput {
  story: StoryStageInput;
  /** Whether to run the scene plan stage after story generation. Default: true. */
  runScenePlan?: boolean;
}

export interface StoryScenePipelineOutput {
  story: StoryStageOutput;
  scenePlan: ScenePlanStageOutput | null;
  totalCostUsd: number;
  dryRun: boolean;
}

export type StoryScenePipelineResult =
  | { ok: true; value: StoryScenePipelineOutput }
  | { ok: false; error: StageError };
