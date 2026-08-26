/**
 * video-service — Renders vertical videos from export packages.
 *
 * Supports three renderer types:
 *   - gameplay-with-image-scenes: top-half scene images + bottom-half gameplay (FFmpeg)
 *   - ai-video-clips: full-frame AI-generated video clips stitched together (FFmpeg)
 *   - documentary-9x16: Remotion-rendered documentary shorts using the documentary component catalog
 *
 * Takes a Clipatro export folder (manifest.json + assets) and renders a
 * production-ready vertical MP4 using FFmpeg (GPU-accelerated via NVENC + CUDA
 * when available) or Remotion CLI (for documentary templates).
 *
 * Endpoints:
 * - POST /generate             — render an image-based video from an export package
 * - POST /generate-clip        — generate a single AI video clip (D017)
 * - POST /render-clips         — render a clip-based video from pre-generated clips (D017)
 * - POST /render-flow          — render a Flow hybrid video (clips + images mixed) (Phase 9)
 * - POST /render-documentary   — render a documentary video using Remotion CLI
 * - GET  /video/:runId         — stream the rendered MP4
 * - GET  /download/:runId      — download the rendered MP4
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";

import { registerGenerateRoutes } from "./routes/generate";
import { registerVideoRoutes } from "./routes/video";
import { registerClipRoutes } from "./routes/clips";
import { registerDocumentaryRoutes } from "./routes/documentary";

// === Routes ===

function setupRoutes(app: Hono, config: AppConfig): void {
	registerGenerateRoutes(app, config);
	registerClipRoutes(app, config);
	registerVideoRoutes(app, config);
	registerDocumentaryRoutes(app, config);
}

await startServer("video-service", setupRoutes);
