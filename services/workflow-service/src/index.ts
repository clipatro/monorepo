/**
 * workflow-service — Durable runner, step claiming, approvals, SSE.
 *
 * Phase 2: Full workflow engine implementation.
 * - Create and manage workflow runs
 * - Register step handlers (stubs for Phase 3-5, real logic later)
 * - SSE live updates
 * - Approval endpoints
 * - Run history and details
 */

import { startServer, Hono, type AppConfig } from "@automation/server";
import { WorkflowEngine, type StepHandler, type StepHandlerContext } from "@automation/workflow-engine";
import type { StepType } from "@automation/contracts";

// Phase 3 + 4 + 5 real handlers
import {
  conceptIntakeHandler,
  contentClassificationHandler,
  researchHandler,
  noveltyContextHandler,
  generateCandidatesHandler,
  duplicateDetectionHandler,
  scenePlanHandler,
  imagePromptCompilationHandler,
  imageGenerationHandler,
  voiceGenerationHandler,
  audioTimingHandler,
  packageAssemblyHandler,
  videoGenerationHandler,
  clipPromptCompilationHandler,
  clipGenerationHandler,
  flowPromptCompilationHandler,
  flowGenerationHandler,
} from "./handlers.ts";

import { registerRunsRoutes } from "./routes/runs.ts";
import { registerApprovalRoutes } from "./routes/approvals.ts";
import { registerSseRoutes } from "./routes/sse.ts";
import { registerPipelineRoutes } from "./routes/pipeline.ts";
import { registerBackupRoutes } from "./routes/backup.ts";

// === Step handler stubs (for Phase 4-5 steps not yet implemented) ===

function createStubHandler(stepType: StepType): StepHandler {
  return async (ctx: StepHandlerContext) => {
    ctx.log(`[stub] Executing ${stepType} for run ${ctx.runId.slice(0, 8)}`);
    return {
      success: true,
      outputData: {
        stepType,
        message: `Stub execution of ${stepType}`,
        topic: ctx.inputData.topic,
        timestamp: new Date().toISOString(),
      },
    };
  };
}

function setupRoutes(app: Hono, config: AppConfig): void {
  const engine = new WorkflowEngine();

  // Register real handlers for Phase 3 steps
  engine.registerHandler("concept_intake", conceptIntakeHandler);
  engine.registerHandler("content_classification", contentClassificationHandler);
  engine.registerHandler("research", researchHandler);
  engine.registerHandler("novelty_context", noveltyContextHandler);
  engine.registerHandler("generate_candidates", generateCandidatesHandler);
  engine.registerHandler("duplicate_detection", duplicateDetectionHandler);

  // Register real handlers for Phase 4 steps
  engine.registerHandler("scene_plan", scenePlanHandler);
  engine.registerHandler("image_prompt_compilation", imagePromptCompilationHandler);
  engine.registerHandler("image_generation", imageGenerationHandler);

  // Register real handlers for Phase 5 steps
  engine.registerHandler("voice_generation", voiceGenerationHandler);
  engine.registerHandler("audio_timing", audioTimingHandler);
  engine.registerHandler("package_assembly", packageAssemblyHandler);

  // Register real handler for video generation
  engine.registerHandler("video_generation", videoGenerationHandler);

  // D017: Register clip-based template handlers
  engine.registerHandler("clip_prompt_compilation", clipPromptCompilationHandler);
  engine.registerHandler("clip_generation", clipGenerationHandler);

  // D021: Register Flow template handlers (Phase 9)
  engine.registerHandler("flow_prompt_compilation", flowPromptCompilationHandler);
  engine.registerHandler("flow_generation", flowGenerationHandler);

  // Register stub handlers for approval-only steps (no handler needed — pauses run)
  const stubSteps: StepType[] = [
    "story_approval", "script_approval", "image_review",
    "flow_upload", // D021: approval checkpoint — editedData stored as result_data by decideApproval
  ];
  for (const stepType of stubSteps) {
    engine.registerHandler(stepType, createStubHandler(stepType));
  }

  // Start the background reclaim loop
  engine.start();

  // Register route modules
  registerRunsRoutes(app, engine);
  registerApprovalRoutes(app, engine);
  registerSseRoutes(app, engine);
  registerPipelineRoutes(app);
  registerBackupRoutes(app, config);

  // Graceful shutdown — stop the engine
  const originalShutdown = process.listeners("SIGINT")[0];
  if (originalShutdown) {
    process.removeListener("SIGINT", originalShutdown);
    process.on("SIGINT", (...args) => {
      engine.stop();
      originalShutdown(...args);
    });
  }
  const originalTerm = process.listeners("SIGTERM")[0];
  if (originalTerm) {
    process.removeListener("SIGTERM", originalTerm);
    process.on("SIGTERM", (...args) => {
      engine.stop();
      originalTerm(...args);
    });
  }
}

await startServer("workflow-service", setupRoutes);
