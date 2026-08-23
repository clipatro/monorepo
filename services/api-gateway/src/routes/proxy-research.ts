import type { Hono, AppConfig } from "@automation/server";

export function registerResearchProxyRoutes(app: Hono, config: AppConfig): void {
  // === Research service proxy routes ===

  const RESEARCH_SERVICE_URL = config.services.researchService;

  // POST /api/research/research — perform research
  app.post("/api/research/research", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${RESEARCH_SERVICE_URL}/research`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });
}
