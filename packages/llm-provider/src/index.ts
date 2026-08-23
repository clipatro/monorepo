/**
 * @automation/llm-provider — factory for creating LLM clients.
 *
 * Services call createLlmClient(config) to get an LlmClient instance
 * based on the LLM_PROVIDER env var. This is the single point where
 * provider selection happens — all services depend on LlmClient, not
 * on a concrete client class.
 *
 * To add a new provider:
 * 1. Create a package implementing LlmClient (e.g. @automation/openai-client)
 * 2. Add it as a dependency here
 * 3. Add a case in createLlmClient()
 *
 * To switch providers at runtime: set LLM_PROVIDER=deepseek (or gemini) in .env
 */

import type { LlmClient, LlmProviderName, LlmCallOptions, LlmCallResult } from "@automation/contracts";
import type { AppConfig } from "@automation/config";
import { GeminiClient } from "@automation/gemini-client";
import { DeepSeekClient } from "@automation/deepseek-client";

/**
 * Create an LlmClient based on the configured provider.
 *
 * @param config The app config (determines which provider + API key to use)
 * @param override Optional provider name to override the config default.
 *                 Useful for capabilities that need a specific provider
 *                 (e.g. research grounding must use Gemini).
 * @returns An LlmClient instance (GeminiClient or DeepSeekClient)
 */
export function createLlmClient(config: AppConfig, override?: LlmProviderName): LlmClient {
  const provider = override ?? config.llmProvider;

  switch (provider) {
    case "gemini":
      return new GeminiClient(config.geminiApiKey);

    case "deepseek":
      return new DeepSeekClient(config.deepseekApiKey);

    default:
      throw new Error(`Unknown LLM provider: ${provider}. Set LLM_PROVIDER to "gemini" or "deepseek".`);
  }
}

/**
 * Create a Gemini client specifically for capabilities that require Gemini
 * (e.g. research grounding with Google Search).
 *
 * This bypasses the provider selection — always returns a GeminiClient.
 */
export function createGeminiClient(config: AppConfig): LlmClient {
  return new GeminiClient(config.geminiApiKey);
}

export { GeminiClient, DeepSeekClient };
export type { LlmClient, LlmCallOptions, LlmCallResult, LlmProviderName };
