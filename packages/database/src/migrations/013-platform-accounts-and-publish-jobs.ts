/**
 * Migration 013 — Platform accounts and publish jobs (D023, Phase 10).
 *
 * Adds two new tables for the library + publishing system:
 *
 * - `platform_accounts` — Connected social media accounts per channel.
 *   Each channel can have multiple accounts (one YouTube, one TikTok, etc.).
 *   Stores the provider-specific account ID (e.g. Zernio accountId),
 *   username, display name, and metadata.
 *
 * - `publish_jobs` — Tracks publish attempts (video → social platforms).
 *   Stores the target platforms, metadata, provider post ID, per-platform
 *   results, and error information.
 */
import type { Migration } from "./index.ts";

export const migration013: Migration = {
  id: 13,
  name: "platform-accounts-and-publish-jobs",
  sql: [
    `CREATE TABLE IF NOT EXISTS platform_accounts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(channel_id, platform, provider_account_id)
    );`,
    `CREATE TABLE IF NOT EXISTS publish_jobs (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      video_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      platforms_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      provider_post_id TEXT,
      result_json TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );`,
    `CREATE INDEX IF NOT EXISTS idx_platform_accounts_channel ON platform_accounts(channel_id);`,
    `CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform ON platform_accounts(platform);`,
    `CREATE INDEX IF NOT EXISTS idx_publish_jobs_channel ON publish_jobs(channel_id);`,
    `CREATE INDEX IF NOT EXISTS idx_publish_jobs_status ON publish_jobs(status);`,
    `CREATE INDEX IF NOT EXISTS idx_publish_jobs_run ON publish_jobs(run_id);`,
  ].join("\n"),
};
