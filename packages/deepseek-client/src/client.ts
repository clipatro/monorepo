/**
 * DeepSeekClient — adapter for the DeepSeek V4 API (OpenAI-compatible).
 *
 * Implements the LlmClient interface from @automation/contracts so services
 * can swap between Gemini and DeepSeek via config — no caller code changes.
 *
 * DeepSeek API: https://api.deepseek.com/chat/completions
 * OpenAI-compatible format. Supports JSON output mode and thinking mode.
 *
 * Grounding (web search) is NOT supported by DeepSeek — calls with
 * useGrounding=true will throw. Research grounding stays on Gemini.
 */

import { ProviderError, type LlmClient, type LlmCallOptions, type LlmCallResult } from "@automation/contracts";
import { checkBudget, calculateCost, recordCost } from "@automation/cost-tracker";

const API_BASE = "https://api.deepseek.com";

// === Dry-run flag ===

import { isDryRun } from "@automation/contracts";

function readDryRunFlag(): boolean {
  return isDryRun();
}

export class DeepSeekClient implements LlmClient {
  private apiKey: string;
  private dryRun: boolean;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.dryRun = readDryRunFlag();
    if (!this.apiKey && !this.dryRun) {
      console.warn("[deepseek-client] DEEPSEEK_API_KEY not set — DeepSeek calls will fail");
    }
    if (this.dryRun) {
      console.log("[deepseek-client] DRY-RUN mode active — all DeepSeek calls return dummy data (no API cost)");
    }
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  async call(options: LlmCallOptions): Promise<LlmCallResult> {
    // Grounding is Gemini-only
    if (options.useGrounding) {
      throw new ProviderError(
        "DeepSeek does not support web search grounding. Use Gemini for grounded research.",
        "deepseek", options.model, undefined, false,
      );
    }

    // Dry-run mode
    if (this.dryRun) {
      return dryRunCall(options);
    }

    if (!this.apiKey) {
      throw new ProviderError("DEEPSEEK_API_KEY not set", "deepseek", options.model, undefined, false);
    }

    // Check budget
    const estimatedCost = 0.01;
    try {
      checkBudget(estimatedCost, { runId: options.runId });
    } catch (err) {
      throw new ProviderError(
        `Budget exceeded: ${err instanceof Error ? err.message : "unknown"}`,
        "deepseek", options.model, err, false,
      );
    }

    // Build OpenAI-compatible request body
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemInstruction) {
      messages.push({ role: "system", content: options.systemInstruction });
    }
    messages.push({ role: "user", content: options.prompt });

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxOutputTokens ?? 4096,
      stream: false,
    };

    // DeepSeek V4 has thinking mode enabled by default, which consumes
    // reasoning tokens from the max_tokens budget. For most generation tasks
    // (story, scene planning, classification), thinking mode is unnecessary
    // and wastes tokens. Allow callers to explicitly enable it via
    // options.thinkingEnabled. When temperature is set, thinking mode must
    // be disabled (DeepSeek doesn't support temperature in thinking mode).
    const thinkingEnabled = options.thinkingEnabled === true;
    if (thinkingEnabled) {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = options.reasoningEffort ?? "high";
    } else {
      body.thinking = { type: "disabled" };
      body.temperature = options.temperature ?? 0.8;
    }

    // Request JSON output
    if (options.responseJson !== false) {
      body.response_format = { type: "json_object" };
    }

    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Math.round(performance.now() - t0);

    const raw = await res.json() as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      error?: { message?: string; type?: string };
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
    };

    if (!res.ok) {
      const msg = raw.error?.message ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status === 503;
      throw new ProviderError(msg, "deepseek", options.model, raw.error, retryable);
    }

    const text = raw.choices?.[0]?.message?.content ?? "";
    const usage = raw.usage ?? {};

    // Parse JSON from text
    let json: unknown | null = null;
    if (options.responseJson !== false) {
      json = extractJson(text);
    }

    // Calculate cost
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;

    const cost = calculateCost({
      model: options.model,
      inputTokens,
      outputTokens,
    });

    recordCost(cost, {
      runId: options.runId,
      stepId: options.stepId,
      capability: options.capability,
      inputTokens,
      outputTokens,
      notes: `latency=${latencyMs}ms`,
    });

    return {
      text,
      json,
      usage: {
        promptTokens: inputTokens,
        outputTokens,
        totalTokens: usage.total_tokens ?? 0,
      },
      cost,
    };
  }
}

// === Dry-run implementation ===

async function dryRunCall(options: LlmCallOptions): Promise<LlmCallResult> {
  // Reuse Gemini dry-run dummy data structure — same capabilities
  // Import lazily to avoid circular dependency
  const { generateDummyResponse } = await import("./dry-run.ts");
  const dummyData = generateDummyResponse(options);
  const dummyText = JSON.stringify(dummyData, null, 2);
  const dummyUsage = {
    promptTokens: Math.min(Math.ceil(options.prompt.length / 4), 500),
    outputTokens: Math.min(Math.ceil(dummyText.length / 4), 1000),
    totalTokens: Math.min(Math.ceil((options.prompt.length + dummyText.length) / 4), 1500),
  };

  const cost = calculateCost({
    model: options.model,
    inputTokens: dummyUsage.promptTokens,
    outputTokens: dummyUsage.outputTokens,
  });
  cost.totalCost = 0;
  cost.inputCost = 0;
  cost.outputCost = 0;
  cost.imageCost = 0;
  cost.groundingCost = 0;

  recordCost(cost, {
    runId: options.runId,
    stepId: options.stepId,
    capability: options.capability,
    inputTokens: dummyUsage.promptTokens,
    outputTokens: dummyUsage.outputTokens,
    notes: "DRY-RUN (no API call)",
  });

  return {
    text: dummyText,
    json: extractJson(dummyText),
    usage: dummyUsage,
    cost,
    remoteRequestId: `dry-run-${Date.now()}`,
    dryRun: true,
  };
}

/**
 * Extract JSON from a text string that may contain:
 * - Pure JSON
 * - JSON wrapped in markdown fences (```json ... ```)
 * - JSON embedded in prose (find first { and last })
 */
export function extractJson(text: string): unknown | null {
  let jsonText = text.trim();

  if (jsonText.length === 0) return null;

  // Strip markdown fences
  if (jsonText.startsWith("```")) {
    const fenceStart = jsonText.indexOf("\n");
    const fenceEnd = jsonText.lastIndexOf("```");
    if (fenceStart !== -1 && fenceEnd !== -1 && fenceEnd > fenceStart) {
      jsonText = jsonText.slice(fenceStart + 1, fenceEnd).trim();
    }
  }

  // If still doesn't start with { or [, try to extract
  if (!jsonText.startsWith("{") && !jsonText.startsWith("[")) {
    const firstBrace = jsonText.indexOf("{");
    const firstBracket = jsonText.indexOf("[");
    const first = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
    if (first === -1) return null;

    if (jsonText[first] === "{") {
      const lastBrace = jsonText.lastIndexOf("}");
      if (lastBrace > first) {
        jsonText = jsonText.slice(first, lastBrace + 1);
      }
    } else {
      const lastBracket = jsonText.lastIndexOf("]");
      if (lastBracket > first) {
        jsonText = jsonText.slice(first, lastBracket + 1);
      }
    }
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}
