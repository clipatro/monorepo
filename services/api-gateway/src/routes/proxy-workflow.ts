import type { Hono, AppConfig } from "@automation/server";

export function registerWorkflowProxyRoutes(app: Hono, config: AppConfig): void {
  // === Workflow proxy routes (to workflow-service) ===

  const WORKFLOW_SERVICE_URL = config.services.workflowService;

  // GET /api/workflow/pipeline — get pipeline graph
  app.get("/api/workflow/pipeline", async (c) => {
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/pipeline`);
    return c.json(await res.json());
  });

  // POST /api/workflow/backup — create a backup
  app.post("/api/workflow/backup", async (c) => {
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/backup`, { method: "POST" });
    return c.json(await res.json(), res.status as 200 | 201 | 500);
  });

  // GET /api/workflow/backups — list backups
  app.get("/api/workflow/backups", async (c) => {
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/backups`);
    return c.json(await res.json());
  });

  // POST /api/workflow/restore — restore from a backup
  app.post("/api/workflow/restore", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/workflow/runs — create a new workflow run
  app.post("/api/workflow/runs", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // GET /api/workflow/runs — list runs (with optional server-side search/filter/pagination)
  app.get("/api/workflow/runs", async (c) => {
    const channelId = c.req.query("channelId");
    const search = c.req.query("search");
    const status = c.req.query("status");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const params = new URLSearchParams();
    if (channelId) params.set("channelId", channelId);
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);

    const qs = params.toString();
    const url = qs
      ? `${WORKFLOW_SERVICE_URL}/runs?${qs}`
      : `${WORKFLOW_SERVICE_URL}/runs`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/workflow/runs/:id — get run details
  app.get("/api/workflow/runs/:id", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs/${id}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // POST /api/workflow/runs/:id/cancel — cancel a run
  app.post("/api/workflow/runs/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs/${id}/cancel`, { method: "POST" });
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // POST /api/workflow/runs/:id/resume — manually resume a stuck run
  app.post("/api/workflow/runs/:id/resume", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs/${id}/resume`, { method: "POST" });
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // POST /api/workflow/runs/:id/steps/:stepId/rerun — re-run a completed/failed step
  app.post("/api/workflow/runs/:id/steps/:stepId/rerun", async (c) => {
    const id = c.req.param("id");
    const stepId = c.req.param("stepId");
    const body = await c.req.json().catch(() => ({}));
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs/${id}/steps/${stepId}/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 404 | 500);
  });

  // POST /api/workflow/approvals — submit an approval decision
  app.post("/api/workflow/approvals", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/workflow/runs/:id/approvals — list pending approvals
  app.get("/api/workflow/runs/:id/approvals", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${WORKFLOW_SERVICE_URL}/runs/${id}/approvals`);
    return c.json(await res.json(), res.status as 200 | 404);
  });
}
