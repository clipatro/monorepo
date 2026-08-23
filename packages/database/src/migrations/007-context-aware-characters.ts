/**
 * Migration 007 — Context-aware character system (PostgreSQL).
 *
 * Decouples characters from channels (many-to-many via junction table),
 * adds multi-character scene support, optional storyline input on runs,
 * and tracking for auto-created characters.
 *
 * Changes:
 * 1. channel_characters junction table (many-to-many: channel ↔ character)
 * 2. scene_characters table (multi-character per scene)
 * 3. characters: add auto_created, source_run_id; channel_id stays NOT NULL
 *    for backward compat but new code uses the junction table
 * 4. workflow_runs: add storyline (optional storyline input)
 * 5. story_candidates: add character_context (JSON: character assignments + new bibles)
 * 6. stories: add characters_json (JSON: character assignments for this story)
 * 7. Migrate existing character→channel associations into junction table
 * 8. Indexes for new tables
 *
 * PostgreSQL adaptations:
 * - INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
 * - hex(randomblob(16)) → gen_random_uuid()::text
 * - datetime('now') → now()
 */

import type { Migration } from "./index.ts";

export const migration007: Migration = {
  id: 7,
  name: "context-aware-characters",
  sql: `
-- === Junction table: channels ↔ characters (many-to-many) ===

CREATE TABLE IF NOT EXISTS channel_characters (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, character_id)
);

-- === Multi-character per scene ===

CREATE TABLE IF NOT EXISTS scene_characters (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  character_version_id TEXT REFERENCES character_versions(id) ON DELETE SET NULL,
  character_name TEXT NOT NULL,
  role_in_scene TEXT NOT NULL DEFAULT 'supporting',
  pose_and_expression TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === Column additions ===

-- characters: track auto-creation
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS source_run_id TEXT;

-- workflow_runs: optional storyline input
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS storyline TEXT;

-- story_candidates: character context from generation
ALTER TABLE story_candidates ADD COLUMN IF NOT EXISTS character_context TEXT;

-- stories: character assignments for this story
ALTER TABLE stories ADD COLUMN IF NOT EXISTS characters_json TEXT;

-- === Migrate existing character→channel associations into junction table ===

INSERT INTO channel_characters (id, channel_id, character_id, added_at)
SELECT
  gen_random_uuid()::text as id,
  channel_id,
  id as character_id,
  created_at
FROM characters
WHERE channel_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- === Indexes ===

CREATE INDEX IF NOT EXISTS idx_channel_characters_channel ON channel_characters(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_characters_character ON channel_characters(character_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_scene ON scene_characters(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_version ON scene_characters(character_version_id);
CREATE INDEX IF NOT EXISTS idx_characters_auto_created ON characters(auto_created);
CREATE INDEX IF NOT EXISTS idx_characters_source_run ON characters(source_run_id);
`,
};
