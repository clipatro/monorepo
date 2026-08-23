/**
 * Ably Manager — publishes workflow events to Ably realtime channels.
 *
 * The workflow engine emits events as steps transition states.
 * The Ably manager publishes them to per-run channels so frontend
 * clients can subscribe without SSE (which is unreliable through proxies).
 *
 * Channel naming: `run:{runId}` — matches the SSE per-run subscription model.
 * Events are also persisted to the database (by the engine) and broadcast
 * via SSE, so Ably is an additional transport, not a replacement.
 */

import { Realtime } from "ably";
import type { WorkflowEvent } from "@automation/contracts";

export class AblyManager {
  private client: Realtime | null = null;
  private apiKey: string | null;

  constructor(apiKey: string | null) {
    this.apiKey = apiKey;
    if (apiKey) {
      this.client = new Realtime({
        key: apiKey,
        autoConnect: true,
      });
      this.client.connection.on("connected", () => {
        // Connected silently
      });
      this.client.connection.on("disconnected", () => {
        // Will auto-reconnect
      });
    }
  }

  /** Publish an event to the run's Ably channel. Non-critical — swallows errors. */
  publish(event: WorkflowEvent): void {
    if (!this.client) return; // No API key configured — skip silently
    try {
      const channel = this.client.channels.get(`run:${event.runId}`);
      // Fire-and-forget — don't block the engine
      channel.publish(event.eventType, event).catch(() => {
        // Non-critical — SSE and DB persistence still work
      });
    } catch {
      // Non-critical
    }
  }

  /** Close the Ably connection. */
  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}

/** Global Ably manager singleton. Initialized with env key. */
export const ablyManager = new AblyManager(process.env.ABLY_ROOT_KEY ?? null);
