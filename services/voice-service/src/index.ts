/**
 * voice-service — Voice synthesis, scene timing, gameplay video cutting, and export packaging.
 *
 * Phase 5: Full implementation using Kokoro (af_heart, local, free) as primary TTS
 * and Gemini TTS (Algenib) as fallback. Includes FFmpeg normalization, scene-level
 * timing, SRT generation, gameplay video cutting (muted, audio-duration length),
 * and CapCut-ready package assembly with ZIP download.
 *
 * Endpoints:
 * - POST /synthesize       — generate voice-over from narration segments (Kokoro/Gemini)
 * - POST /timing           — generate scene timing records from a voiceover
 * - POST /captions         — generate SRT captions from timing records
 * - POST /gameplay-cut     — cut a muted gameplay video segment matching audio duration
 * - POST /package          — assemble full export package (manifest, timeline CSV, ZIP)
 * - GET  /voiceovers/:storyId — list voiceovers for a story
 * - GET  /voiceover/:id    — get a single voiceover with timings
 * - GET  /download/:runId  — download the export package ZIP
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";

import { registerSynthesizeRoutes } from "./routes/synthesize";
import { registerGameplayRoutes } from "./routes/gameplay";
import { registerPackageRoutes } from "./routes/package";
import { registerVoiceoverRoutes } from "./routes/voiceovers";

// === Routes ===

function setupRoutes(app: Hono, config: AppConfig): void {
	registerSynthesizeRoutes(app, config);
	registerGameplayRoutes(app, config);
	registerPackageRoutes(app, config);
	registerVoiceoverRoutes(app, config);
}

await startServer("voice-service", setupRoutes);
