/**
 * @automation/workflow-engine — durable SQLite-backed workflow runner.
 *
 * Core responsibilities:
 * - Create runs and their step graph from the fixed PIPELINE_GRAPH
 * - Transactional step claiming (BEGIN IMMEDIATE, row-level locks)
 * - Step leases with expiry and crash recovery
 * - Retries with exponential backoff and attempt history
 * - Human approval checkpoints (pause/resume/reject)
 * - Budget checks before paid steps
 * - SSE event emission for live UI updates
 *
 * The engine does NOT execute provider calls itself — it orchestrates steps
 * and delegates to capability services. Step handlers are registered at startup.
 */

export { WorkflowEngine } from "./engine.ts";
export type { StepHandler, StepHandlerContext, StepHandlerResult, ChannelConfig, LlmStepConfig, LlmStepKey } from "./types.ts";
export { SSEManager, sseManager } from "./sse.ts";
export { AblyManager, ablyManager } from "./ably.ts";
