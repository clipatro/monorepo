/**
 * Migration 013 — Channel voiceover speed.
 *
 * Adds a `voiceover_speed` REAL column to the `channels` table.
 * Controls the playback speed of generated voiceover audio.
 * - 1.0 = normal speed (no speedup)
 * - 1.1 = 10% faster (default for existing channels, matches prior hardcoded behavior)
 * - 0.5–2.0 = supported range
 */
import type { Migration } from "./index.ts";

export const migration013: Migration = {
  id: 13,
  name: "channel-voiceover-speed",
  sql: `ALTER TABLE channels ADD COLUMN IF NOT EXISTS voiceover_speed REAL DEFAULT 1.1;`,
};
