/**
 * LlmClient — provider-agnostic LLM interface.
 *
 * Every text-generation adapter (Gemini, DeepSeek, OpenAI, …) implements
 * this interface. Services depend on `LlmClient`, not on a concrete client,
 * so swapping providers is a config change — no caller code changes.
 *
 * The interface intentionally mirrors GeminiClient.call() so the existing
 * GeminiClient can adopt it with zero refactoring.
 */

import type { CostBreakdown } from "@automation/cost-tracker";

/** Options for a single LLM call. */
export interface LlmCallOptions {
  /** Model id, e.g. "gemini-3.6-flash" or "deepseek-v4-flash". */
  model: string;
  /** The prompt text. */
  prompt: string;
  /** Temperature (0-2). */
  temperature?: number;
  /** Max output tokens. */
  maxOutputTokens?: number;
  /**
   * Whether to use web search grounding (Google Search, Brave, etc.).
   * When true, responseMimeType is not set.
   * Only supported by providers that offer grounding.
   */
  useGrounding?: boolean;
  /** Whether to request JSON output. Default: true. */
  responseJson?: boolean;
  /** System instruction (optional). */
  systemInstruction?: string;
  /** Capability name for cost tracking, e.g. "story.generate". */
  capability: string;
  /** Run id for cost tracking. */
  runId?: string;
  /** Step id for cost tracking. */
  stepId?: string;
  /** Idempotency key. */
  idempotencyKey?: string;
  /**
   * DeepSeek V4 thinking mode. When true, the model reasons before answering
   * (consumes reasoning tokens from maxOutputTokens budget). Default: false.
   * When thinking is enabled, temperature is ignored by the API.
   */
  thinkingEnabled?: boolean;
  /** Thinking effort when thinkingEnabled is true: "low" | "high" | "max". */
  reasoningEffort?: "low" | "high" | "max";
}

/** Result of a single LLM call. */
export interface LlmCallResult {
  /** The raw text output. */
  text: string;
  /** Parsed JSON if the output was valid JSON (or null if not parseable). */
  json: unknown | null;
  /** Usage metadata. */
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Grounding metadata (when useGrounding is true and provider supports it). */
  grounding?: {
    searchQueries: string[];
    chunks: Array<{ uri?: string; title?: string }>;
  };
  /** Cost breakdown. */
  cost: CostBreakdown;
  /** Remote request id (from response headers, if available). */
  remoteRequestId?: string;
  /** Whether this was a dry-run (dummy data, no real API call). */
  dryRun?: boolean;
}

/**
 * Provider-agnostic LLM client interface.
 *
 * Implemented by GeminiClient, DeepSeekClient, and future adapters.
 * Services depend on this interface, not on a concrete client class.
 */
export interface LlmClient {
  /** Returns true if dry-run mode is active. */
  isDryRun(): boolean;
  /** Execute an LLM call with cost tracking. */
  call(options: LlmCallOptions): Promise<LlmCallResult>;
}

/** Provider name for cost tracking and logging. */
export type LlmProviderName = "gemini" | "deepseek";
