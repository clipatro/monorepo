/**
 * Migration 003 — Add aspect_ratio column to channels table.
 *
 * Allows each channel to configure the image aspect ratio used for
 * image generation (e.g. "9:16" for vertical shorts, "16:9" for
 * horizontal, "1:1" for square, "4:5" for portrait).
 *
 * Defaults to "9:16" (vertical short-form) to preserve existing behavior.
 */

import type { Migration } from "./index.ts";

export const migration003: Migration = {
  id: 3,
  name: "channel-aspect-ratio",
  sql: `
ALTER TABLE channels ADD COLUMN IF NOT EXISTS aspect_ratio TEXT NOT NULL DEFAULT '9:16';
`,
};
