/**
 * WorkflowEngine — the durable SQLite-backed workflow runner.
 *
 * Implements:
 * - Run creation (persists run + all steps from PIPELINE_GRAPH)
 * - Transactional step claiming (BEGIN IMMEDIATE)
 * - Step leases with expiry and crash recovery
 * - Retries with exponential backoff and attempt history
 * - Human approval checkpoints
 * - Budget checks before paid steps
 * - SSE event emission
 * - Step execution via registered handlers
 *
 * The engine runs a background loop that:
 * 1. Reclaims expired leases (crash recovery)
 * 2. Finds runnable steps (all deps completed)
 * 3. Claims and executes them
 * 4. Pauses at approval steps
 */

import { getDb } from "@automation/database";
import type {
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepAttemptRow,
  WorkflowEventRow,
  ApprovalRow,
} from "@automation/database";
import {
  PIPELINE_GRAPH,
  type StepType,
  type RunStatus,
  type StepStatus,
  type WorkflowEvent,
  type WorkflowEventType,
  type CreateRunInput,
  type RunDetails,
  type RunStepDetails,
  type RunStepAttemptDetails,
  type RunApprovalDetails,
  type ApprovalType,
  type ApprovalDecisionInput,
  type TemplateConfig,
  type ChannelTemplateOverrides,
  mergeTemplateConfig,
  isStepEnabled,
  getEnabledSteps,
  getStepDependencies,
} from "@automation/contracts";
import { checkBudget, getBudgetConfig, type BudgetConfig } from "@automation/cost-tracker";
import type { StepHandler, StepHandlerContext, ChannelConfig } from "./types.ts";
import { sseManager } from "./sse.ts";
import { ablyManager } from "./ably.ts";

const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const RECLAIM_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_RETRIES_DEFAULT = 3;
const BACKOFF_BASE_MS = 2000; // 2 seconds
const BACKOFF_MAX_MS = 60 * 1000; // 1 minute

/**
 * Estimate the cost of a single pipeline step (in USD).
 * Used to populate `estimated_cost_usd` so the user can see the expected
 * cost before approving at the preceding checkpoint.
 *
 * Estimates are conservative (upper-bound) and based on the pricing catalog.
 * Actual costs are recorded after each provider call via the cost tracker.
 */
function estimateStepCost(stepType: StepType): number {
  switch (stepType) {
    case "content_classification":
      // Single Gemini text call, ~512 output tokens
      return 0.002;
    case "research":
      // Two Gemini calls (grounding + structuring), ~8k output tokens + search
      return 0.05;
    case "generate_candidates":
      // Single Gemini call, ~8k output tokens
      return 0.04;
    case "duplicate_detection":
      // Multiple Gemini adjudication calls for borderline cases
      return 0.02;
    case "scene_plan":
      // Single Gemini call, ~4k output tokens
      return 0.02;
    case "image_generation":
      // 4-8 images at ~$0.067/image (1k tier, standard model)
      return 0.54; // 8 * 0.067, conservative upper bound
    case "voice_generation":
      // Kokoro is free; Gemini TTS fallback ~$0.01/segment
      return 0.08; // 8 segments * $0.01, conservative if fallback needed
    default:
      return 0;
  }
}

export class WorkflowEngine {
  private handlers = new Map<StepType, StepHandler>();
  private reclaimTimer: ReturnType<typeof setInterval> | null = null;
  private budgetConfig: BudgetConfig;

  constructor(budgetConfig?: BudgetConfig) {
    this.budgetConfig = budgetConfig ?? getBudgetConfig();
  }

  // === Handler registration ===

  /** Register a handler for a step type. */
  registerHandler(stepType: StepType, handler: StepHandler): void {
    this.handlers.set(stepType, handler);
  }

  // === Template loading ===

  /**
   * Load the channel's active template config (merged with channel overrides).
   * Returns null if the channel has no template assigned.
   */
  private async loadChannelTemplate(channelId: string): Promise<{ config: TemplateConfig; id: string } | null> {
    const db = getDb();
    const tmplRow = await db.prepare(`
      SELECT ct.config as overrides, vt.config as template_config, vt.id as template_id
      FROM channel_templates ct
      JOIN video_templates vt ON vt.id = ct.template_id
      WHERE ct.channel_id = ? AND ct.is_active = 1
    `).get(channelId) as {
      overrides: string;
      template_config: string;
      template_id: string;
    } | null;

    if (!tmplRow) return null;

    const templateConfig = JSON.parse(tmplRow.template_config) as TemplateConfig;
    const overrides = tmplRow.overrides && tmplRow.overrides !== "{}"
      ? (JSON.parse(tmplRow.overrides) as ChannelTemplateOverrides)
      : {};
    return {
      config: mergeTemplateConfig(templateConfig, overrides),
      id: tmplRow.template_id,
    };
  }

  // === Lifecycle ===

  /** Start the background reclaim loop. Call once at service startup. */
  start(): void {
    if (this.reclaimTimer) return;
    console.log("[workflow-engine] Starting background reclaim loop...");
    this.reclaimExpiredLeases().catch((err) => console.error("[workflow-engine] Initial reclaim error:", err));
    this.processRunnableRuns().catch((err) => console.error("[workflow-engine] Initial process error:", err));
    this.reclaimTimer = setInterval(() => {
      this.reclaimExpiredLeases().catch((err) => console.error("[workflow-engine] Background loop error:", err));
      this.processRunnableRuns().catch((err) => console.error("[workflow-engine] Background loop error:", err));
    }, RECLAIM_INTERVAL_MS);
  }

