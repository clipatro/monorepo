/**
 * S02 — Gemini research/grounding behavior for factual content.
 *
 * Goal: Verify Gemini can ground factual claims using Google Search
 * (grounding metadata) and return structured source/claim mappings.
 * This validates the Researcher facade for psychology-concept and
 * true-case content.
 */

import { writeArtifact, type SpikeResult } from "./lib/spike.ts";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.7-flash";
const API = "https://generativelanguage.googleapis.com/v1beta";

interface RawGrounding {
  sources?: unknown;
  claims?: unknown;
  uncertainties?: unknown;
  allowedFacts?: unknown;
  warnings?: unknown;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((e) => typeof e === "string");
}

export async function run(): Promise<SpikeResult> {
  if (!GEMINI_KEY) {
    return {
      id: "s02",
      name: "Gemini research/grounding",
      goal: "Verify Gemini grounds factual claims with Google Search metadata.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  // Test 1: Verify grounding works with a current-events query (must search).
  const groundingTestPrompt = "What are the latest findings in psychology research about procrastination and dopamine? Summarize with sources.";
  const groundingTestBody = {
    contents: [{ role: "user", parts: [{ text: groundingTestPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };

  const gt0 = performance.now();
  const gtRes = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(groundingTestBody),
  });
  const gtRaw = await gtRes.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };
  const groundingTestLatencyMs = Math.round(performance.now() - gt0);
  const gtGrounding = gtRaw.candidates?.[0]?.groundingMetadata;
  const gtChunks = gtGrounding?.groundingChunks?.length ?? 0;
  const gtQueries = gtGrounding?.webSearchQueries?.length ?? 0;

  // Test 2: Structured research output (JSON) — may or may not trigger search.
  const prompt = `Research the psychology concept "cognitive dissonance" for a short-form educational video.
Find reputable sources using Google Search and cite them.
Return a JSON object with exactly these fields:
- sources: array of { id, title, url, excerpt } — reputable sources found via search
- claims: array of { id, claim, sourceIds, confidence } — factual claims mapped to sources
- uncertainties: array of strings — unresolved questions
- allowedFacts: array of strings — facts safe to state in a script
- warnings: array of strings — privacy, defamation, or medical-claim warnings

Return ONLY a valid JSON object starting with { and ending with }. No markdown fences, no commentary before or after.`;

  // First attempt: try with google_search grounding tool.
  // NOTE: google_search is incompatible with responseMimeType=application/json.
  // When using grounding, we must parse JSON from the text output instead.
  const bodyWithGrounding = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  };

  const bodyWithoutGrounding = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
  };

  // Try with grounding first; fall back to without if 429 or empty output.
  let body: typeof bodyWithGrounding | typeof bodyWithoutGrounding = bodyWithGrounding;
  let usedGrounding = true;

  const t0 = performance.now();
  let res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let raw = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        groundingSupports?: unknown[];
      };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  // Fallback conditions: 429, or grounding returned empty text.
  const groundingText = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if ((res.status === 429 || (res.ok && usedGrounding && groundingText.trim().length === 0)) && usedGrounding) {
    body = bodyWithoutGrounding;
    usedGrounding = false;
    res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    raw = await res.json() as typeof raw;
  }
  const latencyMs = Math.round(performance.now() - t0);

  if (!res.ok) {
    const artifact = await writeArtifact("s02", "error.json", JSON.stringify(raw, null, 2));
    return {
      id: "s02",
      name: "Gemini research/grounding",
      goal: "Verify Gemini grounds factual claims with Google Search metadata.",
      result: "fail",
      measurements: { "httpStatus": res.status, "latencyMs": latencyMs, "errorMessage": raw.error?.message ?? "unknown" },
      notes: "Gemini API returned an error.",
      artifactPaths: [artifact],
    };
  }

  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const grounding = raw.candidates?.[0]?.groundingMetadata;
  const usage = raw.usageMetadata ?? {};

  let parsed: RawGrounding | null = null;
  let parseError = "";
  try {
    // When using grounding (no responseMimeType), the model may wrap JSON in
    // markdown fences or add prose. Extract the JSON object.
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      // Strip markdown fences.
      const fenceStart = jsonText.indexOf("\n");
      const fenceEnd = jsonText.lastIndexOf("```");
      if (fenceStart !== -1 && fenceEnd !== -1) {
        jsonText = jsonText.slice(fenceStart + 1, fenceEnd).trim();
      }
    }
    // Find the first { and last } as a fallback.
    if (!jsonText.startsWith("{")) {
      const first = jsonText.indexOf("{");
      const last = jsonText.lastIndexOf("}");
      if (first !== -1 && last !== -1) {
        jsonText = jsonText.slice(first, last + 1);
      }
    }
    parsed = JSON.parse(jsonText) as RawGrounding;
  } catch (e) {
    parseError = String(e);
  }

  const hasSources = Array.isArray(parsed?.sources) && (parsed?.sources as unknown[]).length > 0;
  const hasClaims = Array.isArray(parsed?.claims) && (parsed?.claims as unknown[]).length > 0;
  const hasUncertainties = isStringArray(parsed?.uncertainties);
  const hasAllowedFacts = isStringArray(parsed?.allowedFacts);
  const hasWarnings = isStringArray(parsed?.warnings);
  const hasGroundingMetadata = !!grounding;
  const groundingChunks = grounding?.groundingChunks?.length ?? 0;
  const searchQueries = grounding?.webSearchQueries?.length ?? 0;

  const artifact = await writeArtifact(
    "s02",
    "response.json",
    JSON.stringify({ raw, parsed, groundingSummary: { hasGroundingMetadata, groundingChunks, searchQueries } }, null, 2),
  );

  // Pass: grounding works (test 1) AND structured output valid (test 2).
  // Partial: one works but not the other (e.g. grounding works but JSON
  //   generation doesn't trigger search, or vice versa).
  // Fail: neither works.
  const structuredOk = hasSources && hasClaims;
  const groundingOk = gtChunks > 0;
  const result: "pass" | "partial" | "fail" = structuredOk && groundingOk
    ? "pass"
    : structuredOk || groundingOk
      ? "partial"
      : "fail";

  return {
    id: "s02",
    name: "Gemini research/grounding",
    goal: "Verify Gemini grounds factual claims with Google Search metadata.",
    result,
    measurements: {
      "httpStatus": res.status,
      "latencyMs": latencyMs,
      "parseOk": parseError === "",
      "hasSources": hasSources,
      "hasClaims": hasClaims,
      "hasUncertainties": hasUncertainties,
      "hasAllowedFacts": hasAllowedFacts,
      "hasWarnings": hasWarnings,
      "hasGroundingMetadata": hasGroundingMetadata,
      "groundingChunks": groundingChunks,
      "searchQueries": searchQueries,
      "usedGroundingTool": usedGrounding,
      "groundingTest.latencyMs": groundingTestLatencyMs,
      "groundingTest.chunks": gtChunks,
      "groundingTest.queries": gtQueries,
      "groundingWorks": gtChunks > 0,
      "promptTokens": usage.promptTokenCount ?? 0,
      "outputTokens": usage.candidatesTokenCount ?? 0,
    },
    notes: result === "pass"
      ? "Grounding works (test 1) AND structured research JSON valid (test 2). Both capabilities confirmed."
      : result === "partial"
        ? groundingOk
          ? "Grounding works for current-events queries, but structured JSON generation doesn't trigger search for well-known topics. Architecture: use a two-step research flow (search first, then structure)."
          : `Structured output valid but grounding not triggered for this query. Grounding may need more current/uncertain topics.`
        : `Both grounding and structured output failed. Parse error: ${parseError || "none"}.`,
    artifactPaths: [artifact],
  };
}
