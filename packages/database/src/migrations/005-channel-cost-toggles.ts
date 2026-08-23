/**
 * Migration 005 — Add research_enabled and duplicate_adjudication_enabled
 * columns to channels.
 *
 * - research_enabled: when false (0), the research step is skipped entirely,
 *   even for non-fictional content types. This saves ~$0.086/run (the Gemini
 *   grounding call is the single most expensive story-side cost). Defaults to
 *   1 (enabled) to preserve existing behavior. Channels producing mainstream
 *   psychology content where the model's training data is sufficient can
 *   disable this to cut costs.
 *
 * - duplicate_adjudication_enabled: when false (0), the Gemini adjudication
 *   layer (Layer 5) of duplicate detection is skipped. Borderline candidates
 *   remain "borderline" without a paid LLM call, and the human at the story
 *   approval gate judges them instead. Layers 1-4 (exact hash, FTS, semantic
 *   embeddings, story-DNA) are all local/free and still run. Defaults to 1
 *   (enabled) to preserve existing behavior.
 */

import type { Migration } from "./index.ts";

export const migration005: Migration = {
  id: 5,
  name: "channel-cost-toggles",
  sql: `
ALTER TABLE channels ADD COLUMN IF NOT EXISTS research_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS duplicate_adjudication_enabled INTEGER NOT NULL DEFAULT 1;
`,
};
