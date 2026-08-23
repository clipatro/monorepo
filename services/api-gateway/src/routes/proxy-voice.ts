import type { Hono, AppConfig } from "@automation/server";

export function registerVoiceProxyRoutes(app: Hono, config: AppConfig): void {
  // === Voice service proxy routes ===

  const VOICE_SERVICE_URL = config.services.voiceService;

  // POST /api/voice/synthesize — generate voice-over
  app.post("/api/voice/synthesize", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${VOICE_SERVICE_URL}/synthesize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // POST /api/voice/synthesize/estimate — cost estimate only (no synthesis)
  app.post("/api/voice/synthesize/estimate", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${VOICE_SERVICE_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, estimateOnly: true }),
    });
    return c.json(await res.json(), res.status as 200 | 400 | 404);
  });

  // POST /api/voice/gameplay-cut — cut muted gameplay video
  app.post("/api/voice/gameplay-cut", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${VOICE_SERVICE_URL}/gameplay-cut`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // POST /api/voice/package — assemble export package
  app.post("/api/voice/package", async (c) => {
    const body = await c.req.json();
    const res = await fetch(`${VOICE_SERVICE_URL}/package`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return c.json(await res.json(), res.status as 200 | 201 | 400 | 404 | 500);
  });

  // GET /api/voice/voiceovers — list ALL voiceovers (with search + pagination)
  app.get("/api/voice/voiceovers", async (c) => {
    const params = new URLSearchParams();
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    if (search) params.set("search", search);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const url = qs
      ? `${VOICE_SERVICE_URL}/voiceovers?${qs}`
      : `${VOICE_SERVICE_URL}/voiceovers`;
    const res = await fetch(url);
    return c.json(await res.json());
  });

  // GET /api/voice/voiceovers/:storyId — list voiceovers
  app.get("/api/voice/voiceovers/:storyId", async (c) => {
    const storyId = c.req.param("storyId");
    const res = await fetch(`${VOICE_SERVICE_URL}/voiceovers/${storyId}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/voice/voiceover/:id — get voiceover with timings
  app.get("/api/voice/voiceover/:id", async (c) => {
    const id = c.req.param("id");
    const res = await fetch(`${VOICE_SERVICE_URL}/voiceover/${id}`);
    return c.json(await res.json(), res.status as 200 | 404);
  });

  // GET /api/voice/audio/:id — stream voiceover audio file
  // The :id may include a .wav extension for media type detection by the player.
  app.get("/api/voice/audio/:id", async (c) => {
    const id = c.req.param("id").replace(/\.wav$/, "");
    const range = c.req.header("range");
    const reqHeaders: Record<string, string> = {};
    if (range) reqHeaders["range"] = range;

    const res = await fetch(`${VOICE_SERVICE_URL}/audio/${id}`, { headers: reqHeaders });
    if (!res.ok) return c.json({ error: "Audio not found" }, 404);

    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const contentLength = res.headers.get("content-length");
    const contentRange = res.headers.get("content-range");
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(res.body, { status: res.status, headers });
  });

  // GET /api/voice/download/:runId — download export package ZIP
  app.get("/api/voice/download/:runId", async (c) => {
    const runId = c.req.param("runId");
    const res = await fetch(`${VOICE_SERVICE_URL}/download/${runId}`);
    if (!res.ok) return c.json(await res.json(), res.status as 400 | 404);
    const data = await res.arrayBuffer();
    return new Response(data, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="export-package-${runId.slice(0, 8)}.zip"`,
      },
    });
  });

  // GET /api/voice/gameplay-videos — list available gameplay videos
  app.get("/api/voice/gameplay-videos", async (c) => {
    const res = await fetch(`${VOICE_SERVICE_URL}/gameplay-videos`);
    return c.json(await res.json(), 200);
  });
}
