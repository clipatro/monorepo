import type { Hono, AppConfig } from "@automation/server";

export function registerStoryProxyRoutes(app: Hono, config: AppConfig): void {
  // === Story service proxy routes ===

  const STORY_SERVICE_URL = config.services.storyService;

  // POST /api/story/classify — classify content type
  app.post("/api/story/classify", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${STORY_SERVICE_URL}/classify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/story/generate — generate story candidates
  app.post("/api/story/generate", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${STORY_SERVICE_URL}/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/story/duplicates — run duplicate detection
  app.post("/api/story/duplicates", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${STORY_SERVICE_URL}/duplicates`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/story/novelty — get novelty context
  app.post("/api/story/novelty", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${STORY_SERVICE_URL}/novelty`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 500);
  });

  // POST /api/story/version — freeze a canonical story version
  app.post("/api/story/version", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${STORY_SERVICE_URL}/version`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 500);
  });

  // GET /api/story/stories — list stories (with optional search + pagination)
  app.get("/api/story/stories", async (c) => {
    const channelId = c.req.query("channelId");
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const params = new URLSearchParams();
    if (channelId) params.set("channelId", channelId);
    if (search) params.set("search", search);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);

    const qs = params.toString();
    const url = qs
      ? `${STORY_SERVICE_URL}/stories?${qs}`
      : `${STORY_SERVICE_URL}/stories`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/story/stories/:id — get story with version and DNA
  app.get("/api/story/stories/:id", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${STORY_SERVICE_URL}/stories/${id}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });
}
