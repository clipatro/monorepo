import type { Hono, AppConfig } from "@automation/server";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getCostSummary,
  getRecentEntries,
  getRunEntries,
  getRunCostSummary,
  getEntriesPaginated,
  getDistinctValues,
  recordCost,
  type CostBreakdown,
} from "@automation/cost-tracker";

export function registerCostRoutes(app: Hono, _config: AppConfig): void {
  // === Cost tracking ===

  app.get("/api/cost/summary", async (c) => {
    const summary = await getCostSummary();
    return c.json({ summary });
  });

  app.get("/api/cost/budget", (c) => {
    return c.json({
      perRun: Number(process.env.COST_BUDGET_PER_RUN ?? 2.0),
      perDay: Number(process.env.COST_BUDGET_PER_DAY ?? 10.0),
      global: Number(process.env.COST_BUDGET_GLOBAL ?? 100.0),
    });
  });

  app.get("/api/cost/recent", async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    const entries = await getRecentEntries(Math.min(limit, 100));
    return c.json({ entries });
  });

  // Server-side paginated entries with search + filters
  app.get("/api/cost/entries", async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    const offset = Number(c.req.query("offset") ?? 0);
    const search = c.req.query("search") || undefined;
    const capability = c.req.query("capability") || undefined;
    const provider = c.req.query("provider") || undefined;
    const runId = c.req.query("runId") || undefined;
    const isFreeParam = c.req.query("isFree");
    const isFree = isFreeParam === "true" ? true : isFreeParam === "false" ? false : undefined;
    const result = await getEntriesPaginated({ limit, offset, search, capability, provider, runId, isFree });
    return c.json(result);
  });

  // Distinct filter values for the entries table faceted filters
  app.get("/api/cost/filters", (c) => {
    const column = (c.req.query("column") ?? "capability") as "capability" | "provider" | "model";
    const values = getDistinctValues(column);
    return c.json({ values });
  });

  app.get("/api/cost/run/:runId", async (c) => {
    const runId = c.req.param("runId");
    const entries = await getRunEntries(runId);
    const totalCost = entries.reduce((sum, e) => sum + e.totalCost, 0);
    return c.json({ runId, totalCost, entryCount: entries.length, entries });
  });

  app.get("/api/cost/run/:runId/summary", async (c) => {
    const runId = c.req.param("runId");
    const summary = await getRunCostSummary(runId);
    return c.json({ summary });
  });

  // POST /api/cost/record — record a cost entry from a remote service
  // (e.g. the host-side video-service that can't access the Docker volume's
  // cost ledger directly). The cost breakdown is computed by the caller using
  // the shared pricing catalog, and this endpoint persists it.
  const recordCostSchema = z.object({
    breakdown: z.object({
      model: z.string(),
      provider: z.string(),
      inputCost: z.number(),
      outputCost: z.number(),
      imageCost: z.number(),
      groundingCost: z.number(),
      totalCost: z.number(),
      isFree: z.boolean(),
    }),
    options: z.object({
      runId: z.string().optional(),
      stepId: z.string().optional(),
      capability: z.string(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      imageCount: z.number().optional(),
      imageResolution: z.string().optional(),
      groundingQueries: z.number().optional(),
      notes: z.string().optional(),
    }),
  });

  app.post("/api/cost/record", zValidator("json", recordCostSchema), (c) => {
    const { breakdown, options } = c.req.valid("json");
    const entry = recordCost(breakdown as CostBreakdown, options);
    return c.json({ entry }, 201);
  });
}
