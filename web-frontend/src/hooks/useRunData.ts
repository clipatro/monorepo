import { useState, useEffect, useCallback, useRef } from "react";
import { api, type RunDetails } from "@/lib/api";

/**
 * Hook that manages a selected run's data with live updates.
 *
 * - Fetches run details on mount and when runId changes
 * - Subscribes to SSE for instant updates
 * - Polls every 3s as a fallback (SSE through Vite proxy can be unreliable)
 * - Exposes `refresh` for manual refresh after mutations (approvals, cancel, etc.)
 * - Cleans up all connections on unmount or when runId changes
 */
export function useRunData(runId: string | null) {
	const [run, setRun] = useState<RunDetails | null>(null);
	const [loading, setLoading] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);

	// Fetch run details
	const fetchRun = useCallback(async (id: string) => {
		try {
			const r = await api.getRun(id);
			setRun(r);
		} catch {
			// Run may not exist yet
		}
	}, []);

	// Manual refresh (used after approvals, cancel, etc.)
	const refresh = useCallback(() => {
		if (runId) fetchRun(runId);
	}, [runId, fetchRun]);

	// Load run on mount / when runId changes
	useEffect(() => {
		if (!runId) {
			setRun(null);
			return;
		}
		setLoading(true);
		fetchRun(runId).finally(() => setLoading(false));
	}, [runId, fetchRun]);

	// SSE + polling subscription
	useEffect(() => {
		if (!runId) return;

		// Close any existing SSE connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}

		let closed = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		// --- SSE: instant updates ---
		const connect = () => {
			if (closed) return;
			const es = new EventSource(`/workflow/runs/${runId}/events`);
			eventSourceRef.current = es;

			const onEvent = () => fetchRun(runId);
			for (const type of [
				"step_completed", "step_failed", "step_started",
				"step_waiting_approval", "step_approved", "step_rejected",
				"step_skipped", "step_retried",
				"run_completed", "run_failed", "run_paused", "run_resumed",
			]) {
				es.addEventListener(type, onEvent);
			}
			es.onerror = () => {
				es.close();
				if (eventSourceRef.current === es) eventSourceRef.current = null;
				if (!closed) {
					reconnectTimer = setTimeout(() => {
						fetchRun(runId);
						connect();
					}, 5000);
				}
			};
		};
		connect();

		// --- Polling fallback: every 3s ---
		const pollTimer = setInterval(() => fetchRun(runId), 3000);

		return () => {
			closed = true;
			clearInterval(pollTimer);
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		};
	}, [runId, fetchRun]);

	return { run, loading, refresh, setRun };
}
