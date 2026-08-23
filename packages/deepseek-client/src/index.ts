/**
 * @automation/deepseek-client — DeepSeek V4 API adapter.
 *
 * Implements the LlmClient interface from @automation/contracts.
 * DeepSeek API is OpenAI-compatible (POST /chat/completions).
 *
 * Used as an alternative to @automation/gemini-client for text generation.
 * Grounding (web search) is NOT supported — use Gemini for grounded research.
 */

export { DeepSeekClient, extractJson } from "./client.ts";
