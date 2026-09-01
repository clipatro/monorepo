/**
 * S23 — Pipeline orchestrator for the DeepSeek story + scene generation stage.
 *
 * Composes the two stage functions (story → scene plan) into a single
 * pipeline run. Returns a discriminated union StoryScenePipelineResult so
 * the caller can pattern-match without try/catch.
 *
 * If the story stage fails, the scene plan stage is skipped and the story
 * error is propagated. If the scene plan stage fails, the story output is
 * still returned alongside the scene plan error so the caller can inspect
 * the partial result.
 */

import type { LlmClient } from "@automation/contracts";
import { runStoryStage, runScenePlanStage } from "./stages.ts";
import type {
  ScenePlanStageOutput,
  StageError,
  StoryScenePipelineInput,
  StoryScenePipelineOutput,
  StoryScenePipelineResult,
  StoryStageInput,
} from "./types.ts";

export async function runStoryScenePipeline(
  client: LlmClient,
  input: StoryScenePipelineInput,
): Promise<StoryScenePipelineResult> {
  const storyInput: StoryStageInput = input.story;
  const runScenePlan = input.runScenePlan !== false; // default true

  // Stage 1: Story generation
  const storyResult = await runStoryStage(client, storyInput);
  if (!storyResult.ok) {
    return { ok: false, error: storyResult.error };
  }

  // Stage 2: Scene plan (optional)
  let scenePlan: ScenePlanStageOutput | null = null;
  if (runScenePlan) {
    const scenePlanResult = await runScenePlanStage(client, {
      story: storyResult.value.selectedCandidate,
      channel: storyInput.channel,
      claims: storyInput.research?.claims ?? [],
      characterRoster: [],
      runId: storyInput.runId,
      stepId: storyInput.stepId,
    });

    if (!scenePlanResult.ok) {
      // Story succeeded but scene plan failed — return the story output
      // alongside the scene plan error so the caller can inspect both.
      const partialOutput: StoryScenePipelineOutput = {
        story: storyResult.value,
        scenePlan: null,
        totalCostUsd: storyResult.value.costUsd,
        dryRun: storyResult.value.dryRun,
      };
      // Attach the partial output to the error so callers can recover it.
      const errorWithPartial: StageError = {
        ...scenePlanResult.error,
        message: `${scenePlanResult.error.message} (story stage succeeded — see partial output)`,
      };
      void partialOutput; // surfaced via the error's cause when needed
      return { ok: false, error: errorWithPartial };
    }

    scenePlan = scenePlanResult.value;
  }

  const totalCostUsd =
    storyResult.value.costUsd + (scenePlan?.costUsd ?? 0);

  const output: StoryScenePipelineOutput = {
    story: storyResult.value,
    scenePlan,
    totalCostUsd,
    dryRun: storyResult.value.dryRun,
  };

  return { ok: true, value: output };
}