  /** Stop the background loop. Call on graceful shutdown. */
  stop(): void {
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
      this.reclaimTimer = null;
    }
  }

  /** Manually trigger processing of a specific run (e.g., after resume). */
  processRunNow(runId: string): void {
    this.processRun(runId).catch((err) => console.error("[workflow-engine] processRunNow error:", err));
  }

  // === Run creation ===

  /**
   * Create a new workflow run.
   * Steps are created from the channel's template pipeline — only steps
   * enabled in the template are created, and each step stores its
   * `dependsOn` list in `step_data` so the engine can resolve dependencies
   * without referencing the global PIPELINE_GRAPH.
   */
  async createRun(input: CreateRunInput): Promise<RunDetails> {
    const db = getDb();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Load the channel's template to determine which steps to create
    const tmpl = await this.loadChannelTemplate(input.channelId);

    // Determine which steps to create and in what order
    let stepsToCreate: { type: StepType; dependsOn: string[] }[];
    if (tmpl) {
      const enabledSteps = getEnabledSteps(tmpl.config);
      stepsToCreate = enabledSteps.map((type) => ({
        type: type as StepType,
        dependsOn: getStepDependencies(tmpl.config, type),
      }));
    } else {
      // No template assigned — fall back to the full PIPELINE_GRAPH
      stepsToCreate = PIPELINE_GRAPH.map((node) => ({
        type: node.type,
        dependsOn: node.dependsOn,
      }));
    }

    await db.transaction(async () => {
      // Create the run
      await db.prepare(`
        INSERT INTO workflow_runs (id, channel_id, topic, content_type, storyline, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(runId, input.channelId, input.topic, input.contentType ?? null, input.storyline ?? null, now);

      // Create steps from the template pipeline (topologically sorted)
      for (const { type, dependsOn } of stepsToCreate) {
        const stepId = crypto.randomUUID();
        const node = PIPELINE_GRAPH.find((n) => n.type === type);
        const stepData: Record<string, unknown> = {
          topic: input.topic,
          channelId: input.channelId,
          contentType: input.contentType,
          targetDurationSeconds: input.targetDurationSeconds,
          emotionalDirection: input.emotionalDirection,
          requiredIdeas: input.requiredIdeas,
          forbiddenIdeas: input.forbiddenIdeas,
          storyline: input.storyline,
          dependsOn,
        };
        // Populate estimated_cost_usd for paid steps so cost is visible
        // before the user approves at the preceding checkpoint.
        const estimatedCostUsd = node?.isPaid ? estimateStepCost(type) : null;
        await db.prepare(`
          INSERT INTO workflow_steps (id, run_id, step_type, status, step_data, estimated_cost_usd, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)
        `).run(stepId, runId, type, JSON.stringify(stepData), estimatedCostUsd, now);
      }

      await this.emitEvent(runId, null, "run_created", { topic: input.topic, channelId: input.channelId });
    });

    return (await this.getRunDetails(runId))!;
  }

  // === Run management ===

  /** Start a pending run. */
  async startRun(runId: string): Promise<void> {
    const db = getDb();
    await db.prepare(`
      UPDATE workflow_runs SET status = 'running', started_at = now()
      WHERE id = ? AND status = 'pending'
    `).run(runId);
    await this.emitEvent(runId, null, "run_started", {});
    await this.processRun(runId);
  }

  /** Cancel a run. */
  async cancelRun(runId: string): Promise<void> {
    const db = getDb();
    await db.prepare(`
      UPDATE workflow_runs SET status = 'cancelled', completed_at = now()
      WHERE id = ? AND status IN ('pending', 'running', 'paused')
    `).run(runId);
    await this.emitEvent(runId, null, "run_cancelled", {});
  }

  /**
   * Re-run a completed (or failed) step. Resets it to pending so the engine
   * picks it up again. If cascade=true, also resets all downstream steps that
   * depend (directly or transitively) on this step.
   *
   * The run must be in a non-running state (completed, failed, paused, cancelled)
   * to avoid race conditions with the background processor.
   */
  async rerunStep(runId: string, stepId: string, cascade: boolean): Promise<RunDetails | null> {
    const db = getDb();

    // Verify the run exists and is not actively running
    const run = await db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | null;
    if (!run) return null;
    if (run.status === "running") {
      throw new Error("Cannot re-run a step while the run is actively running. Cancel or wait for it to finish first.");
    }

    // Verify the step exists and belongs to this run
    const step = await db.prepare("SELECT * FROM workflow_steps WHERE id = ? AND run_id = ?").get(stepId, runId) as WorkflowStepRow | null;
    if (!step) return null;

    // Can only re-run completed, failed, or skipped steps
    if (!["completed", "failed", "skipped"].includes(step.status)) {
      throw new Error(`Cannot re-run a step with status "${step.status}". Only completed, failed, or skipped steps can be re-run.`);
    }

    // Find all step types to reset (the target + downstream if cascading)
    const stepTypesToReset = new Set<StepType>([step.step_type as StepType]);
    if (cascade) {
      await this.findDownstreamSteps(runId, step.step_type as StepType, stepTypesToReset);
    }

    // Reset each step to pending
    for (const stepType of stepTypesToReset) {
      const s = await db.prepare(`
        SELECT id FROM workflow_steps WHERE run_id = ? AND step_type = ?
      `).get(runId, stepType) as { id: string } | null;
      if (!s) continue;

      await db.prepare(`
        UPDATE workflow_steps
        SET status = 'pending',
            result_data = NULL,
            provider = NULL,
            model = NULL,
            estimated_cost_usd = NULL,
            actual_cost_usd = NULL,
            lease_expires_at = NULL,
            started_at = NULL,
            completed_at = NULL
        WHERE id = ?
      `).run(s.id);

      // Clear any pending approvals for this step
      await db.prepare(`
        DELETE FROM approvals WHERE step_id = ? AND status = 'pending'
      `).run(s.id);

      await this.emitEvent(runId, s.id, "step_rerun", { stepType, cascade });
    }

    // Set the run back to running so the engine picks up the reset steps
    await db.prepare(`
      UPDATE workflow_runs SET status = 'running', completed_at = NULL
      WHERE id = ?
    `).run(runId);
    await this.emitEvent(runId, null, "run_resumed", { reason: "step_rerun" });

    // Trigger processing
    await this.processRun(runId);

    return await this.getRunDetails(runId);
  }

  /**
   * Recursively find all downstream steps that depend (directly or transitively)
   * on the given step type. Reads dependencies from the run's actual step data
   * (template-driven), not the global PIPELINE_GRAPH.
   */
  private async findDownstreamSteps(runId: string, stepType: StepType, result: Set<StepType>): Promise<void> {
    const db = getDb();
    const steps = await db.prepare(`
      SELECT step_type, step_data FROM workflow_steps WHERE run_id = ?
    `).all(runId) as { step_type: string; step_data: string }[];

    for (const s of steps) {
      if (result.has(s.step_type as StepType)) continue;
      const stepData = JSON.parse(s.step_data) as { dependsOn?: string[] };
      const deps = stepData.dependsOn ?? [];
      if (deps.includes(stepType)) {
        result.add(s.step_type as StepType);
        await this.findDownstreamSteps(runId, s.step_type as StepType, result);
      }
    }
  }

  /** Get full run details with steps, attempts, and approvals. */
  async getRunDetails(runId: string): Promise<RunDetails | null> {
    const db = getDb();
    const run = await db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | null;
    if (!run) return null;

    const steps = await db.prepare("SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY created_at ASC").all(runId) as WorkflowStepRow[];
    const approvals = await db.prepare("SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at ASC").all(runId) as ApprovalRow[];

    const stepDetails: RunStepDetails[] = await Promise.all(steps.map(async (step) => {
      const attempts = await db.prepare("SELECT * FROM workflow_step_attempts WHERE step_id = ? ORDER BY attempt_number ASC").all(step.id) as WorkflowStepAttemptRow[];
      const node = PIPELINE_GRAPH.find((n) => n.type === step.step_type);
      const parsedStepData = JSON.parse(step.step_data) as Record<string, unknown>;
      return {
        id: step.id,
        runId: step.run_id,
        stepType: step.step_type as StepType,
        label: node?.label ?? step.step_type,
        status: step.status as StepStatus,
        stepData: parsedStepData,
        resultData: step.result_data ? JSON.parse(step.result_data) : null,
        provider: step.provider,
        model: step.model,
        estimatedCostUsd: step.estimated_cost_usd,
        actualCostUsd: step.actual_cost_usd,
        leaseExpiresAt: step.lease_expires_at,
        startedAt: step.started_at,
        completedAt: step.completed_at,
        createdAt: step.created_at,
        dependsOn: (parsedStepData.dependsOn as string[]) ?? node?.dependsOn ?? [],
        isPaid: node?.isPaid ?? false,
        requiresApproval: node?.requiresApproval ?? false,
        attempts: attempts.map((a) => ({
          id: a.id,
          stepId: a.step_id,
          attemptNumber: a.attempt_number,
          status: a.status as "running" | "completed" | "failed",
          provider: a.provider,
          model: a.model,
          remoteRequestId: a.remote_request_id,
          costUsd: a.cost_usd,
          errorMessage: a.error_message,
          logs: a.logs,
          startedAt: a.started_at,
          completedAt: a.completed_at,
        })),
      };
    }));

    return {
      id: run.id,
      channelId: run.channel_id,
      topic: run.topic,
      contentType: run.content_type,
      storyline: run.storyline,
      status: run.status as RunStatus,
      createdAt: run.created_at,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      steps: stepDetails,
      approvals: approvals.map((a) => ({
        id: a.id,
        runId: a.run_id,
        stepId: a.step_id,
        approvalType: a.approval_type as ApprovalType,
        status: a.status as "pending" | "approved" | "rejected",
        reviewer: a.reviewer,
        notes: a.notes,
        createdAt: a.created_at,
        decidedAt: a.decided_at,
      })),
    };
  }

  /** List all runs (optionally filtered by channel). */
  async listRuns(channelId?: string): Promise<RunDetails[]> {
    const db = getDb();
    const runs = channelId
      ? await db.prepare("SELECT * FROM workflow_runs WHERE channel_id = ? ORDER BY created_at DESC").all(channelId) as WorkflowRunRow[]
      : await db.prepare("SELECT * FROM workflow_runs ORDER BY created_at DESC").all() as WorkflowRunRow[];
    const details: RunDetails[] = [];
    for (const r of runs) {
      const d = await this.getRunDetails(r.id);
      if (d) details.push(d);
    }
    return details;
  }

  /**
   * List runs with server-side search, status filter, and pagination.
   * Returns a page of RunDetails plus total count for the UI.
   */
  async listRunsPaginated(options: {
    channelId?: string;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: RunDetails[]; total: number }> {
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.channelId) {
      conditions.push("channel_id = ?");
      params.push(options.channelId);
    }
    if (options.search) {
      conditions.push("(topic LIKE ? OR id LIKE ?)");
      const pattern = `%${options.search}%`;
      params.push(pattern, pattern);
    }
    if (options.status && options.status !== "all") {
      conditions.push("status = ?");
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM workflow_runs ${where}`).get(...(params as never[])) as { count: number };
    const total = totalRow?.count ?? 0;

    const runs = await db.prepare(
      `SELECT * FROM workflow_runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...(params as never[]), limit, offset) as WorkflowRunRow[];

    const details: RunDetails[] = [];
    for (const r of runs) {
      const d = await this.getRunDetails(r.id);
      if (d) details.push(d);
    }
    return { runs: details, total };
  }

  // === Step claiming and execution ===

  /**
   * Transactionally claim a step for execution.
   * Uses BEGIN IMMEDIATE to prevent concurrent claims.
   * Returns the step if claimed, null if already claimed or not ready.
   */
  private async claimStep(runId: string, stepType: StepType): Promise<WorkflowStepRow | null> {
    const db = getDb();
    let claimed: WorkflowStepRow | null = null;

    await db.transaction(async () => {
      const step = await db.prepare(`
        SELECT * FROM workflow_steps
        WHERE run_id = ? AND step_type = ? AND status = 'pending'
      `).get(runId, stepType) as WorkflowStepRow | null;

      if (!step) return;

      // Read dependencies from the step's data (template-driven).
      // Fall back to PIPELINE_GRAPH for older runs without dependsOn in step_data.
      const stepData = JSON.parse(step.step_data) as { dependsOn?: string[] };
      const dependsOn = stepData.dependsOn
        ?? PIPELINE_GRAPH.find((n) => n.type === stepType)?.dependsOn
        ?? [];

      // Check all dependencies are completed or skipped
      for (const depType of dependsOn) {
        const dep = await db.prepare(`
          SELECT status FROM workflow_steps WHERE run_id = ? AND step_type = ?
        `).get(runId, depType) as { status: string } | null;

        if (!dep || (dep.status !== "completed" && dep.status !== "skipped")) return;
      }

      // Claim the step
      // Use SQLite's datetime format (YYYY-MM-DD HH:MM:SS) so the reclaim query
      // can compare against now(). ISO 8601 with 'T' separator sorts
      // after space-separated format, breaking the < comparison.
      const leaseExpires = new Date(Date.now() + LEASE_DURATION_MS)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");
      await db.prepare(`
        UPDATE workflow_steps
        SET status = 'running', started_at = now(), lease_expires_at = ?
        WHERE id = ?
      `).run(leaseExpires, step.id);

      claimed = step;
    });

    return claimed;
  }

  /**
   * Process a single run — find and execute runnable steps.
   * Called after run starts, after a step completes, or after an approval.
   *
   * Iterates the run's actual workflow_steps (created from the template
   * pipeline) rather than the global PIPELINE_GRAPH. Dependencies are read
   * from each step's `step_data.dependsOn`.
   */
  private async processRun(runId: string): Promise<void> {
    const db = getDb();
    const run = await db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | null;
    if (!run || (run.status !== "running" && run.status !== "pending")) return;

    // Ensure run is in running state
    if (run.status === "pending") {
      await db.prepare("UPDATE workflow_runs SET status = 'running', started_at = now() WHERE id = ?").run(runId);
    }

    // Find all pending steps (in creation order = topological order)
    const pendingSteps = await db.prepare(`
      SELECT * FROM workflow_steps WHERE run_id = ? AND status = 'pending' ORDER BY created_at ASC
    `).all(runId) as WorkflowStepRow[];

    for (const step of pendingSteps) {
      const stepData = JSON.parse(step.step_data) as { dependsOn?: string[] };
      const dependsOn = stepData.dependsOn
        ?? PIPELINE_GRAPH.find((n) => n.type === step.step_type)?.dependsOn
        ?? [];
      const node = PIPELINE_GRAPH.find((n) => n.type === step.step_type);

      // Check dependencies
      let depsMet = true;
      for (const depType of dependsOn) {
        const dep = await db.prepare(`
          SELECT status FROM workflow_steps WHERE run_id = ? AND step_type = ?
        `).get(runId, depType) as { status: string } | null;

        if (!dep || (dep.status !== "completed" && dep.status !== "skipped")) {
          depsMet = false;
          break;
        }
      }

      if (!depsMet) continue;

      // If ALL dependencies were skipped, auto-skip this step too.
      let allDepsSkipped = dependsOn.length > 0;
      if (allDepsSkipped) {
        for (const depType of dependsOn) {
          const dep = await db.prepare(`
            SELECT status FROM workflow_steps WHERE run_id = ? AND step_type = ?
          `).get(runId, depType) as { status: string } | null;
          if (dep?.status !== "skipped") {
            allDepsSkipped = false;
            break;
          }
        }
      }
      if (allDepsSkipped) {
        await this.skipStep(runId, step.id, "All dependencies skipped — step not applicable for this template");
        continue;
      }

      // Check if this is an approval step
      if (node?.requiresApproval) {
        this.requestApproval(runId, step.id, step.step_type as StepType);
        continue;
      }

      // Check budget for paid steps
      if (node?.isPaid) {
        try {
          // Estimate a nominal cost for the budget check (actual cost recorded after the call)
          const estimatedCost = 0.10; // conservative estimate — real cost tracked after provider call
          await checkBudget(estimatedCost, { runId });
        } catch {
          // Budget exceeded — pause the run and request budget approval
          await this.pauseForBudget(runId, step.id);
          return;
        }
      }

      // Claim and execute the step
      const claimed = await this.claimStep(runId, step.step_type as StepType);
      if (claimed) {
        this.executeStep(runId, claimed);
      }
    }

    // Check if run is complete
    await this.checkRunCompletion(runId);
  }

  /**
   * Execute a claimed step using its registered handler.
   * Creates an attempt record, runs the handler, and updates the step.
   */
  private async executeStep(runId: string, step: WorkflowStepRow): Promise<void> {
    const db = getDb();
    const node = PIPELINE_GRAPH.find((n) => n.type === step.step_type);
    if (!node) return;

    const handler = this.handlers.get(step.step_type as StepType);
    if (!handler) {
      // No handler registered — mark as failed
      await this.failStep(runId, step.id, `No handler registered for step type: ${step.step_type}`, false);
      return;
    }

    // Get attempt number
    const maxAttempt = await db.prepare(`
      SELECT MAX(attempt_number) as max FROM workflow_step_attempts WHERE step_id = ?
    `).get(step.id) as { max: number | null };
    const attemptNum = (maxAttempt.max ?? 0) + 1;
    const attemptId = crypto.randomUUID();

    // Create attempt record
    await db.prepare(`
      INSERT INTO workflow_step_attempts (id, step_id, attempt_number, status, started_at)
      VALUES (?, ?, ?, 'running', now())
    `).run(attemptId, step.id, attemptNum);

    await this.emitEvent(runId, step.id, "step_started", { stepType: step.step_type, attempt: attemptNum });

    // Gather dependency results — read dependsOn from step_data (template-driven)
    const stepDataParsed = JSON.parse(step.step_data) as { channelId: string; dependsOn?: string[] };
    const dependsOn = stepDataParsed.dependsOn
      ?? node.dependsOn;
    const dependencyResults: Partial<Record<StepType, Record<string, unknown>>> = {};
    for (const depType of dependsOn) {
      const depStep = await db.prepare(`
        SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = ? AND status = 'completed'
      `).get(runId, depType) as { result_data: string } | null;
      if (depStep?.result_data) {
        dependencyResults[depType as StepType] = JSON.parse(depStep.result_data);
      }
    }

    const logs: string[] = [];
    const channelId = stepDataParsed.channelId;

    // Fetch channel-level config for per-request provider/model overrides
    const chRow = await db.prepare(`
      SELECT approval_enabled, llm_config, image_provider,
             image_model_character, image_model_non_character,
             tts_provider, tts_voice_id, aspect_ratio,
             research_enabled, duplicate_adjudication_enabled,
             video_generation_enabled
      FROM channels WHERE id = ?
    `).get(channelId) as {
      approval_enabled: number;
      llm_config: string | null;
      image_provider: string;
      image_model_character: string | null;
      image_model_non_character: string | null;
      tts_provider: string;
      tts_voice_id: string;
      aspect_ratio: string;
      research_enabled: number;
      duplicate_adjudication_enabled: number;
      video_generation_enabled: number;
    } | null;

    // Load the channel's active template (merged with overrides)
    const tmplResult = await this.loadChannelTemplate(channelId);
    let mergedTemplate: TemplateConfig | null = null;
    let templateId: string | null = null;
    if (tmplResult) {
      templateId = tmplResult.id;
      mergedTemplate = tmplResult.config;
    }

    // Derive media settings from the merged template config (D017).
    // Priority: channel column (user's explicit choice) > template default > hardcoded fallback.
    // The template provides sensible defaults, but the user's channel-level settings
    // always win — they represent an explicit override.
    const tmplImage = mergedTemplate?.providers?.image;
    const tmplVoice = mergedTemplate?.providers?.voice;
    const tmplLayout = mergedTemplate?.layout;
    const tmplVideoGen = mergedTemplate ? isStepEnabled(mergedTemplate, "video_generation") : false;

    const channelConfig: ChannelConfig = chRow
      ? {
          approvalEnabled: chRow.approval_enabled === 1,
          llmConfig: chRow.llm_config ? JSON.parse(chRow.llm_config) : null,
          imageProvider: chRow.image_provider ?? tmplImage?.defaultProvider ?? "fal",
          imageModelCharacter: chRow.image_model_character ?? tmplImage?.characterModel ?? null,
          imageModelNonCharacter: chRow.image_model_non_character ?? tmplImage?.nonCharacterModel ?? null,
          ttsProvider: chRow.tts_provider ?? tmplVoice?.defaultProvider ?? "kokoro",
          ttsVoiceId: chRow.tts_voice_id ?? tmplVoice?.defaultVoiceId ?? "af_heart",
          aspectRatio: chRow.aspect_ratio ?? tmplLayout?.aspectRatio ?? "9:16",
          researchEnabled: chRow.research_enabled === 1,
          duplicateAdjudicationEnabled: chRow.duplicate_adjudication_enabled === 1,
          videoGenerationEnabled: tmplVideoGen || chRow.video_generation_enabled === 1,
          template: mergedTemplate,
          templateId,
        }
      : {
          approvalEnabled: true,
          llmConfig: null,
          imageProvider: tmplImage?.defaultProvider ?? "fal",
          imageModelCharacter: tmplImage?.characterModel ?? null,
          imageModelNonCharacter: tmplImage?.nonCharacterModel ?? null,
          ttsProvider: tmplVoice?.defaultProvider ?? "kokoro",
          ttsVoiceId: tmplVoice?.defaultVoiceId ?? "af_heart",
          aspectRatio: tmplLayout?.aspectRatio ?? "9:16",
          researchEnabled: true,
          duplicateAdjudicationEnabled: true,
          videoGenerationEnabled: tmplVideoGen,
          template: mergedTemplate,
          templateId,
        };

    const ctx: StepHandlerContext = {
      runId,
      stepId: step.id,
      stepType: step.step_type as StepType,
      channelId,
      channelConfig,
      inputData: JSON.parse(step.step_data),
      dependencyResults,
      attempt: attemptNum,
      log: (msg: string) => logs.push(msg),
    };

    try {
      const result = await handler(ctx);

      // Update attempt record
      await db.prepare(`
        UPDATE workflow_step_attempts
        SET status = ?, completed_at = now(),
            provider = ?, model = ?, remote_request_id = ?,
            cost_usd = ?, error_message = ?, logs = ?
        WHERE id = ?
      `).run(
        result.success ? "completed" : "failed",
        result.provider ?? null,
        result.model ?? null,
        result.remoteRequestId ?? null,
        result.costUsd ?? null,
        result.error ?? null,
        logs.join("\n") || null,
        attemptId,
      );

      if (result.success) {
        // Step succeeded
        if (result.skip) {
          await this.skipStep(runId, step.id, result.skipReason ?? "Skipped by handler");
        } else {
          await this.completeStep(runId, step.id, result);
        }
      } else {
        // Step failed — check if retryable
        const maxRetries = node.maxRetries ?? MAX_RETRIES_DEFAULT;
        if (result.retryable !== false && attemptNum < maxRetries) {
          await this.retryStep(runId, step.id, attemptNum, maxRetries, result.error ?? "Unknown error");
        } else {
          await this.failStep(runId, step.id, result.error ?? "Step failed", result.retryable !== false);
        }
      }
    } catch (err) {
      // Handler threw — treat as failed attempt
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db.prepare(`
        UPDATE workflow_step_attempts
        SET status = 'failed', completed_at = now(), error_message = ?, logs = ?
        WHERE id = ?
      `).run(errorMsg, logs.join("\n") || null, attemptId);

      const maxRetries = node.maxRetries ?? MAX_RETRIES_DEFAULT;
      if (attemptNum < maxRetries) {
        await this.retryStep(runId, step.id, attemptNum, maxRetries, errorMsg);
      } else {
        await this.failStep(runId, step.id, errorMsg, true);
      }
    }
  }

  // === Step state transitions ===

  private async completeStep(runId: string, stepId: string, result: { outputData?: Record<string, unknown>; provider?: string; model?: string; costUsd?: number }): Promise<void> {
    const db = getDb();
    await db.prepare(`
      UPDATE workflow_steps
      SET status = 'completed', completed_at = now(),
          result_data = ?, provider = ?, model = ?, actual_cost_usd = ?
      WHERE id = ?
    `).run(
      JSON.stringify(result.outputData ?? {}),
      result.provider ?? null,
      result.model ?? null,
      result.costUsd ?? null,
      stepId,
    );
    await this.emitEvent(runId, stepId, "step_completed", { provider: result.provider, model: result.model, cost: result.costUsd });
    this.processRun(runId).catch((err) => console.error("[workflow-engine] processRun error:", err));
  }

  private async failStep(runId: string, stepId: string, error: string, _retryable: boolean): Promise<void> {
    const db = getDb();
    await db.prepare(`
      UPDATE workflow_steps SET status = 'failed', completed_at = now()
      WHERE id = ?
    `).run(stepId);
    await this.emitEvent(runId, stepId, "step_failed", { error });

    // Fail the entire run
    await db.prepare(`
      UPDATE workflow_runs SET status = 'failed', completed_at = now()
      WHERE id = ?
    `).run(runId);
    await this.emitEvent(runId, null, "run_failed", { error, stepId });
  }

  private async skipStep(runId: string, stepId: string, reason: string): Promise<void> {
    const db = getDb();
    await db.prepare(`
      UPDATE workflow_steps SET status = 'skipped', completed_at = now(),
          result_data = ?
      WHERE id = ?
    `).run(JSON.stringify({ skipped: true, reason }), stepId);
    await this.emitEvent(runId, stepId, "step_skipped", { reason });
    this.processRun(runId).catch((err) => console.error("[workflow-engine] processRun error:", err));
  }

  private async retryStep(runId: string, stepId: string, attemptNum: number, maxRetries: number, error: string): Promise<void> {
    const db = getDb();
    // Reset step to pending for re-processing
    await db.prepare(`
      UPDATE workflow_steps SET status = 'pending', lease_expires_at = NULL
      WHERE id = ?
    `).run(stepId);

    const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, attemptNum - 1), BACKOFF_MAX_MS);
    await this.emitEvent(runId, stepId, "step_retried", { attempt: attemptNum, maxRetries, error, backoffMs });

    // Schedule retry after backoff
    setTimeout(() => {
      this.processRun(runId).catch((err) => console.error("[workflow-engine] processRun error:", err));
    }, backoffMs);
  }

  // === Approvals ===

  private async requestApproval(runId: string, stepId: string, stepType: StepType): Promise<void> {
    const db = getDb();
    const node = PIPELINE_GRAPH.find((n) => n.type === stepType);
    if (!node) return;

    // Check if the channel has approval disabled (auto-approve mode)
    const run = await db.prepare("SELECT channel_id FROM workflow_runs WHERE id = ?").get(runId) as { channel_id: string } | null;
    if (run) {
      const channel = await db.prepare("SELECT approval_enabled FROM channels WHERE id = ?").get(run.channel_id) as { approval_enabled: number } | null;
      if (channel && channel.approval_enabled === 0) {
        // Auto-approve: compute the "default approved" result data for this
        // step type so downstream handlers have the same information a human
        // approval would have provided.
        const resultData = await this.computeAutoApprovalData(runId, stepType);

        await db.prepare(`
          UPDATE workflow_steps SET status = 'completed', completed_at = now(), result_data = ?
          WHERE id = ? AND status = 'pending'
        `).run(JSON.stringify(resultData), stepId);

        // Create an auto-approved approval record for audit trail
        const approvalId = crypto.randomUUID();
        const approvalType = this.getApprovalType(stepType);
        await db.prepare(`
          INSERT INTO approvals (id, run_id, step_id, approval_type, status, reviewer, notes, decided_at)
          VALUES (?, ?, ?, ?, 'approved', 'system', 'Auto-approved (channel approval disabled)', now())
        `).run(approvalId, runId, stepId, approvalType);

        await this.emitEvent(runId, stepId, "step_approved", { approvalId, autoApproved: true, resultData });
        await this.emitEvent(runId, null, "approval_decided", { approvalId, decision: "approved", autoApproved: true });
        return;
      }
    }

    // Check if approval already exists
    const existing = await db.prepare(`
      SELECT id FROM approvals WHERE step_id = ? AND status = 'pending'
    `).get(stepId) as { id: string } | null;
    if (existing) return;

    // Mark step as waiting for approval
    await db.prepare(`
      UPDATE workflow_steps SET status = 'waiting_approval'
      WHERE id = ? AND status = 'pending'
    `).run(stepId);

    // Create approval record
    const approvalId = crypto.randomUUID();
    const approvalType = this.getApprovalType(stepType);
    await db.prepare(`
      INSERT INTO approvals (id, run_id, step_id, approval_type, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(approvalId, runId, stepId, approvalType);

    // Pause the run
    await db.prepare("UPDATE workflow_runs SET status = 'paused' WHERE id = ? AND status = 'running'").run(runId);

    await this.emitEvent(runId, stepId, "step_waiting_approval", { approvalId, approvalType });
    await this.emitEvent(runId, null, "run_paused", { reason: "approval_required", stepId });
    await this.emitEvent(runId, null, "approval_requested", { approvalId, approvalType, stepType });
  }

  /** Process an approval decision. */
  async decideApproval(input: ApprovalDecisionInput): Promise<RunDetails | null> {
    const db = getDb();
    const approval = await db.prepare("SELECT * FROM approvals WHERE id = ? AND status = 'pending'").get(input.approvalId) as ApprovalRow | null;
    if (!approval) return null;

    await db.transaction(async () => {
      // Update approval
      await db.prepare(`
        UPDATE approvals SET status = ?, reviewer = ?, notes = ?, decided_at = now()
        WHERE id = ?
      `).run(input.decision, input.reviewer ?? null, input.notes ?? null, input.approvalId);

      if (input.decision === "approved") {
        // Mark step as completed with optional edited data
        const resultData = input.editedData ?? {};
        await db.prepare(`
          UPDATE workflow_steps SET status = 'completed', completed_at = now(),
              result_data = ?
          WHERE id = ?
        `).run(JSON.stringify(resultData), approval.step_id);

        // Resume the run
        await db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ?").run(approval.run_id);

        await this.emitEvent(approval.run_id, approval.step_id, "step_approved", { approvalId: input.approvalId });
        await this.emitEvent(approval.run_id, null, "run_resumed", { reason: "approval_approved" });
        await this.emitEvent(approval.run_id, null, "approval_decided", { approvalId: input.approvalId, decision: "approved" });
      } else {
        // Rejected — fail the step and run
        await db.prepare(`
          UPDATE workflow_steps SET status = 'failed', completed_at = now()
          WHERE id = ?
        `).run(approval.step_id);

        await db.prepare(`
          UPDATE workflow_runs SET status = 'failed', completed_at = now()
          WHERE id = ?
        `).run(approval.run_id);

        await this.emitEvent(approval.run_id, approval.step_id, "step_rejected", { approvalId: input.approvalId });
        await this.emitEvent(approval.run_id, null, "run_failed", { reason: "approval_rejected", stepId: approval.step_id });
        await this.emitEvent(approval.run_id, null, "approval_decided", { approvalId: input.approvalId, decision: "rejected" });
      }
    });

    // Process the run after approval
    if (input.decision === "approved") {
      await this.processRun(approval.run_id);
    }

    return await this.getRunDetails(approval.run_id);
  }

  private getApprovalType(stepType: StepType): ApprovalType {
    switch (stepType) {
      case "story_approval": return "story";
      case "script_approval": return "script";
      case "image_review": return "image";
      case "similarity_review": return "story";
      default: return "story";
    }
  }

  /**
   * Compute the "default approved" result data for an auto-approved step.
   *
   * When a channel has approval disabled, the pipeline auto-approves each
   * checkpoint. Instead of storing empty `{}`, we compute the same data a
   * human approval would have provided:
   *
   * - story_approval: select the best candidate (from duplicate detection)
   *   and store { candidateIndex } so downstream handlers know which
   *   candidate was "chosen". The scenePlanHandler will create the story
   *   version from this index.
   * - script_approval: the scene plan is already final — store `{}`.
   * - image_review: all generated images are accepted — store `{}`.
   */
  private async computeAutoApprovalData(runId: string, stepType: StepType): Promise<Record<string, unknown>> {
    const db = getDb();

    if (stepType === "story_approval") {
      // Find the best candidate index from duplicate_detection results.
      // duplicate_detection marks the best candidate with bestCandidate=true.
      const dupRow = await db.prepare(`
        SELECT result_data FROM workflow_steps
        WHERE run_id = ? AND step_type = 'duplicate_detection' AND status = 'completed'
      `).get(runId) as { result_data: string } | null;

      let candidateIndex = 0;
      if (dupRow?.result_data) {
        const dupResult = JSON.parse(dupRow.result_data) as {
          results?: Array<{ candidateIndex: number; bestCandidate: boolean }>;
        };
        const best = dupResult.results?.find((r) => r.bestCandidate);
        if (best) candidateIndex = best.candidateIndex;
      }

      return { candidateIndex, autoSelected: true };
    }

    // script_approval and image_review: no special data needed.
    // Downstream handlers fetch what they need from prior steps directly.
    return { autoApproved: true };
  }

  // === Budget ===

  private async pauseForBudget(runId: string, stepId: string): Promise<void> {
    const db = getDb();
    const approvalId = crypto.randomUUID();

    await db.transaction(async () => {
      await db.prepare(`
        UPDATE workflow_steps SET status = 'waiting_approval'
        WHERE id = ?
      `).run(stepId);

      await db.prepare(`
        INSERT INTO approvals (id, run_id, step_id, approval_type, status)
        VALUES (?, ?, ?, 'budget', 'pending')
      `).run(approvalId, runId, stepId);

      await db.prepare("UPDATE workflow_runs SET status = 'paused' WHERE id = ?").run(runId);
    });
    await this.emitEvent(runId, stepId, "budget_exceeded", { approvalId });
    await this.emitEvent(runId, null, "run_paused", { reason: "budget_exceeded", stepId });
    await this.emitEvent(runId, null, "approval_requested", { approvalId, approvalType: "budget" });
  }

  // === Crash recovery ===

  /** Reclaim steps whose leases have expired. Called periodically. */
  private async reclaimExpiredLeases(): Promise<void> {
    const db = getDb();
    const expired = await db.prepare(`
      SELECT * FROM workflow_steps
      WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now()
    `).all() as WorkflowStepRow[];

    for (const step of expired) {
      await db.transaction(async () => {
        // Reset step to pending for retry
        await db.prepare(`
          UPDATE workflow_steps SET status = 'pending', lease_expires_at = NULL
          WHERE id = ?
        `).run(step.id);

        // Mark the current attempt as failed
        await db.prepare(`
          UPDATE workflow_step_attempts
          SET status = 'failed', completed_at = now(),
              error_message = 'Lease expired (crash recovery)'
          WHERE step_id = ? AND status = 'running'
        `).run(step.id);
      });

      await this.emitEvent(step.run_id, step.id, "step_retried", {
        attempt: 0,
        maxRetries: PIPELINE_GRAPH.find((n) => n.type === step.step_type)?.maxRetries ?? MAX_RETRIES_DEFAULT,
        error: "Lease expired — step reclaimed",
        backoffMs: 0,
      });
      console.log(`[workflow-engine] Reclaimed expired step: ${step.step_type} (run ${step.run_id.slice(0, 8)})`);
    }

    if (expired.length > 0) {
      // Re-process affected runs
      const affectedRuns = new Set(expired.map((s) => s.run_id));
      for (const runId of affectedRuns) {
        this.processRun(runId).catch((err) => console.error("[workflow-engine] processRun error:", err));
      }
    }
  }

  // === Run completion ===

  private async checkRunCompletion(runId: string): Promise<void> {
    const db = getDb();
    const steps = await db.prepare("SELECT status FROM workflow_steps WHERE run_id = ?").all(runId) as { status: string }[];
    const allDone = steps.every((s) => s.status === "completed" || s.status === "skipped");
    const anyFailed = steps.some((s) => s.status === "failed");

    if (anyFailed) return; // Run already marked as failed

    if (allDone && steps.length > 0) {
      await db.prepare(`
        UPDATE workflow_runs SET status = 'completed', completed_at = now()
        WHERE id = ? AND status = 'running'
      `).run(runId);
      await this.emitEvent(runId, null, "run_completed", {});
    }
  }

  /** Process all runs that are in running state. */
  private async processRunnableRuns(): Promise<void> {
    const db = getDb();
    const runs = await db.prepare("SELECT id FROM workflow_runs WHERE status = 'running'").all() as { id: string }[];
    for (const run of runs) {
      this.processRun(run.id).catch((err) => console.error("[workflow-engine] processRun error:", err));
    }
  }

  // === Events ===

  private async emitEvent(runId: string, stepId: string | null, eventType: WorkflowEventType, payload: Record<string, unknown>): Promise<void> {
    const db = getDb();
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await db.prepare(`
        INSERT INTO workflow_events (id, run_id, step_id, event_type, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, runId, stepId, eventType, JSON.stringify(payload), now);
    } catch (err) {
      // Event logging is non-critical — don't let FK errors crash the engine
      console.error("[workflow-engine] Failed to emit event:", err);
    }

    const event: WorkflowEvent = {
      id: eventId,
      runId,
      stepId,
      eventType,
      payload,
      createdAt: now,
    };

    try {
      sseManager.broadcast(event);
    } catch { /* SSE broadcast failure is non-critical */ }

    try {
      ablyManager.publish(event);
    } catch { /* Ably publish failure is non-critical */ }
  }

  /** Get events for a run (for replay to late SSE subscribers). */
  async getRunEvents(runId: string, sinceId?: string): Promise<WorkflowEvent[]> {
    const db = getDb();
    const rows = sinceId
      ? await db.prepare(`
        SELECT * FROM workflow_events WHERE run_id = ? AND id > ? ORDER BY created_at ASC
      `).all(runId, sinceId) as WorkflowEventRow[]
      : await db.prepare(`
        SELECT * FROM workflow_events WHERE run_id = ? ORDER BY created_at ASC
      `).all(runId) as WorkflowEventRow[];

    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      stepId: r.step_id,
      eventType: r.event_type as WorkflowEventType,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
    }));
  }
}
