import type { Hono, AppConfig } from "@automation/server";

export function registerVideoProxyRoutes(app: Hono, config: AppConfig): void {
  const VIDEO_SERVICE_URL = config.services.videoService;

  // POST /api/video/generate — render a video from an export package
  // Proxies to the video-service, passing the api-gateway URL so the
  // video-service can download the export bundle and upload the result.
  app.post("/api/video/generate", async (c) => {
    const body = await c.req.json();
    // Inject the api-gateway URL so the video-service knows where to
    // download the export bundle from and upload the result to.
    if (!body.apiGatewayUrl) {
      body.apiGatewayUrl = `http://localhost:${config.port}`;
    }
    const res = await fetch(`${VIDEO_SERVICE_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // GET /api/video/video/:runId — stream the rendered MP4
  // This now uses the staging endpoint (reads from the Docker volume directly).
  // The :runId may include a .mp4 extension for media type detection by the player.
  app.get("/api/video/video/:runId", async (c) => {
    const runId = c.req.param("runId").replace(/\.mp4$/, "");
    const range = c.req.header("range");
    const headers: Record<string, string> = {};
    if (range) headers["range"] = range;

    const res = await fetch(`http://localhost:${config.port}/api/runs/${runId}/video-file`, { headers });
    if (!res.ok) return c.json(await res.json(), res.status as 400 | 404);

    const responseHeaders: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const contentRange = res.headers.get("content-range");
    const contentLength = res.headers.get("content-length");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    const status = range && contentRange ? 206 : res.status;
    return new Response(res.body, { status, headers: responseHeaders });
  });

  // GET /api/video/download/:runId — download the rendered MP4
  app.get("/api/video/download/:runId", async (c) => {
    const runId = c.req.param("runId");
    const res = await fetch(`http://localhost:${config.port}/api/runs/${runId}/video-download`);
    if (!res.ok) return c.json(await res.json(), res.status as 400 | 404);
    const data = await res.arrayBuffer();
    return new Response(data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="video-${runId.slice(0, 8)}.mp4"`,
      },
    });
  });
}
