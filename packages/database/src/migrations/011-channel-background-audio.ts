/**
 * Migration 011 — Channel background audio.
 *
 * Adds a `background_audio_path` column to the `channels` table.
 * When set, the video-service mixes this audio file into every video
 * generated for the channel — trimmed to the video duration with a
 * fade-out at the end, and at a low volume so it sits under the voiceover.
 *
 * The path points to a file in the artifact store
 * (e.g. /app/data/artifacts/channels/<id>/background-audio.mp3).
 */
import type { Migration } from "./index.ts";

export const migration011: Migration = {
  id: 11,
  name: "channel-background-audio",
  sql: [
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS background_audio_path TEXT;`,
  ].join("\n"),
};
