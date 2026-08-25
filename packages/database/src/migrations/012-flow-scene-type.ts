/**
 * Migration 012 — Google Flow scene type and channel flow config (D021).
 *
 * Adds:
 * - `media_type` TEXT column to `scenes` table (default 'video-clip')
 *   Used by flow-hybrid scene type to mark each scene as video-clip or image.
 * - `flow_project_url` TEXT column to `channels` table
 *   Google Flow project URL for auto generation.
 * - `flow_cdp_endpoint` TEXT column to `channels` table
 *   CDP endpoint for Flow automation (default http://127.0.0.1:9222).
 * - `flow_inter_request_delay_ms` INTEGER column to `channels` table
 *   Inter-request delay in ms for serialized Flow generation (default 5000).
 */
import type { Migration } from "./index.ts";

export const migration012: Migration = {
  id: 12,
  name: "flow-scene-type",
  sql: [
    `ALTER TABLE scenes ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'video-clip';`,
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS flow_project_url TEXT;`,
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS flow_cdp_endpoint TEXT DEFAULT 'http://127.0.0.1:9222';`,
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS flow_inter_request_delay_ms INTEGER DEFAULT 5000;`,
  ].join("\n"),
};
