/**
 * Workflow contracts — step types, states, transitions, and pipeline definition.
 *
 * The workflow engine is a durable, SQLite-backed runner. Each run follows a
 * fixed pipeline graph (not a general-purpose visual editor). Steps are
 * transactionally claimed, leased, executed, and their results persisted.
 *
 * See Implementation Plan "Pipeline execution model" and "Core pipeline graph".
 */

import type { ContentType } from "./content.ts";

// === Step states ===

export type StepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "skipped";

export type RunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

// === Step types — the fixed pipeline ===

export type StepType =
  | "concept_intake"
  | "content_classification"
  | "research"
  | "novelty_context"
  | "generate_candidates"
  | "duplicate_detection"
  | "similarity_review"
  | "story_approval"
  | "scene_plan"
  | "script_approval"
  | "image_prompt_compilation"
  | "image_generation"
  | "image_review"
  | "clip_prompt_compilation"
  | "clip_generation"
  | "voice_generation"
  | "audio_timing"
  | "package_assembly"
  | "video_generation"
  // Phase 9 — Google Flow Templates (D021)
  | "flow_prompt_compilation"
  | "flow_generation"
  | "flow_upload";

// === Approval types ===

export type ApprovalType = "story" | "script" | "image" | "budget" | "flow_upload";

export type ApprovalStatus = "pending" | "approved" | "rejected";

// === Pipeline graph definition ===

/**
 * A node in the pipeline graph.
 * The graph is fixed — defined at code time, not user-editable.
 * But the *data* flowing through it is dynamic per channel and run.
 */
export interface PipelineNode {
  /** The step type this node represents. */
  type: StepType;
  /** Human-readable label for UI display. */
  label: string;
  /** Whether this step requires human approval before proceeding. */
  requiresApproval: boolean;
  /** Whether this step invokes a paid provider (triggers budget check). */
  isPaid: boolean;
  /** Which capability service handles this step (null for internal logic). */
  service?: "story-service" | "research-service" | "image-service" | "voice-service" | "embedding-service" | "video-service" | "workflow-service" | null;
  /** Step types that must complete before this step can start. */
  dependsOn: StepType[];
  /** Whether this step can run in parallel with its siblings. */
  parallel?: boolean;
  /** Maximum retry attempts (default 3). */
  maxRetries?: number;
  /** Whether this step can be skipped (e.g. research for fictional stories). */
  skippable?: boolean;
}

/**
 * The fixed pipeline graph.
 * This is the single source of truth for the pipeline structure.
 * The workflow engine and the React Flow UI both consume this.
 */
