/**
 * Types for the workflow engine — step handlers and execution context.
 */

import type { StepType, RunStepDetails, TemplateConfig } from "@automation/contracts";

/**
 * Per-step LLM provider/model override. null = use env default.
 */
export interface LlmStepConfig {
  provider: string | null;
  model: string | null;
}

/**
 * All LLM step keys that can be individually configured per channel.
 */
export type LlmStepKey =
  | "classification"
  | "research_grounding"
  | "research_structuring"
  | "story_candidates"
  | "duplicate_adjudication"
  | "scene_planning"
  | "story_dna";

/**
 * Channel-level configuration passed to step handlers so they can override
 * per-request LLM/TTS/image settings. All fields are nullable — NULL means
 * "fall back to env var / provider default".
 *
 * D017: Media-specific settings (imageProvider, imageModel*, ttsProvider,
 * ttsVoiceId, aspectRatio, videoGenerationEnabled) are now sourced from the
 * merged template config (`template`). The flat fields remain for backward
 * compatibility with existing handlers and are populated from the template's
 * provider defaults + channel overrides during engine build.
 */
export interface ChannelConfig {
  approvalEnabled: boolean;
  llmConfig: Partial<Record<LlmStepKey, LlmStepConfig>> | null;
  imageProvider: string;
  imageModelCharacter: string | null;
  imageModelNonCharacter: string | null;
  ttsProvider: string;
  ttsVoiceId: string;
  aspectRatio: string;
  researchEnabled: boolean;
  duplicateAdjudicationEnabled: boolean;
  videoGenerationEnabled: boolean;
  /** D020: Path to background audio file in the artifact store (null = no background music). */
  backgroundAudioPath: string | null;
  /** D017: Merged effective template config (template defaults + channel overrides). */
  template: TemplateConfig | null;
  /** D017: The template id assigned to this channel (e.g. "gameplay-with-image-scenes"). */
  templateId: string | null;
  // Phase 9 — Google Flow Templates (D021)
  /** D021: Google Flow project URL for auto generation (null = not configured). */
  flowProjectUrl: string | null;
  /** D021: CDP endpoint for Flow automation (default http://127.0.0.1:9222). */
  flowCdpEndpoint: string | null;
  /** D021: Inter-request delay in ms for serialized Flow generation (default 5000). */
  flowInterRequestDelayMs: number | null;
}

/**
 * Context passed to a step handler when a step is executed.
 * Handlers receive the step's input data and return a result.
 */
export interface StepHandlerContext {
  /** The run id. */
  runId: string;
  /** The step id. */
  stepId: string;
  /** The step type. */
  stepType: StepType;
  /** The channel id for this run. */
  channelId: string;
  /** Channel-level config (LLM/TTS/image overrides, approval flag, etc.). */
  channelConfig: ChannelConfig;
  /** Input data from the step record (JSON-parsed). */
  inputData: Record<string, unknown>;
  /** Results of completed dependency steps, keyed by step type. */
  dependencyResults: Partial<Record<StepType, Record<string, unknown>>>;
  /** The attempt number (1-based). */
  attempt: number;
  /** Logger function. */
  log: (message: string) => void;
}

/**
 * Result of a step handler execution.
 */
export interface StepHandlerResult {
  /** Whether the step succeeded. */
  success: boolean;
  /** Output data to persist as the step's result (JSON-serializable). */
  outputData?: Record<string, unknown>;
  /** Error message if the step failed. */
  error?: string;
  /** Whether the failure is retryable (default: true). */
  retryable?: boolean;
  /** Provider used (for audit). */
  provider?: string;
  /** Model used (for audit). */
  model?: string;
  /** Remote request id (for audit). */
  remoteRequestId?: string;
  /** Actual cost in USD. */
  costUsd?: number;
  /** If the step should be skipped (e.g. research not needed for fictional stories). */
  skip?: boolean;
  /** Skip reason. */
  skipReason?: string;
}

/**
 * A handler function for a step type.
 * Registered at service startup. The engine calls it when a step is claimed.
 */
export type StepHandler = (ctx: StepHandlerContext) => Promise<StepHandlerResult>;
