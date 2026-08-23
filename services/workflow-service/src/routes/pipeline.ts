import type { Hono } from "@automation/server";
import { PIPELINE_GRAPH } from "@automation/contracts";

// === Pipeline graph (for frontend) ===

export function registerPipelineRoutes(app: Hono): void {
  // GET /pipeline — get the pipeline graph definition
  app.get("/pipeline", (c) => {
    return c.json({ graph: PIPELINE_GRAPH });
  });
}
