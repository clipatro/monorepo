/**
 * Pipeline store — global state for the pipeline page powered by Zustand.
 *
 * Holds: channels, pipeline definition, runs list, selected run, and
 * connects to Ably for realtime updates. Components read from the store
 * via selectors, so only the components that need a specific slice re-render.
 */

import { create } from "zustand";
import Ably from "ably";
import {
  api,
  type Channel,
  type RunDetails,
  type PipelineNode,
  type RunStep,
  type RunCostSummary,
} from "@/lib/api";

type AblyChannel = ReturnType<Ably.Realtime["channels"]["get"]>;

interface PipelineState {
  // Static data (loaded once)
  channels: Channel[];
  pipeline: PipelineNode[];

  // Run list
  runs: RunDetails[];
  runsTotal: number;
  runsLoading: boolean;

  // Selected run
  selectedRunId: string | null;
  selectedRun: RunDetails | null;
  runLoading: boolean;
  runCostSummary: RunCostSummary | null;
  runCostLoading: boolean;

  // Filters
  channelFilter: string;
  searchQuery: string;
  statusFilter: string;
  page: number;
  pageSize: number;

  // UI state
  showCreateDialog: boolean;
  selectedStep: RunStep | null;
  showStepDialog: boolean;
  activeApprovalId: string | null;
  showSummaryDialog: boolean;

  // Ably
  ablyClient: Ably.Realtime | null;
  ablyChannel: AblyChannel | null;

  // Actions
  init: () => void;
  loadRuns: () => Promise<void>;
  selectRun: (runId: string | null) => void;
  setChannelFilter: (channelId: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  setPage: (page: number) => void;
  refreshSelectedRun: () => Promise<void>;
  refreshRunCost: () => Promise<void>;
  createRun: (input: { channelId: string; topic: string; contentType?: string }) => Promise<RunDetails>;
  submitApproval: (approvalId: string, decision: "approved" | "rejected", notes?: string, editedData?: Record<string, unknown>) => Promise<void>;
  cancelRun: () => Promise<void>;
  rerunStep: (stepId: string, cascade: boolean) => Promise<void>;
  setShowCreateDialog: (show: boolean) => void;
  setSelectedStep: (step: RunStep | null) => void;
  setShowStepDialog: (show: boolean) => void;
  setActiveApprovalId: (id: string | null) => void;
  setShowSummaryDialog: (show: boolean) => void;
  updateRunInList: (run: RunDetails) => void;
  dispose: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  channels: [],
  pipeline: [],
  runs: [],
  runsTotal: 0,
  runsLoading: false,
  selectedRunId: null,
  selectedRun: null,
  runLoading: false,
  runCostSummary: null,
  runCostLoading: false,
  channelFilter: "",
  searchQuery: "",
  statusFilter: "all",
  page: 0,
  pageSize: 20,
  showCreateDialog: false,
  selectedStep: null,
  showStepDialog: false,
  activeApprovalId: null,
  showSummaryDialog: false,
  ablyClient: null,
  ablyChannel: null,

  init: () => {
    // Load static data
    api.listChannels().then((channels) => set({ channels })).catch(() => {});
    api.getPipeline().then((pipeline) => set({ pipeline })).catch(() => {});

    // Load runs
    get().loadRuns();

    // Connect to Ably
    const subscribeKey = import.meta.env.VITE_ABLY_SUBSCRIBE_KEY;
    if (subscribeKey) {
      const client = new Ably.Realtime({ key: subscribeKey, autoConnect: true });
      set({ ablyClient: client });
    }
  },

  loadRuns: async () => {
    const { channelFilter, searchQuery, statusFilter, page, pageSize } = get();
    set({ runsLoading: true });
    try {
      const result = await api.listRuns({
        channelId: channelFilter || undefined,
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      set({ runs: result.runs, runsTotal: result.total, runsLoading: false });
    } catch {
      set({ runsLoading: false });
    }
  },

  selectRun: (runId) => {
    const state = get();

    // Unsubscribe from previous Ably channel
    if (state.ablyChannel) {
      state.ablyChannel.unsubscribe();
      set({ ablyChannel: null });
    }

    set({ selectedRunId: runId, selectedRun: null, runLoading: !!runId, runCostSummary: null, activeApprovalId: null, showSummaryDialog: false });

    if (!runId) {
      set({ runLoading: false });
      return;
    }

    // Fetch initial data
    api
      .getRun(runId)
      .then((run) => set({ selectedRun: run, runLoading: false }))
      .catch(() => set({ runLoading: false }));

    // Fetch cost summary
    get().refreshRunCost();

    // Subscribe to Ably channel for this run
    if (state.ablyClient) {
      const channel = state.ablyClient.channels.get(`run:${runId}`);
      const eventTypes = [
        "step_started", "step_completed", "step_failed", "step_skipped",
        "step_retried", "step_rerun", "step_waiting_approval", "step_approved", "step_rejected",
        "run_started", "run_paused", "run_resumed", "run_completed",
        "run_failed", "run_cancelled", "approval_requested", "approval_decided",
        "budget_exceeded",
      ];

      // On any event, refetch the run + update runs list + refresh cost
      const onEvent = () => {
        get().refreshSelectedRun();
        get().loadRuns();
        get().refreshRunCost();
      };

      for (const type of eventTypes) {
        channel.subscribe(type, onEvent);
      }

      set({ ablyChannel: channel });
    }
  },

  setChannelFilter: (channelId) => {
    set({ channelFilter: channelId, page: 0 });
    get().loadRuns();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, page: 0 });
    get().loadRuns();
  },

  setStatusFilter: (status) => {
    set({ statusFilter: status, page: 0 });
    get().loadRuns();
  },

  setPage: (page) => {
    set({ page: Math.max(0, page) });
    get().loadRuns();
  },

  refreshSelectedRun: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;
    try {
      const run = await api.getRun(selectedRunId);
      set({ selectedRun: run });
      get().updateRunInList(run);
    } catch {
      // Run may have been deleted
    }
  },

