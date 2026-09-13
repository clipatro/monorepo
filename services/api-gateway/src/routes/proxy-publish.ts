/**
 * Publish service proxy routes — proxies all publish-service endpoints
 * through the API gateway under /api/publish/*.
 */

import type { Hono, AppConfig } from "@automation/server";

export function registerPublishProxyRoutes(app: Hono, config: AppConfig): void {
  const PUBLISH_SERVICE_URL = config.services.publishService;

  // GET /api/publish/platforms — list supported platforms
  app.get("/api/publish/platforms", async (c) => {
    const res = await fetch(`${PUBLISH_SERVICE_URL}/platforms`);
    return c.json(await res.json());
  });

  // GET /api/publish/accounts/:channelId — list connected accounts
  app.get("/api/publish/accounts/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const platform = c.req.query("platform");
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    const qs = params.toString();
    const url = qs
      ? `${PUBLISH_SERVICE_URL}/accounts/${channelId}?${qs}`
      : `${PUBLISH_SERVICE_URL}/accounts/${channelId}`;
    const res = await fetch(url);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // POST /api/publish/accounts/connect — get OAuth URL
  app.post("/api/publish/accounts/connect", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${PUBLISH_SERVICE_URL}/accounts/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 500);
  });

  // POST /api/publish/accounts/callback — store connected account
  app.post("/api/publish/accounts/callback", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${PUBLISH_SERVICE_URL}/accounts/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400);
  });

  // DELETE /api/publish/accounts/:channelId/:platform/:accountId
  app.delete(
    "/api/publish/accounts/:channelId/:platform/:accountId",
    async (c) => {
      const channelId = c.req.param("channelId");
      const platform = c.req.param("platform");
      const accountId = c.req.param("accountId");
      const res = await fetch(
        `${PUBLISH_SERVICE_URL}/accounts/${channelId}/${platform}/${accountId}`,
        { method: "DELETE" },
      );
      return c.json(await res.json(), res.status as 200 | 404);
    },
  );

  // POST /api/publish/publish — upload and publish video
  app.post("/api/publish/publish", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${PUBLISH_SERVICE_URL}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 404 | 500);
  });

  // GET /api/publish/jobs/:channelId — list publish jobs
  app.get("/api/publish/jobs/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const params = new URLSearchParams();
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const url = qs
      ? `${PUBLISH_SERVICE_URL}/jobs/${channelId}?${qs}`
      : `${PUBLISH_SERVICE_URL}/jobs/${channelId}`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/publish/job/:jobId — get a single publish job
  app.get("/api/publish/job/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const res = await fetch(`${PUBLISH_SERVICE_URL}/job/${jobId}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/publish/library/all — list all rendered videos
  app.get("/api/publish/library/all", async (c) => {
    const params = new URLSearchParams();
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    if (search) params.set("search", search);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const url = qs
      ? `${PUBLISH_SERVICE_URL}/library/all?${qs}`
      : `${PUBLISH_SERVICE_URL}/library/all`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/publish/library/:channelId — list videos for a channel
  app.get("/api/publish/library/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const params = new URLSearchParams();
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    if (search) params.set("search", search);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const url = qs
      ? `${PUBLISH_SERVICE_URL}/library/${channelId}?${qs}`
      : `${PUBLISH_SERVICE_URL}/library/${channelId}`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/publish/library/video/:assetId — stream video file
  app.get("/api/publish/library/video/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const range = c.req.header("range");
    const reqHeaders: Record<string, string> = {};
    if (range) reqHeaders["range"] = range;

    const res = await fetch(`${PUBLISH_SERVICE_URL}/library/video/${assetId}`, {
      headers: reqHeaders,
    });
    if (!res.ok) return c.json({ error: "Video not found" }, 404);

    const headers: Record<string, string> = {
      "Content-Type": res.headers.get("content-type") ?? "video/mp4",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const contentLength = res.headers.get("content-length");
    const contentRange = res.headers.get("content-range");
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(res.body, { status: res.status, headers });
  });
}
