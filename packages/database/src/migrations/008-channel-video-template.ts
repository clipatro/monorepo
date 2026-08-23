/**
 * Migration 008 — Channel video template field.
 *
 * Adds a `video_template` column to channels to support different video
 * assembly templates. The default is "gameplay-with-image-scenes" (the
 * current approach: gameplay video cuts with image scenes overlaid).
 *
 * Future templates may include video-generation-based clips using different
 * models and HyperFrames configs. For now, only one template exists.
 *
 * D016 — Video template select in channel config.
 */
import type { Migration } from "./index.ts";

export const migration008: Migration = {
  id: 8,
  name: "channel-video-template",
  sql: [
    // Add video_template column with default value
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS video_template TEXT NOT NULL DEFAULT 'gameplay-with-image-scenes';`,
  ].join("\n"),
};
