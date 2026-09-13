/**
 * Migration 014 — Scene subtitle position.
 *
 * Adds a `subtitle_position` TEXT column to the `scenes` table.
 * Controls where the subtitle/caption overlay appears for kids-template scenes:
 * - "top" = subtitle at top, characters in lower portion of frame
 * - "bottom" = subtitle at bottom, characters in upper portion of frame
 * - NULL = not set (default, uses template's default behavior)
 *
 * Only used by kids-template scenes (kids-9x16). Other templates ignore this.
 */
import type { Migration } from "./index.ts";

export const migration014: Migration = {
  id: 14,
  name: "scene-subtitle-position",
  sql: `ALTER TABLE scenes ADD COLUMN IF NOT EXISTS subtitle_position TEXT DEFAULT NULL;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS emotion TEXT DEFAULT NULL;`,
};
