/**
 * publish-service — Library and social media publishing (Phase 10, D023).
 *
 * Provides:
 * - Platform account management (connect/disconnect social accounts via Zernio OAuth)
 * - Video publishing to YouTube, TikTok, Instagram, Facebook, and other platforms
 * - Publish job tracking with per-platform status
 * - Library endpoints for browsing rendered videos
 *
 * Uses the facade/adapter pattern: ZernioAdapter implements the Publisher
 * interface. Swapping to another provider (Postiz, Buffer, direct APIs)
 * requires only a new adapter — no route changes.
 *
 * Endpoints:
 * - GET  /platforms                    — list supported platforms
 * - GET  /accounts/:channelId          — list connected accounts for a channel
 * - POST /accounts/connect             — get OAuth URL to connect a platform
 * - POST /accounts/callback            — handle OAuth callback (store account)
 * - DELETE /accounts/:channelId/:platform/:accountId — disconnect an account
 * - POST /publish                      — upload video and publish to platforms
 * - GET  /jobs/:channelId              — list publish jobs for a channel
 * - GET  /job/:jobId                   — get a single publish job with results
 * - GET  /library/:channelId           — list rendered videos (library)
 * - GET  /library/video/:assetId       — stream a video file
 */

import { startServer, type Hono, type AppConfig } from "@automation/server";

import { registerAccountRoutes } from "./routes/accounts";
import { registerPublishRoutes } from "./routes/publish";
import { registerLibraryRoutes } from "./routes/library";

function setupRoutes(app: Hono, config: AppConfig): void {
  registerAccountRoutes(app, config);
  registerPublishRoutes(app, config);
  registerLibraryRoutes(app, config);
}

await startServer("publish-service", setupRoutes);
