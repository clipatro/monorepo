/**
 * Migration 006 — Add video_generation_enabled column to channels.
 *
 * - video_generation_enabled: when true (1), the pipeline adds a
 *   video_generation step after package_assembly. This step calls
 *   video-service to render a 9:16 vertical MP4 from the export
 *   package (scene images, gameplay video, voiceover). Defaults to
 *   0 (disabled) to preserve existing behavior — video rendering
 *   adds ~60-90s of processing time per run.
 */

import type { Migration } from "./index.ts";

export const migration006: Migration = {
  id: 6,
  name: "channel-video-toggle",
  sql: `
ALTER TABLE channels ADD COLUMN IF NOT EXISTS video_generation_enabled INTEGER NOT NULL DEFAULT 0;
`,
};
