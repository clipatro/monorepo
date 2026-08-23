/**
 * research-service — Factual research, source/claim mapping, grounding.
 *
 * Phase 3: Full implementation using Gemini 3.7 Flash with Google Search grounding.
 * Uses a two-step flow:
 *   1. Grounding step: search for sources via google_search tool
 *   2. Structuring step: extract claims, sources, uncertainties from the grounded text
 *
 * Endpoints:
 * - POST /research — perform research and return sources + claims
 * - GET /health — health check
 */

import { startServer, Hono, type AppConfig } from "@automation/server";
import { registerRoutes } from "./routes.ts";

function setupRoutes(app: Hono, config: AppConfig): void {
  registerRoutes(app, config);
}

await startServer("research-service", setupRoutes);
