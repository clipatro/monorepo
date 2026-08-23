import type { Hono, AppConfig } from "@automation/server";
import { createLlmClient, createGeminiClient } from "@automation/llm-provider";
import type { ResearchInput } from "@automation/contracts";
import { zValidator } from "@hono/zod-validator";
import { performResearch } from "./researcher.ts";
import { researchSchema } from "./schemas.ts";

export function registerRoutes(app: Hono, config: AppConfig): void {
  // Grounding always uses Gemini (DeepSeek doesn't support web search)
  const groundingClient = createGeminiClient(config);
  // Structuring uses the configured LLM provider (gemini or deepseek)
  const structuringClient = createLlmClient(config);
  console.log(`[research-service] Grounding: gemini, Structuring: ${config.llmProvider}`);

  // POST /research — perform research and return sources + claims
  app.post("/research", zValidator("json", researchSchema), async (c) => {
    const input = c.req.valid("json") as ResearchInput & {
      runId?: string;
      stepId?: string;
      llmProvider?: string;
      llmModel?: string;
      structuringLlm?: { llmProvider?: string; llmModel?: string };
    };

    try {
      const result = await performResearch(
        groundingClient, structuringClient, input,
        input.runId, input.stepId,
        input.llmProvider, input.llmModel,
        input.structuringLlm?.llmProvider, input.structuringLlm?.llmModel,
      );
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[research-service] Research failed:", msg);
      return c.json({ error: "Research failed", details: msg }, 500);
    }
  });
}
