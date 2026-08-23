import type { Hono, AppConfig } from "@automation/server";

export function registerImageProxyRoutes(app: Hono, config: AppConfig): void {
  // === Image service proxy routes ===

  const IMAGE_SERVICE_URL = config.services.imageService;

  // POST /api/image/scene-plan — plan scenes from an approved story
  app.post("/api/image/scene-plan", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/scene-plan`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // POST /api/image/compile-prompt — compile a prompt for a single scene
  app.post("/api/image/compile-prompt", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/compile-prompt`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // POST /api/image/generate — generate an image for a single scene
  app.post("/api/image/generate", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // POST /api/image/generate-batch — generate images for all scenes
  app.post("/api/image/generate-batch", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/generate-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 402 | 500);
  });

  // POST /api/image/generate-batch/estimate — cost estimate only (no generation)
  app.post("/api/image/generate-batch/estimate", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/generate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, estimateOnly: true }),
    });
    return c.json(await res.json(), res.status as 200 | 400);
  });

  // POST /api/image/accept — accept a generated image
  app.post("/api/image/accept", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 404);
  });

  // POST /api/image/reject — reject a generated image
  app.post("/api/image/reject", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 404);
  });

  // POST /api/image/flow-prompts — generate numbered prompts for manual Flow
  app.post("/api/image/flow-prompts", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${IMAGE_SERVICE_URL}/flow-prompts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 404 | 500);
  });

  // POST /api/image/flow-import — import manually generated images
  app.post("/api/image/flow-import", async (c) => {
    const formData = await c.req.formData();
    const res = await fetch(`${IMAGE_SERVICE_URL}/flow-import`, { method: "POST", body: formData });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // GET /api/image/gallery — list ALL images across all stories (with search + pagination)
  app.get("/api/image/gallery", async (c) => {
    const params = new URLSearchParams();
    const search = c.req.query("search");
    const channelId = c.req.query("channelId");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    if (search) params.set("search", search);
    if (channelId) params.set("channelId", channelId);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const url = qs
      ? `${IMAGE_SERVICE_URL}/gallery?${qs}`
      : `${IMAGE_SERVICE_URL}/gallery`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/image/scenes/:storyId — list scenes for a story
  app.get("/api/image/scenes/:storyId", async (c) => {
    const storyId = c.req.param("storyId");
    const res = await fetch(`${IMAGE_SERVICE_URL}/scenes/${storyId}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/image/scenes/:storyId/accepted-images — all accepted images for a story
  app.get("/api/image/scenes/:storyId/accepted-images", async (c) => {
    const storyId = c.req.param("storyId");
    const res = await fetch(`${IMAGE_SERVICE_URL}/scenes/${storyId}/accepted-images`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/image/scene/:id — get a single scene with prompts
  app.get("/api/image/scene/:id", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${IMAGE_SERVICE_URL}/scene/${id}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/image/images/:sceneId — list images for a scene
  app.get("/api/image/images/:sceneId", async (c) => {
    const sceneId = c.req.param("sceneId");
    const res = await fetch(`${IMAGE_SERVICE_URL}/images/${sceneId}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/image/asset/:id — serve an image file by asset ID
  app.get("/api/image/asset/:id", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${IMAGE_SERVICE_URL}/asset/${id}`);
    if (!res.ok) return c.json({ error: "Asset not found" }, 404);
    const contentType = res.headers.get("Content-Type") ?? "image/jpeg";
    return new Response(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
}