  refreshRunCost: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;
    set({ runCostLoading: true });
    try {
      const summary = await api.getRunCostSummary(selectedRunId);
      set({ runCostSummary: summary, runCostLoading: false });
    } catch {
      set({ runCostLoading: false });
    }
  },

  createRun: async (input) => {
    const run = await api.createRun(input);
    get().updateRunInList(run);
    get().selectRun(run.id);
    return run;
  },

  submitApproval: async (approvalId, decision, notes, editedData) => {
    const updated = await api.submitApproval(approvalId, decision, notes, editedData);
    set({ selectedRun: updated });
    get().updateRunInList(updated);
  },

  cancelRun: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;
    await api.cancelRun(selectedRunId);
    await get().refreshSelectedRun();
    get().loadRuns();
  },

  rerunStep: async (stepId, cascade) => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;
    const updated = await api.rerunStep(selectedRunId, stepId, cascade);
    set({ selectedRun: updated });
    get().updateRunInList(updated);
    get().loadRuns();
  },

  setShowCreateDialog: (show) => set({ showCreateDialog: show }),
  setSelectedStep: (step) => set({ selectedStep: step }),
  setShowStepDialog: (show) => set({ showStepDialog: show }),
  setActiveApprovalId: (id) => set({ activeApprovalId: id }),
  setShowSummaryDialog: (show) => set({ showSummaryDialog: show }),

  updateRunInList: (run) => {
    const { runs } = get();
    const idx = runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      const next = [...runs];
      next[idx] = run;
      set({ runs: next });
    } else {
      set({ runs: [run, ...runs] });
    }
  },

  dispose: () => {
    const { ablyChannel, ablyClient } = get();
    if (ablyChannel) ablyChannel.unsubscribe();
    if (ablyClient) ablyClient.close();
    set({ ablyChannel: null, ablyClient: null, selectedRun: null, selectedRunId: null });
  },
}));
