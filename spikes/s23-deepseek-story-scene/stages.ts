/**
 * S23 — Stage functions for the DeepSeek story + scene generation stage.
 *
 * Each stage is a pure async function that:
 *   1. Builds a typed prompt from typed input.
 *   2. Calls DeepSeekClient (which implements @automation/contracts LlmClient).
 *      The client handles dry-run mode, budget checks, cost tracking, and
 *      JSON extraction internally — we just consume the typed LlmCallResult.
 *   3. Validates the parsed JSON response against the expected shape.
 *   4. Returns a discriminated union StageResult<T> — never throws.
 *
 * Error handling is explicit and typed: every failure path produces a
 * StageError with a `kind`, the provider/model context, and a `retryable`
 * flag. The caller can pattern-match on `result.ok` without try/catch.
 */

import { ProviderError, type LlmClient, type StoryCandidate } from "@automation/contracts";
import {
  buildStoryPrompt,
  buildScenePlanPrompt,
  STORY_SYSTEM_INSTRUCTION,
  SCENE_PLANNER_SYSTEM_INSTRUCTION,
} from "./prompts.ts";
import type {
  ScenePlan,
  ScenePlanItem,
  ScenePlanStageInput,
  ScenePlanStageOutput,
  StageError,
  StageResult,
  StoryStageInput,
  StoryStageOutput,
} from "./types.ts";

// === Model id — matches services/story-service/src/constants.ts DEEPSEEK_MODEL ===
const DEEPSEEK_MODEL = "deepseek-v4-flash";

// === Internal helpers ===

function providerErrorToStageError(
  err: ProviderError,
  stage: "story" | "scene_plan",
): StageError {
  const isBudget = /budget exceeded/i.test(err.message);
  return {
    kind: isBudget ? "budget_exceeded" : "provider_error",
    message: err.message,
    provider: "deepseek",
    model: err.model ?? DEEPSEEK_MODEL,
    retryable: err.retryable ?? false,
    cause: err,
    stage,
  };
}

function unexpectedErrorToStageError(
  err: unknown,
  stage: "story" | "scene_plan",
): StageError {
  const message = err instanceof Error ? err.message : String(err);
  return {
    kind: "unexpected",
    message,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    retryable: false,
    cause: err,
    stage,
  };
}

// === Stage 1: Story generation ===

/**
 * Generate story candidates via DeepSeek.
 *
 * Returns a StageResult — never throws. On success, `value.selectedCandidate`
 * is the first candidate (index 0), which is the convention used by the
 * production story pipeline.
 */
export async function runStoryStage(
  client: LlmClient,
  input: StoryStageInput,
): Promise<StageResult<StoryStageOutput>> {
  const prompt = buildStoryPrompt(input);

  let result;
  try {
    result = await client.call({
      model: DEEPSEEK_MODEL,
      prompt,
      responseJson: true,
      systemInstruction: STORY_SYSTEM_INSTRUCTION,
      temperature: 0.75,
      maxOutputTokens: 8192,
      capability: "story.generate",
      runId: input.runId,
      stepId: input.stepId,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, error: providerErrorToStageError(err, "story") };
    }
    return { ok: false, error: unexpectedErrorToStageError(err, "story") };
  }

  // Validate response shape
  const parsed = result.json as { candidates?: unknown[] } | null;
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message:
          "DeepSeek response was not valid JSON or could not be parsed as an object.",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: false,
        cause: result.text,
        stage: "story",
      },
    };
  }

  if (!Array.isArray(parsed.candidates)) {
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message:
          'DeepSeek response missing "candidates" array. Response did not match the expected JSON schema.',
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: false,
        cause: parsed,
        stage: "story",
      },
    };
  }

  if (parsed.candidates.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty_result",
        message: "DeepSeek returned zero story candidates.",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: true,
        stage: "story",
      },
    };
  }

  const candidates = parsed.candidates as StoryCandidate[];
  const selectedIndex = 0;
  const selectedCandidate = candidates[selectedIndex];

  if (!selectedCandidate) {
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Selected candidate (index 0) was undefined despite non-empty array.",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: false,
        stage: "story",
      },
    };
  }

  const output: StoryStageOutput = {
    candidates,
    selectedCandidate,
    selectedIndex,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    costUsd: result.cost.totalCost,
    dryRun: result.dryRun === true,
    usage: result.usage,
    rawResponse: parsed,
  };

  return { ok: true, value: output };
}

// === Stage 2: Scene plan generation ===

/**
 * Generate a scene plan from an approved story candidate via DeepSeek.
 *
 * Returns a StageResult — never throws. Validates that the response contains
 * a non-empty scenes array and that the scene count falls within the
 * channel's [sceneMin, sceneMax] bounds.
 */
export async function runScenePlanStage(
  client: LlmClient,
  input: ScenePlanStageInput,
): Promise<StageResult<ScenePlanStageOutput>> {
  const { story, channel, claims = [], characterRoster = [] } = input;
  const prompt = buildScenePlanPrompt(story, channel, claims, characterRoster);

  let result;
  try {
    result = await client.call({
      model: DEEPSEEK_MODEL,
      prompt,
      responseJson: true,
      systemInstruction: SCENE_PLANNER_SYSTEM_INSTRUCTION,
      temperature: 0.55,
      maxOutputTokens: 8192,
      capability: "image.scene_plan",
      runId: input.runId,
      stepId: input.stepId,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, error: providerErrorToStageError(err, "scene_plan") };
    }
    return { ok: false, error: unexpectedErrorToStageError(err, "scene_plan") };
  }

  const parsed = result.json as ScenePlan | null;
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message: "DeepSeek scene plan response was not valid JSON.",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: false,
        cause: result.text,
        stage: "scene_plan",
      },
    };
  }

  if (!Array.isArray(parsed.scenes)) {
    return {
      ok: false,
      error: {
        kind: "invalid_response",
        message:
          'DeepSeek scene plan response missing "scenes" array.',
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: false,
        cause: parsed,
        stage: "scene_plan",
      },
    };
  }

  if (parsed.scenes.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty_result",
        message: "DeepSeek returned zero scenes.",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: true,
        stage: "scene_plan",
      },
    };
  }

  const scenes = parsed.scenes as ScenePlanItem[];

  // Enforce channel scene count bounds (mirrors production scene-planner.ts)
  if (scenes.length > channel.sceneMax) {
    // Truncate rather than fail — matches production behavior
    scenes.length = channel.sceneMax;
    scenes.forEach((s, i) => (s.order = i + 1));
  }

  if (scenes.length < channel.sceneMin) {
    return {
      ok: false,
      error: {
        kind: "scene_count_violation",
        message: `DeepSeek returned ${scenes.length} scenes, minimum is ${channel.sceneMin}.`,
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        retryable: true,
        stage: "scene_plan",
      },
    };
  }

  const totalEstimatedDurationSeconds = scenes.reduce(
    (sum, s) => sum + (s.expectedDurationSeconds ?? 0),
    0,
  );

  const output: ScenePlanStageOutput = {
    scenes,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    costUsd: result.cost.totalCost,
    dryRun: result.dryRun === true,
    totalEstimatedDurationSeconds,
    usage: result.usage,
    rawResponse: parsed,
  };

  return { ok: true, value: output };
}
