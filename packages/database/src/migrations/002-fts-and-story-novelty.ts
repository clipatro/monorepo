/**
 * Migration 002 — Full-text search for lexical duplicate detection + story novelty helpers (PostgreSQL).
 *
 * Creates:
 * - story_fts: table with a tsvector generated column over story titles,
 *   premises, and storylines for lexical similarity search (Layer 2 of
 *   duplicate detection). Replaces SQLite FTS5 virtual table.
 * - story_dna: table for normalized story structure (Layer 4: story-DNA comparison).
 *
 * PostgreSQL replaces FTS5 + MATCH + bm25() with:
 * - tsvector GENERATED ALWAYS AS (to_tsvector('english', ...)) STORED
 * - GIN index on the tsvector column
 * - Query: WHERE search_vector @@ plainto_tsquery('english', $query)
 * - Ranking: ts_rank(search_vector, plainto_tsquery('english', $query))
 *   (higher = better match, opposite of bm25 where lower = better)
 */

import type { Migration } from "./index.ts";

export const migration002: Migration = {
  id: 2,
  name: "fts-and-story-novelty",
  sql: `
-- === Full-text search for lexical duplicate detection (Layer 2) ===
-- Indexes the canonical story version's title, premise, and storyline.
-- The search_vector column is auto-generated from title + premise + storyline.
-- Query with: WHERE search_vector @@ plainto_tsquery('english', $query)
CREATE TABLE IF NOT EXISTS story_fts (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  premise TEXT NOT NULL DEFAULT '',
  storyline TEXT NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(premise, '') || ' ' || coalesce(storyline, ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_story_fts_search ON story_fts USING GIN(search_vector);

-- === Story DNA (Layer 4: structural comparison) ===
-- Normalized story structure fields for catching same-structure-different-words stories.
CREATE TABLE IF NOT EXISTS story_dna (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  protagonist_archetype TEXT,
  protagonist_goal TEXT,
  inciting_incident TEXT,
  central_conflict TEXT,
  main_obstacle TEXT,
  reversal_or_twist TEXT,
  resolution TEXT,
  psychological_mechanism TEXT,
  lesson TEXT,
  setting TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_dna_story ON story_dna(story_id);
  `,
};
