/**
 * embedding-service — Local semantic embeddings for duplicate detection.
 *
 * Phase 3: Full LocalOnnxEmbedder implementation using
 * Xenova/all-MiniLM-L6-v2 via Transformers.js (384 dims, local/free).
 *
 * Endpoints:
 * - POST /embed — embed texts and return vectors
 * - POST /similarity — compute cosine similarity between two texts
 * - GET /health — health check
 */

import { startServer, Hono, type AppConfig } from "@automation/server";
import { registerRoutes } from "./routes.ts";

function setupRoutes(app: Hono, config: AppConfig): void {
  registerRoutes(app, config);
}

await startServer("embedding-service", setupRoutes);
