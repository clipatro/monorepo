/**
 * S23 — DeepSeek Story + Scene Generation Stage Spike.
 *
 * Validates that the @automation/deepseek-client can drive the real story +
 * scene generation stage end-to-end, using the production-grade prompts
 * (retention craft, anti-cliché, visual potential, human voice) trimmed to
 * the scope of this spike.
 *
 * Gated pipeline (each stage persists JSON artifacts to spikes/output/s23/):
 *   1. Story     — DeepSeek V4-Flash generates N structured story candidates
 *                  from a topic + channel profile (+ optional research).
 *   2. Scene Plan— DeepSeek V4-Flash turns the selected candidate into a
 *                  scene-by-scene visual plan with narration, framing,
 *                  lighting, and image requirements.
 *
 * Cost tracking: every paid call goes through checkBudget → calculateCost →
 * recordCost inside DeepSeekClient. Dry-run mode (DRY_RUN=true) returns
 * capability-appropriate dummy data with zero cost.
 *
 * Error handling: every stage returns a typed StageResult<T> discriminated
 * union. The spike entry point pattern-matches on `result.ok` and surfaces
 * structured StageError info — no silent throws.
 *
 * Usage:
 *   bun run spikes/s23-deepseek-story-scene.ts "The bystander effect"
 *   DRY_RUN=true bun run spikes/s23-deepseek-story-scene.ts
 *   bun run spikes/s23-deepseek-story-scene.ts --no-scene-plan
 *   bun run spikes/s23-deepseek-story-scene.ts --self-test
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv, spikeDir, writeArtifact, type SpikeResult } from "./lib/spike.ts";

// ─── Provider + cost tracking ────────────────────────────────────────────────
import { DeepSeekClient } from "@automation/deepseek-client";
import { isDryRun } from "@automation/contracts";

// ─── Spike modules ───────────────────────────────────────────────────────────
import { runStoryStage, runScenePlanStage } from "./s23-deepseek-story-scene/stages.ts";
import { runStoryScenePipeline } from "./s23-deepseek-story-scene/pipeline.ts";
import type {
  ChannelProfile,
  ResearchEvidence,
  StoryScenePipelineInput,
  StoryStageInput,
  StageError,
} from "./s23-deepseek-story-scene/types.ts";

// === Default channel profile (mirrors the seed "Emily's Mediterranean Life" channel) ===

const DEFAULT_CHANNEL: ChannelProfile = {
  id: "spike-s23",
  name: "Spike Test Channel",
  niche: "general short-form storytelling",
  locale: "en-US",
  storyStyle: "direct, conversational, specific, and emotionally controlled",
  visualStyle: "consistent with the channel's established visual identity",
  targetDurationSeconds: 45,
  sceneMin: 4,
  sceneMax: 8,
  aspectRatio: "9:16",
  safetyRules: [],
};

// === Default topic ===

const DEFAULT_TOPIC = "The bystander effect and how observation without action shapes identity";

// === Helpers ===

function costSummary(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function stageErrorSummary(err: StageError): string {
  return `[${err.kind}] stage=${err.stage} model=${err.model} retryable=${err.retryable}: ${err.message}`;
}

function log(stage: string, msg: string): void {
  console.log(`  [${stage}] ${msg}`);
}

// === Self-test: validates the stage functions against the DeepSeek dry-run
//     dummy data without writing artifacts. Used for fast verification. ===

async function runSelfTest(): Promise<SpikeResult> {
  await loadEnv();
  // Force dry-run for the self-test regardless of env, so it always passes
  // without an API key.
  const prevDryRun = process.env.DRY_RUN;
  process.env.DRY_RUN = "true";
  try {
    const client = new DeepSeekClient(null);

    const storyInput: StoryStageInput = {
      topic: DEFAULT_TOPIC,
      channel: DEFAULT_CHANNEL,
      candidateCount: 3,
      runId: "s23-self-test",
      stepId: "self-test-story",
    };

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  S23 — Self-test (forced dry-run, no artifacts written)");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Story stage
    const storyResult = await runStoryStage(client, storyInput);
    if (!storyResult.ok) {
      throw new Error(`Story stage failed in self-test: ${stageErrorSummary(storyResult.error)}`);
    }
    log("Story", `OK — ${storyResult.value.candidates.length} candidates, dryRun=${storyResult.value.dryRun}, ${costSummary(storyResult.value.costUsd)}`);
    log("Story", `  selected: "${storyResult.value.selectedCandidate.title}"`);

    // Scene plan stage
    const scenePlanResult = await runScenePlanStage(client, {
      story: storyResult.value.selectedCandidate,
      channel: DEFAULT_CHANNEL,
      runId: "s23-self-test",
      stepId: "self-test-scene-plan",
    });
    if (!scenePlanResult.ok) {
      throw new Error(`Scene plan stage failed in self-test: ${stageErrorSummary(scenePlanResult.error)}`);
    }
    log("ScenePlan", `OK — ${scenePlanResult.value.scenes.length} scenes, dryRun=${scenePlanResult.value.dryRun}, ${costSummary(scenePlanResult.value.costUsd)}`);
    log("ScenePlan", `  total duration: ${scenePlanResult.value.totalEstimatedDurationSeconds}s`);

    // Pipeline
    const pipelineInput: StoryScenePipelineInput = {
      story: { ...storyInput, runId: "s23-self-test-pipeline" },
    };
    const pipelineResult = await runStoryScenePipeline(client, pipelineInput);
    if (!pipelineResult.ok) {
      throw new Error(`Pipeline failed in self-test: ${stageErrorSummary(pipelineResult.error)}`);
    }
    log("Pipeline", `OK — total ${costSummary(pipelineResult.value.totalCostUsd)}, ${pipelineResult.value.scenePlan?.scenes.length ?? 0} scenes`);

    console.log("\n  Self-test PASSED.\n");

    return {
      id: "s23",
      name: "DeepSeek Story + Scene Generation (self-test)",
      goal: "Verify the S23 stage functions execute end-to-end in forced dry-run mode.",
      result: "pass",
      measurements: {
        dryRun: true,
        candidates: storyResult.value.candidates.length,
        scenes: scenePlanResult.value.scenes.length,
        totalCostUsd: pipelineResult.value.totalCostUsd.toFixed(4),
      },
      notes: "Self-test passed: story + scene plan stages both produced valid typed output in forced dry-run mode.",
      artifactPaths: [],
    };
  } finally {
    if (prevDryRun === undefined) {
      delete process.env.DRY_RUN;
    } else {
      process.env.DRY_RUN = prevDryRun;
    }
  }
}

// === Main run: full gated pipeline with artifact persistence ===

export async function run(): Promise<SpikeResult> {
  await loadEnv();

  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    return runSelfTest();
  }

  const runScenePlan = !args.includes("--no-scene-plan");
  const topicArg = args.find((a) => !a.startsWith("--"));
  const topic = topicArg ?? DEFAULT_TOPIC;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  S23 — DeepSeek Story + Scene Generation Stage Spike");
  console.log(`  Topic: "${topic}"`);
  console.log(`  Channel: ${DEFAULT_CHANNEL.name} (${DEFAULT_CHANNEL.niche})`);
  console.log(`  Scene plan stage: ${runScenePlan ? "ENABLED" : "DISABLED"}`);
  console.log(`  Dry-run: ${isDryRun() ? "YES (no paid calls)" : "NO (real DeepSeek API calls)"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const outDir = await spikeDir("s23");
  const client = new DeepSeekClient(process.env.DEEPSEEK_API_KEY ?? null);

  // Optional pre-grounded research evidence (none for this spike — DeepSeek
  // cannot ground, and we keep the spike self-contained). Declared with an
  // explicit type annotation so TS does not narrow it to `undefined`.
  const research: ResearchEvidence | undefined =
    undefined as ResearchEvidence | undefined;

  const storyInput: StoryStageInput = {
    topic,
    channel: DEFAULT_CHANNEL,
    candidateCount: 3,
    research,
    runId: `s23-${Date.now()}`,
    stepId: "s23-story",
  };

  // ─── Stage 1: Story generation ─────────────────────────────────────────────
  console.log("▸ Stage 1: Story generation (DeepSeek V4-Flash)...\n");
  const storyResult = await runStoryStage(client, storyInput);

  if (!storyResult.ok) {
    console.error(`\n✗ Story stage failed: ${stageErrorSummary(storyResult.error)}`);
    return {
      id: "s23",
      name: "DeepSeek Story + Scene Generation",
      goal: `Generate story candidates + scene plan for topic "${topic}" via DeepSeek.`,
      result: "fail",
      measurements: {
        topic,
        dryRun: isDryRun(),
        storyStageOk: false,
        errorKind: storyResult.error.kind,
        errorRetryable: storyResult.error.retryable,
      },
      notes: `Story stage failed: ${storyResult.error.message}`,
      artifactPaths: [],
    };
  }

  const story = storyResult.value;
  await writeArtifact("s23", "01-story.json", JSON.stringify(story, null, 2));
  log("Story", `OK — ${story.candidates.length} candidates, ${costSummary(story.costUsd)}`);
  for (const c of story.candidates) {
    log("Story", `  - "${c.title}" [${c.contentType}] hook: "${c.hook.slice(0, 60)}${c.hook.length > 60 ? "…" : ""}"`);
  }
  log("Story", `  selected index ${story.selectedIndex}: "${story.selectedCandidate.title}"`);
  console.log();

  // ─── Stage 2: Scene plan (optional) ────────────────────────────────────────
  let scenePlanArtifact: { scenes: unknown[]; costUsd: number; totalEstimatedDurationSeconds: number } | null = null;
  if (runScenePlan) {
    console.log("▸ Stage 2: Scene plan generation (DeepSeek V4-Flash)...\n");
    const scenePlanResult = await runScenePlanStage(client, {
      story: story.selectedCandidate,
      channel: DEFAULT_CHANNEL,
      claims: research?.claims ?? [],
      runId: storyInput.runId,
      stepId: "s23-scene-plan",
    });

    if (!scenePlanResult.ok) {
      console.error(`\n✗ Scene plan stage failed: ${stageErrorSummary(scenePlanResult.error)}`);
      await writeArtifact("s23", "02-scene-plan-error.json", JSON.stringify(scenePlanResult.error, null, 2));
      return {
        id: "s23",
        name: "DeepSeek Story + Scene Generation",
        goal: `Generate story candidates + scene plan for topic "${topic}" via DeepSeek.`,
        result: "partial",
        measurements: {
          topic,
          dryRun: isDryRun(),
          storyStageOk: true,
          scenePlanStageOk: false,
          candidates: story.candidates.length,
          storyCostUsd: story.costUsd.toFixed(4),
          errorKind: scenePlanResult.error.kind,
        },
        notes: `Story stage succeeded but scene plan failed: ${scenePlanResult.error.message}`,
        artifactPaths: [join(outDir, "01-story.json"), join(outDir, "02-scene-plan-error.json")],
      };
    }

    const scenePlan = scenePlanResult.value;
    scenePlanArtifact = {
      scenes: scenePlan.scenes,
      costUsd: scenePlan.costUsd,
      totalEstimatedDurationSeconds: scenePlan.totalEstimatedDurationSeconds,
    };
    await writeArtifact("s23", "02-scene-plan.json", JSON.stringify(scenePlan, null, 2));
    log("ScenePlan", `OK — ${scenePlan.scenes.length} scenes, ${costSummary(scenePlan.costUsd)}`);
    for (const s of scenePlan.scenes) {
      log("ScenePlan", `  ${s.order}. [${s.imageRequirement}] ${s.storyPurpose} — "${s.narrationText.slice(0, 50)}${s.narrationText.length > 50 ? "…" : ""}" (${s.expectedDurationSeconds}s)`);
    }
    log("ScenePlan", `  total estimated duration: ${scenePlan.totalEstimatedDurationSeconds}s`);
    console.log();
  }

  // ─── Pipeline-level summary ────────────────────────────────────────────────
  const pipelineInput: StoryScenePipelineInput = { story: storyInput, runScenePlan };
  const pipelineResult = await runStoryScenePipeline(client, pipelineInput);
  // The pipeline re-runs the stages; in dry-run this is free. We use it only
  // to validate the orchestrator path. In a real run we would not re-run.
  const pipelineOk = pipelineResult.ok;

  const totalCostUsd = story.costUsd + (scenePlanArtifact?.costUsd ?? 0);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SPIKE SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Topic:    "${topic}"`);
  console.log(`  Dry-run:  ${isDryRun() ? "YES" : "NO"}`);
  console.log(`  Candidates: ${story.candidates.length}`);
  console.log(`  Selected:  "${story.selectedCandidate.title}"`);
  if (scenePlanArtifact) {
    console.log(`  Scenes:    ${scenePlanArtifact.scenes.length}`);
    console.log(`  Est. duration: ${scenePlanArtifact.totalEstimatedDurationSeconds}s`);
  }
  console.log(`  Total cost: ${costSummary(totalCostUsd)}`);
  console.log(`  Pipeline orchestrator: ${pipelineOk ? "OK" : "FAILED"}`);
  console.log(`\n  Artifacts: ${outDir}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const artifactPaths = [join(outDir, "01-story.json")];
  if (scenePlanArtifact) artifactPaths.push(join(outDir, "02-scene-plan.json"));

  const result: "pass" | "partial" =
    scenePlanArtifact && pipelineOk ? "pass" : scenePlanArtifact ? "partial" : "partial";

  return {
    id: "s23",
    name: "DeepSeek Story + Scene Generation",
    goal: `Generate story candidates + scene plan for topic "${topic}" via DeepSeek V4-Flash.`,
    result,
    measurements: {
      topic,
      dryRun: isDryRun(),
      candidates: story.candidates.length,
      selectedTitle: story.selectedCandidate.title,
      scenes: scenePlanArtifact?.scenes.length ?? 0,
      estimatedDurationSec: scenePlanArtifact?.totalEstimatedDurationSeconds ?? 0,
      totalCostUsd: totalCostUsd.toFixed(4),
      storyCostUsd: story.costUsd.toFixed(4),
      scenePlanCostUsd: scenePlanArtifact?.costUsd.toFixed(4) ?? "0",
      pipelineOrchestratorOk: pipelineOk,
    },
    notes: scenePlanArtifact
      ? `DeepSeek generated ${story.candidates.length} story candidates and a ${scenePlanArtifact.scenes.length}-scene plan. Total cost ${costSummary(totalCostUsd)}.`
      : `DeepSeek generated ${story.candidates.length} story candidates. Scene plan stage was disabled or failed. Total cost ${costSummary(totalCostUsd)}.`,
    artifactPaths,
  };
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  run()
    .then((result) => {
      console.log(`\nResult: ${result.result}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Spike failed:", err);
      process.exit(1);
    });
}
