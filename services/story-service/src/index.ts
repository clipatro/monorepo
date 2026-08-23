/**
 * story-service — Story candidate generation, classification, duplicate detection.
 *
 * Phase 3: Full implementation using Gemini 3.6 Flash.
 *
 * Endpoints:
 * - POST /classify — classify content type (fictional_story / psychology_concept_story / true_case)
 * - POST /generate — generate structured story candidates
 * - POST /duplicates — run multi-layer duplicate detection
 * - POST /novelty — get novelty context (nearest existing stories)
 * - POST /version — freeze a canonical story version
 * - GET /stories — list stories (optionally filtered by channel)
 * - GET /stories/:id — get story with version and DNA
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";
import { createLlmClient } from "@automation/llm-provider";
import { registerClassifyRoutes } from "./routes/classify";
import { registerGenerateRoutes } from "./routes/generate";
import { registerDuplicatesRoutes } from "./routes/duplicates";
import { registerNoveltyRoutes } from "./routes/novelty";
import { registerVersionRoutes } from "./routes/version";
import { registerQueryRoutes } from "./routes/queries";

// === Routes ===

function setupRoutes(app: Hono, config: AppConfig): void {
  // Create the LLM client based on LLM_PROVIDER config (gemini or deepseek)
  const client = createLlmClient(config);
  console.log(`[story-service] LLM provider: ${config.llmProvider}`);

  registerClassifyRoutes(app, config, client);
  registerGenerateRoutes(app, config, client);
  registerDuplicatesRoutes(app, config, client);
  registerNoveltyRoutes(app, config);
  registerVersionRoutes(app, config, client);
  registerQueryRoutes(app, config);
}

await startServer("story-service", setupRoutes);