export const PIPELINE_GRAPH: PipelineNode[] = [
  {
    type: "concept_intake",
    label: "Concept Intake",
    requiresApproval: false,
    isPaid: false,
    service: null,
    dependsOn: [],
  },
  {
    type: "content_classification",
    label: "Content Classification",
    requiresApproval: false,
    isPaid: true,
    service: "story-service",
    dependsOn: ["concept_intake"],
  },
  {
    type: "research",
    label: "Research & Claims",
    requiresApproval: false,
    isPaid: true,
    service: "research-service",
    dependsOn: ["content_classification"],
    skippable: true,
  },
  {
    type: "novelty_context",
    label: "Novelty Context",
    requiresApproval: false,
    isPaid: false,
    service: "embedding-service",
    dependsOn: ["content_classification"],
  },
  {
    type: "generate_candidates",
    label: "Generate Story Candidates",
    requiresApproval: false,
    isPaid: true,
    service: "story-service",
    dependsOn: ["novelty_context"],
  },
  {
    type: "duplicate_detection",
    label: "Duplicate Detection",
    requiresApproval: false,
    isPaid: true,
    service: "story-service",
    dependsOn: ["generate_candidates"],
  },
  {
    type: "story_approval",
    label: "Story Approval",
    requiresApproval: true,
    isPaid: false,
    service: null,
    dependsOn: ["duplicate_detection"],
  },
  {
    type: "scene_plan",
    label: "Scene & Narration Plan",
    requiresApproval: false,
    isPaid: true,
    service: "story-service",
    dependsOn: ["story_approval"],
  },
  {
    type: "script_approval",
    label: "Script Approval",
    requiresApproval: true,
    isPaid: false,
    service: null,
    dependsOn: ["scene_plan"],
  },
  {
    type: "image_prompt_compilation",
    label: "Image Prompt Compilation",
    requiresApproval: false,
    isPaid: false,
    service: "image-service",
    dependsOn: ["script_approval"],
  },
  {
    type: "image_generation",
    label: "Image Generation",
    requiresApproval: false,
    isPaid: true,
    service: "image-service",
    dependsOn: ["image_prompt_compilation"],
    maxRetries: 5,
  },
  {
    type: "image_review",
    label: "Image Review",
    requiresApproval: true,
    isPaid: false,
    service: null,
    dependsOn: ["image_generation"],
  },
  {
    // D017: Clip-based template step (alternative to image_prompt_compilation + image_generation)
    type: "clip_prompt_compilation",
    label: "Clip Prompt Compilation",
    requiresApproval: false,
    isPaid: false,
    service: "workflow-service",
    dependsOn: ["script_approval"],
  },
  {
    // D017: Clip-based template step (alternative to image_generation)
    type: "clip_generation",
    label: "Clip Generation",
    requiresApproval: false,
    isPaid: true,
    service: "video-service",
    dependsOn: ["clip_prompt_compilation"],
    maxRetries: 3,
  },
  {
    type: "voice_generation",
    label: "Voice Generation",
    requiresApproval: false,
    isPaid: true,
    service: "voice-service",
    dependsOn: ["script_approval"],
    parallel: true,
  },
  {
    type: "audio_timing",
    label: "Audio Timing",
    requiresApproval: false,
    isPaid: false,
    service: "voice-service",
    dependsOn: ["voice_generation"],
    parallel: true,
  },
  {
    type: "package_assembly",
    label: "Package Assembly",
    requiresApproval: false,
    isPaid: false,
    service: null,
    dependsOn: ["image_review", "audio_timing", "clip_generation"],
  },
  {
    type: "video_generation",
    label: "Video Generation",
    requiresApproval: false,
    isPaid: false,
    service: "video-service",
    dependsOn: ["package_assembly"],
    skippable: true,
  },
  // Phase 9 — Google Flow Templates (D021)
  {
    type: "flow_prompt_compilation",
    label: "Flow Prompt Compilation",
    requiresApproval: false,
    isPaid: false,
    service: "image-service",
    dependsOn: ["script_approval"],
  },
  {
    type: "flow_generation",
    label: "Flow Generation",
    requiresApproval: false,
    isPaid: true,
    service: "image-service",
    dependsOn: ["flow_prompt_compilation"],
    maxRetries: 2,
  },
  {
    type: "flow_upload",
    label: "Flow Upload & Arrange",
    requiresApproval: true,
    isPaid: false,
    service: null,
    dependsOn: ["flow_prompt_compilation"],
  },
];

// === Workflow event types (for SSE) ===

export type WorkflowEventType =
  | "run_created"
  | "run_started"
  | "run_paused"
  | "run_resumed"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "step_created"
  | "step_claimed"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "step_rerun"
  | "step_skipped"
  | "step_waiting_approval"
  | "step_approved"
  | "step_rejected"
  | "approval_requested"
  | "approval_decided"
  | "budget_warning"
  | "budget_exceeded";

export interface WorkflowEvent {
  id: string;
  runId: string;
  stepId: string | null;
  eventType: WorkflowEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

// === Run creation input ===

export interface CreateRunInput {
  channelId: string;
  topic: string;
  contentType?: ContentType;
  targetDurationSeconds?: number;
  emotionalDirection?: string;
  requiredIdeas?: string[];
  forbiddenIdeas?: string[];
  /** Optional storyline — when provided, the story is built around this storyline. */
  storyline?: string;
}

// === Run details (API response) ===

export interface RunDetails {
  id: string;
  channelId: string;
  topic: string;
  contentType: string | null;
  storyline: string | null;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: RunStepDetails[];
  approvals: RunApprovalDetails[];
}

export interface RunStepDetails {
  id: string;
  runId: string;
  stepType: StepType;
  label: string;
  status: StepStatus;
  stepData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  attempts: RunStepAttemptDetails[];
  /** Step types this step depends on (from the template pipeline). */
  dependsOn: string[];
  /** Whether this step invokes a paid provider. */
  isPaid: boolean;
  /** Whether this step requires human approval. */
  requiresApproval: boolean;
}

export interface RunStepAttemptDetails {
  id: string;
  stepId: string;
  attemptNumber: number;
  status: "running" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  remoteRequestId: string | null;
  costUsd: number | null;
  errorMessage: string | null;
  logs: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface RunApprovalDetails {
  id: string;
  runId: string;
  stepId: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  reviewer: string | null;
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

// === Approval input ===

export interface ApprovalDecisionInput {
  approvalId: string;
  decision: "approved" | "rejected";
  reviewer?: string;
  notes?: string;
  /** For story approval: optionally edit the story before approving. */
  editedData?: Record<string, unknown>;
}
