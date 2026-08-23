/**
 * image-service — Scene planning, prompt compilation, and image generation.
 *
 * Phase 4: Full implementation using Gemini 3.1 Flash Image (standard) for
 * character scenes and Gemini 3.1 Flash Lite Image for non-character scenes.
 *
 * Endpoints:
 * - POST /scene-plan       — plan scenes + narration from an approved story
 * - POST /compile-prompt   — compile a 10-part prompt for a single scene
 * - POST /generate         — generate an image for a scene (Gemini Flash Image)
 * - POST /generate-batch   — generate images for all scenes in a run
 * - POST /accept           — accept a generated image (validate + record asset)
 * - POST /reject           — reject a generated image (retain in history)
 * - POST /flow-prompts     — generate numbered copy-ready prompts for manual Flow
 * - POST /flow-import      — import manually generated images (validate + record)
 * - GET  /scenes/:storyId  — list scenes for a story
 * - GET  /scene/:id        — get a single scene with prompts and images
 * - GET  /images/:sceneId  — list images (accepted + rejected) for a scene
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";
import { createLlmClient } from "@automation/llm-provider";
import { registerScenePlanRoutes } from "./routes/scene-plan";
import { registerCompilePromptRoutes } from "./routes/compile-prompt";
import { registerGenerateRoutes } from "./routes/generate";
import { registerAcceptRejectRoutes } from "./routes/accept-reject";
import { registerFlowRoutes } from "./routes/flow";
import { registerQueryRoutes } from "./routes/queries";

// === Routes ===

function setupRoutes(app: Hono, config: AppConfig): void {
  // Scene planning uses the configured LLM provider (gemini or deepseek)
  // Image generation uses the configured image provider (fal default, or gemini)
  const client = createLlmClient(config);
  const imageProvider = config.imageProvider;
  const charModel = process.env.IMAGE_MODEL_CHARACTER ?? (imageProvider === "fal" ? "fal-ai/flux-2/klein/9b/edit" : "gemini-3.1-flash-image");
  console.log(`[image-service] Scene planning LLM: ${config.llmProvider}, Images: ${imageProvider} (character: ${charModel})`);

  registerScenePlanRoutes(app, config, client);
  registerCompilePromptRoutes(app, config);
  registerGenerateRoutes(app, config);
  registerAcceptRejectRoutes(app, config);
  registerFlowRoutes(app, config);
  registerQueryRoutes(app, config);
}

await startServer("image-service", setupRoutes);
