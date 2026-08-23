import type { Hono, AppConfig } from "@automation/server";

export function registerEmbeddingProxyRoutes(app: Hono, config: AppConfig): void {
  // === Embedding service proxy routes ===

  const EMBEDDING_SERVICE_URL = config.services.embeddingService;

  // POST /api/embedding/embed — embed texts
  app.post("/api/embedding/embed", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/embedding/similarity — compute similarity
  app.post("/api/embedding/similarity", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/similarity`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // GET /api/embedding/model — get model info
  app.get("/api/embedding/model", async (c) => {
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/model`);
    return c.json(await res.json());
  });
}
