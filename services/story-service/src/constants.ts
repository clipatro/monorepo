import { loadConfig } from "@automation/config";

/** Model ids per provider — selected at runtime based on LLM_PROVIDER config. */
const GEMINI_MODEL = "gemini-3.6-flash";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

/**
 * Returns the model id for the active LLM provider.
 * Reads LLM_PROVIDER from env (default: "gemini") so it works
 * without needing a config object passed in.
 */
function getModel(llmProvider?: "gemini" | "deepseek"): string {
  const provider = llmProvider ?? (process.env.LLM_PROVIDER as "gemini" | "deepseek" | undefined) ?? "gemini";
  return provider === "deepseek" ? DEEPSEEK_MODEL : GEMINI_MODEL;
}

const _storyConfig = loadConfig("story-service");
const EMBEDDING_SERVICE_URL = _storyConfig.services.embeddingService;

export { GEMINI_MODEL, DEEPSEEK_MODEL, getModel, EMBEDDING_SERVICE_URL };
