/**
 * Common provider envelope types shared by all capability facades.
 *
 * Every provider call returns a ProviderResponse<T> carrying the result plus
 * the audit metadata required by the plan (provider, model, request id, cost,
 * usage, checksum, lineage). This makes provider swaps transparent to callers.
 */

/** A provider-agnostic request envelope. */
export interface ProviderRequest<TInput = unknown> {
  /** Stable capability id, e.g. "image.generate", "story.generate". */
  capability: string;
  /** Provider-agnostic input payload. */
  input: TInput;
  /** Idempotency key for safe retries. */
  idempotencyKey?: string;
  /** Optional correlation id linking this call to a workflow step. */
  correlationId?: string;
}

/** Cost and usage metadata recorded for every provider call. */
export interface UsageMetadata {
  /** Estimated cost in USD before execution, when known. */
  estimatedCostUsd?: number;
  /** Actual cost in USD after execution, when known. */
  actualCostUsd?: number;
  /** Provider-specific usage units, e.g. { inputTokens, outputTokens, images }. */
  units?: Record<string, number>;
}

/** Audit lineage for a provider response. */
export interface ProviderLineage {
  /** Parent response id if this is a regeneration or retry. */
  parentId?: string;
  /** Attempt number (1-based). */
  attempt: number;
}

/** A provider-agnostic response envelope. */
export interface ProviderResponse<TOutput = unknown> {
  /** Unique id for this response. */
  id: string;
  /** Provider name, e.g. "gemini", "kokoro", "flux". */
  provider: string;
  /** Provider model id, e.g. "gemini-3.1-flash-lite-image". */
  model: string;
  /** Remote provider request id, when available. */
  remoteRequestId?: string;
  /** Provider-agnostic output payload. */
  output: TOutput;
  /** Cost and usage metadata. */
  usage: UsageMetadata;
  /** Lineage / attempt info. */
  lineage: ProviderLineage;
  /** ISO timestamp of completion. */
  completedAt: string;
  /** Optional checksum of the primary artifact, when applicable. */
  artifactChecksum?: string;
  /** Optional local path to the primary artifact, when applicable. */
  artifactPath?: string;
}

/** Standard error thrown by adapters, carrying provider context. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly model: string,
    readonly cause?: unknown,
    readonly retryable?: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
