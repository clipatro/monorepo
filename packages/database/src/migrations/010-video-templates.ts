/**
 * Migration 010 — Video templates system (PostgreSQL).
 *
 * Creates two new tables:
 *   - `video_templates` — catalog of available templates (seeded from JSON files)
 *   - `channel_templates` — per-channel template assignment + config overrides
 *
 * Backfills `channel_templates` for every existing channel using the channel's
 * current `video_template` column value and copies the media-specific column
 * values (image_provider, image_model_*, tts_provider, tts_voice_id,
 * aspect_ratio, target_duration_seconds, scene_min, scene_max,
 * video_generation_enabled) into the channel_templates.config JSON as
 * per-channel overrides.
 *
 * The media columns remain on the `channels` table but are no longer the
 * source of truth — active code reads from the merged template config. See D017.
 *
 * PostgreSQL adaptations:
 * - json_object() → json_build_object()::text (config column is TEXT)
 * - hex(randomblob(16)) → gen_random_uuid()::text
 * - datetime('now') → now()
 *
 * D017 — Video templates system.
 */
import type { Migration } from "./index.ts";

export const migration010: Migration = {
  id: 10,
  name: "video-templates",
  sql: [
    // === video_templates — catalog of available templates ===
    `CREATE TABLE IF NOT EXISTS video_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,

    // === channel_templates — per-channel template assignment + overrides ===
    `CREATE TABLE IF NOT EXISTS channel_templates (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES video_templates(id),
      config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(channel_id)
    );`,

    // === Backfill: create channel_templates rows for existing channels ===
    // For each channel, use its video_template column value (default
    // 'gameplay-with-image-scenes') and copy media settings into config JSON.
    // Only backfill if the template exists in video_templates (the seed script
    // populates video_templates; if it hasn't run yet, the backfill is skipped
    // and the seed script will create the channel_templates rows instead).
    `INSERT INTO channel_templates (id, channel_id, template_id, config, is_active)
     SELECT
       gen_random_uuid()::text as id,
       c.id as channel_id,
       COALESCE(c.video_template, 'gameplay-with-image-scenes') as template_id,
       json_build_object(
         'providers', json_build_object(
           'image', json_build_object(
             'defaultProvider', c.image_provider,
             'characterModel', c.image_model_character,
             'nonCharacterModel', c.image_model_non_character
           ),
           'voice', json_build_object(
             'defaultProvider', c.tts_provider,
             'defaultVoiceId', c.tts_voice_id
           )
         ),
         'layout', json_build_object(
           'aspectRatio', c.aspect_ratio
         )
       )::text as config,
       1 as is_active
     FROM channels c
     WHERE NOT EXISTS (
       SELECT 1 FROM channel_templates ct WHERE ct.channel_id = c.id
     )
     AND COALESCE(c.video_template, 'gameplay-with-image-scenes') IN (SELECT id FROM video_templates);`,

    // Index for channel lookups
    `CREATE INDEX IF NOT EXISTS idx_channel_templates_channel ON channel_templates(channel_id);`,
    `CREATE INDEX IF NOT EXISTS idx_channel_templates_template ON channel_templates(template_id);`,
  ].join("\n"),
};
