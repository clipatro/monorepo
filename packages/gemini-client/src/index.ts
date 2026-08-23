/**
 * @automation/gemini-client — shared Gemini API client helpers.
 *
 * Wraps the Gemini REST API with:
 * - Structured JSON generation (responseMimeType: application/json)
 * - Grounding with Google Search (two-step flow)
 * - Cost tracking (checkBudget before, recordCost after)
 * - Error handling with retryable flag
 *
 * Used by story-service and research-service.
 */

export { GeminiClient, extractJson } from "./client.ts";
export type { GeminiCallOptions, GeminiCallResult } from "./client.ts";
