import type { Hono, AppConfig } from "@automation/server";
import type { LlmClient } from "@automation/contracts";
import { getDb } from "@automation/database";
import type { StoryCandidate } from "@automation/contracts";
import { zValidator } from "@hono/zod-validator";
import { duplicatesSchema } from "../schemas";
import { runDuplicateDetection } from "../duplicate-detection";

// === Duplicate detection ===

export function registerDuplicatesRoutes(app: Hono, _config: AppConfig, client: LlmClient): void {
  app.post("/duplicates", zValidator("json", duplicatesSchema), async (c) => {
    const input = c.req.valid("json");
    const db = getDb();

    try {
      const { results, provider, model, costUsd } = await runDuplicateDetection(
        client, input.channelId, input.runId, input.candidates as unknown as StoryCandidate[], input.stepId,
        input.llmProvider, input.llmModel, input.skipAdjudication,
      );
      return c.json({ results, provider, model, costUsd });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Duplicate detection failed", details: msg }, 500);
    }
  });
}
