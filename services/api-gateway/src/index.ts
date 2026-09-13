/**
 * api-gateway — Hono facade aggregating all services.
 *
 * Phase 1:
 * - Health check and service registry
 * - Channel CRUD (GET/POST/PUT/DELETE /api/channels)
 * - Character CRUD (GET/POST/PUT/DELETE /api/channels/:channelId/characters)
 * - Character reference upload (POST /api/characters/:characterId/references)
 * - Cost summary endpoint (GET /api/cost/summary)
 * - Proxy routes to generation services (not implemented in Phase 1)
 *
 * No hardcoded channels or characters — everything is database-driven.
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";

import { registerRegistryRoutes } from "./routes/registry";
import { registerChannelRoutes } from "./routes/channels";
import { registerCharacterRoutes } from "./routes/characters";
import { registerCostRoutes } from "./routes/cost";
import { registerSeedRoutes } from "./routes/seed";
import { registerVoiceProxyRoutes } from "./routes/proxy-voice";
import { registerImageProxyRoutes } from "./routes/proxy-image";
import { registerStoryProxyRoutes } from "./routes/proxy-story";
import { registerResearchProxyRoutes } from "./routes/proxy-research";
import { registerEmbeddingProxyRoutes } from "./routes/proxy-embedding";
import { registerWorkflowProxyRoutes } from "./routes/proxy-workflow";
import { registerVideoProxyRoutes } from "./routes/proxy-video";
import { registerPublishProxyRoutes } from "./routes/proxy-publish";
import { registerVideoStagingRoutes } from "./routes/video-staging";
import { registerProviderOptionsRoutes } from "./routes/provider-options";
import { registerTemplateRoutes } from "./routes/templates";

// === Routes ===

function setupRoutes(app: Hono, config: AppConfig): void {
  registerRegistryRoutes(app, config);
  registerChannelRoutes(app, config);
  registerCharacterRoutes(app, config);
  registerCostRoutes(app, config);
  registerSeedRoutes(app, config);
  registerVoiceProxyRoutes(app, config);
  registerImageProxyRoutes(app, config);
  registerStoryProxyRoutes(app, config);
  registerResearchProxyRoutes(app, config);
  registerEmbeddingProxyRoutes(app, config);
  registerWorkflowProxyRoutes(app, config);
  registerVideoProxyRoutes(app, config);
  registerPublishProxyRoutes(app, config);
  registerVideoStagingRoutes(app, config);
  registerProviderOptionsRoutes(app);
  registerTemplateRoutes(app);
}

await startServer("api-gateway", setupRoutes);
