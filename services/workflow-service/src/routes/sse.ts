import type { Hono } from "@automation/server";
import { sseManager, type WorkflowEngine } from "@automation/workflow-engine";
import type { WorkflowEvent } from "@automation/contracts";

// === SSE ===

export function registerSseRoutes(app: Hono, engine: WorkflowEngine): void {
  // GET /runs/:id/events — SSE stream for live run updates
  app.get("/runs/:id/events", async (c) => {
    const runId = c.req.param("id");
    const run = await engine.getRunDetails(runId);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const lastEventId = c.req.header("Last-Event-ID");

    let cleanupFn: (() => void) | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (data: string, event?: string, id?: string) => {
          let msg = "";
          if (id) msg += `id: ${id}\n`;
          if (event) msg += `event: ${event}\n`;
          msg += `data: ${data}\n\n`;
          controller.enqueue(encoder.encode(msg));
        };

        // Send initial connection confirmation
        send(JSON.stringify({ type: "connected", runId }), "connected");

        // Replay missed events
        const events = await engine.getRunEvents(runId, lastEventId);
        for (const event of events) {
          send(JSON.stringify(event), event.eventType, event.id);
        }

        // Subscribe to live events
        const unsubscribe = sseManager.subscribe(runId, (event: WorkflowEvent) => {
          send(JSON.stringify(event), event.eventType, event.id);
        });

        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
          send(JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }), "heartbeat");
        }, 30000);

        cleanupFn = () => {
          unsubscribe();
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
        };
      },
      cancel() {
        if (cleanupFn) cleanupFn();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
}
