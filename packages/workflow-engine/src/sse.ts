/**
 * SSE Manager — tracks SSE connections per run and broadcasts events.
 *
 * The workflow engine emits events as steps transition states.
 * The SSE manager holds open connections from the frontend and pushes
 * events in real-time. Events are also persisted to the database so
 * late subscribers can replay them.
 */

import type { WorkflowEvent } from "@automation/contracts";

type SSECallback = (event: WorkflowEvent) => void;

export class SSEManager {
  private subscribers = new Map<string, Set<SSECallback>>(); // runId -> callbacks

  /** Subscribe to events for a specific run. Returns an unsubscribe function. */
  subscribe(runId: string, callback: SSECallback): () => void {
    if (!this.subscribers.has(runId)) {
      this.subscribers.set(runId, new Set());
    }
    this.subscribers.get(runId)!.add(callback);
    return () => {
      this.subscribers.get(runId)?.delete(callback);
      if (this.subscribers.get(runId)?.size === 0) {
        this.subscribers.delete(runId);
      }
    };
  }

  /** Broadcast an event to all subscribers of the run. */
  broadcast(event: WorkflowEvent): void {
    const subs = this.subscribers.get(event.runId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event);
        } catch {
          // Subscriber may have disconnected — ignore
        }
      }
    }
  }

  /** Get the number of active subscribers for a run. */
  subscriberCount(runId: string): number {
    return this.subscribers.get(runId)?.size ?? 0;
  }
}

/** Global SSE manager singleton. */
export const sseManager = new SSEManager();
