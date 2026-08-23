/**
 * Migration 009 — Multi-active characters per channel (PostgreSQL).
 *
 * Adds an `is_active` column to the `channel_characters` junction table so
 * a channel can have multiple active characters simultaneously (needed for
 * multi-character stories in Phase 7).
 *
 * The active character *version* is derived at read time: for each junction
 * row with `is_active = 1`, the character's frozen version is used.
 *
 * The legacy `channels.active_character_version_id` column is kept for
 * backward compat but no longer written by new code. Existing values are
 * migrated into the junction table's `is_active` flag.
 *
 * Changes:
 * 1. channel_characters: add is_active INTEGER NOT NULL DEFAULT 0
 * 2. Migrate existing channels.active_character_version_id → junction is_active
 * 3. Index on (channel_id, is_active) for fast active-roster queries
 */

import type { Migration } from "./index.ts";

export const migration009: Migration = {
  id: 9,
  name: "multi-active-characters",
  sql: `
-- === Add is_active column to junction table ===

ALTER TABLE channel_characters ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 0;

-- === Migrate existing active_character_version_id into junction is_active ===
-- For each channel with an active_character_version_id, find the character
-- that owns that version and mark its junction row as active.

UPDATE channel_characters
SET is_active = 1
WHERE (channel_id, character_id) IN (
  SELECT c.id, cv.character_id
  FROM channels c
  JOIN character_versions cv ON cv.id = c.active_character_version_id
  WHERE c.active_character_version_id IS NOT NULL
);

-- === Index for fast active-roster lookups ===

CREATE INDEX IF NOT EXISTS idx_channel_characters_active
  ON channel_characters(channel_id, is_active);
`,
};
