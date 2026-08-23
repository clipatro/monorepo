/**
 * GET /video/:runId   — stream the rendered MP4 (proxied to api-gateway)
 * GET /download/:runId — download the rendered MP4 (proxied to api-gateway)
 *
 * The video-service runs on the HOST and has no DB or artifact store access.
 * These endpoints proxy to the api-gateway which has access to the Docker volume.
 */

import type { Hono, AppConfig } from "@automation/server";

export function registerVideoRoutes(app: Hono, config: AppConfig): void {
  // The api-gateway URL is used for proxying file requests.
  // It's passed via the API_GATEWAY_URL env var, or defaults to localhost:3000.
  const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";

  // GET /video/:runId — stream the rendered MP4 (supports range)
  app.get("/video/:runId", async (c) => {
    const runId = c.req.param("runId");
    const range = c.req.header("range");
    const headers: Record<string, string> = {};
    if (range) headers["range"] = range;

    const res = await fetch(`${gatewayUrl}/api/runs/${runId}/video-file`, { headers });
    if (!res.ok) return c.json({ error: "Video not found for this run" }, 404);

    const responseHeaders: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const contentRange = res.headers.get("content-range");
    const contentLength = res.headers.get("content-length");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    const status = range && contentRange ? 206 : 200;
    const data = await res.arrayBuffer();
    return new Response(data, { status, headers: responseHeaders });
  });

  // GET /download/:runId — download the rendered MP4 as an attachment
  app.get("/download/:runId", async (c) => {
    const runId = c.req.param("runId");
    const res = await fetch(`${gatewayUrl}/api/runs/${runId}/video-download`);
    if (!res.ok) return c.json({ error: "Video not found for this run" }, 404);

    const data = await res.arrayBuffer();
    return new Response(data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="video-${runId.slice(0, 8)}.mp4"`,
      },
    });
  });
}
