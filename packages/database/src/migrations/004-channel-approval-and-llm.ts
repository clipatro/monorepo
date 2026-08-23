/**
 * Migration 004 — Add approval_enabled, llm_config, and image model override
 * columns to channels.
 *
 * - approval_enabled: when false (0), the workflow auto-approves all approval
 *   steps (story_approval, script_approval, image_review) without pausing.
 *   Defaults to 1 (enabled) to preserve existing behavior.
 *
 * - llm_config: per-channel JSON mapping each LLM step to its own
 *   { provider, model } override. When NULL or a step key is missing,
 *   falls back to env vars (LLM_PROVIDER) and provider defaults.
 *   Step keys: classification, research_grounding, research_structuring,
 *   story_candidates, duplicate_adjudication, scene_planning, story_dna.
 *
 * - image_model_character: per-channel override for the character-scene image
 *   model. When NULL, falls back to IMAGE_MODEL_CHARACTER env var or the
 *   provider default.
 *
 * - image_model_non_character: per-channel override for the non-character-scene
 *   image model. When NULL, falls back to IMAGE_MODEL_NON_CHARACTER env var
 *   or the provider default.
 */

import type { Migration } from "./index.ts";

export const migration004: Migration = {
  id: 4,
  name: "channel-approval-and-llm",
  sql: `
ALTER TABLE channels ADD COLUMN IF NOT EXISTS approval_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS llm_config TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS image_model_character TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS image_model_non_character TEXT;
`,
};
