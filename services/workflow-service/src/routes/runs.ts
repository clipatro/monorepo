import type { Hono } from "@automation/server";
import type { WorkflowEngine } from "@automation/workflow-engine";
import type { CreateRunInput } from "@automation/contracts";
import { KNOWN_CONTENT_TYPES } from "@automation/contracts";
import { getRunCostsBatch } from "@automation/cost-tracker";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// === Run management ===

export function registerRunsRoutes(app: Hono, engine: WorkflowEngine): void {
  const createRunSchema = z.object({
    channelId: z.string().min(1),
    topic: z.string().min(1),
    contentType: z.enum(KNOWN_CONTENT_TYPES as [string, ...string[]]).optional(),
    targetDurationSeconds: z.number().int().min(15).max(300).optional(),
    emotionalDirection: z.string().optional(),
    requiredIdeas: z.array(z.string()).optional(),
    forbiddenIdeas: z.array(z.string()).optional(),
    storyline: z.string().optional(),
  });

  // POST /runs — create a new workflow run
  app.post("/runs", zValidator("json", createRunSchema), async (c) => {
    const data = c.req.valid("json") as CreateRunInput;
    const run = await engine.createRun(data);
    // Auto-start the run
    await engine.startRun(run.id);
    return c.json({ run }, 201);
  });

  // GET /runs — list runs with optional server-side search, filter, pagination
  // Query params: channelId, search (topic/ID substring), status, limit, offset
  // When none of search/status/limit/offset are provided, falls back to the
  // legacy behavior (return all runs) for backward compatibility.
  app.get("/runs", async (c) => {
    const channelId = c.req.query("channelId") || undefined;
    const search = c.req.query("search") || undefined;
    const status = c.req.query("status") || undefined;
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");

    const hasPagination = limitParam !== undefined || offsetParam !== undefined;
    const hasSearch = search !== undefined || (status !== undefined && status !== "all");

    if (hasPagination || hasSearch) {
      const result = await engine.listRunsPaginated({
        channelId,
        search,
        status,
        limit: limitParam ? Number(limitParam) : 50,
        offset: offsetParam ? Number(offsetParam) : 0,
      });
      // Attach accurate cost from the cost ledger (not step-level actualCostUsd,
      // which misses handlers that don't return costUsd).
      const costMap = await getRunCostsBatch(result.runs.map((r) => r.id));
      const runs = result.runs.map((r) => ({
        ...r,
        totalCostUsd: costMap[r.id] ?? 0,
      }));
      return c.json({ runs, total: result.total });
    }

    // Legacy: return all runs (no pagination metadata)
    const runs = await engine.listRuns(channelId);
    // Attach accurate cost from the cost ledger for the legacy path too.
    const costMap = await getRunCostsBatch(runs.map((r) => r.id));
    const runsWithCost = runs.map((r) => ({
      ...r,
      totalCostUsd: costMap[r.id] ?? 0,
    }));
    return c.json({ runs: runsWithCost });
  });

  // GET /runs/:id — get full run details
  app.get("/runs/:id", async (c) => {
    const id = c.req.param("id");
    const run = await engine.getRunDetails(id);
    if (!run) return c.json({ error: "Run not found" }, 404);
    // Attach accurate cost from the cost ledger
    const costMap = await getRunCostsBatch([run.id]);
    return c.json({ run: { ...run, totalCostUsd: costMap[run.id] ?? 0 } });
  });

  // POST /runs/:id/cancel — cancel a run
  app.post("/runs/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const run = await engine.getRunDetails(id);
    if (!run) return c.json({ error: "Run not found" }, 404);
    await engine.cancelRun(id);
    return c.json({ run: await engine.getRunDetails(id) });
  });

  // POST /runs/:id/resume — manually trigger processing of a stuck run
  app.post("/runs/:id/resume", async (c) => {
    const id = c.req.param("id");
    const run = await engine.getRunDetails(id);
    if (!run) return c.json({ error: "Run not found" }, 404);
    engine.processRunNow(id);
    return c.json({ run: await engine.getRunDetails(id) });
  });

  // POST /runs/:id/steps/:stepId/rerun — re-run a completed/failed step
  // Body: { cascade?: boolean } — if true, also resets all downstream steps
  app.post("/runs/:id/steps/:stepId/rerun", async (c) => {
    const id = c.req.param("id");
    const stepId = c.req.param("stepId");
    const body = await c.req.json().catch(() => ({})) as { cascade?: boolean };
    const cascade = body.cascade ?? false;

    const run = await engine.getRunDetails(id);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const step = run.steps.find((s) => s.id === stepId);
    if (!step) return c.json({ error: "Step not found in this run" }, 404);

    try {
      const updated = await engine.rerunStep(id, stepId, cascade);
      if (!updated) return c.json({ error: "Failed to re-run step" }, 500);
      return c.json({ run: updated });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
