/**
 * S01 — Gemini structured JSON generation and schema adherence.
 *
 * Goal: Verify that Gemini returns valid structured JSON conforming to a
 * Zod-equivalent schema for story candidates, and that schema violations
 * are detectable. This validates the StoryGenerator facade contract.
 */

import { writeArtifact, type SpikeResult } from "./lib/spike.ts";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";
const API = "https://generativelanguage.googleapis.com/v1beta";

interface RawCandidate {
  title?: unknown;
  hook?: unknown;
  premise?: unknown;
  storyline?: unknown;
  contentType?: unknown;
  emotionalArc?: unknown;
  corePsychologicalIdea?: unknown;
  mainCharacterRole?: unknown;
  keyEvents?: unknown;
  twistOrResolution?: unknown;
  lessonOrTakeaway?: unknown;
  fingerprint?: unknown;
}

/** Minimal runtime validator mirroring the StoryCandidate contract. */
function validateCandidate(raw: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const c = raw as RawCandidate;
  const requiredStrings: (keyof RawCandidate)[] = [
    "title", "hook", "premise", "storyline", "contentType",
    "emotionalArc", "corePsychologicalIdea", "mainCharacterRole",
    "twistOrResolution", "lessonOrTakeaway", "fingerprint",
  ];
  for (const key of requiredStrings) {
    if (typeof c[key] !== "string" || (c[key] as string).length === 0) {
      errors.push(`${key}: expected non-empty string`);
    }
  }
  const validContentTypes = ["fictional_story", "psychology_concept_story", "true_case"];
  if (typeof c.contentType === "string" && !validContentTypes.includes(c.contentType)) {
    errors.push(`contentType: invalid value "${c.contentType}"`);
  }
  if (!Array.isArray(c.keyEvents) || !c.keyEvents.every((e) => typeof e === "string")) {
    errors.push("keyEvents: expected array of strings");
  }
  return { valid: errors.length === 0, errors };
}

export async function run(): Promise<SpikeResult> {
  if (!GEMINI_KEY) {
    return {
      id: "s01",
      name: "Gemini structured JSON generation",
      goal: "Verify Gemini returns valid structured JSON for story candidates.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  const prompt = `Generate 2 story candidates for a short-form video about "the psychology of procrastination".
Each candidate must be a JSON object with exactly these fields:
- title: string
- hook: string (1-2 sentences)
- premise: string
- storyline: string (full story, 100-150 words)
- contentType: one of "fictional_story", "psychology_concept_story", "true_case"
- emotionalArc: string
- corePsychologicalIdea: string
- mainCharacterRole: string
- keyEvents: array of strings (3-6 events)
- twistOrResolution: string
- lessonOrTakeaway: string
- fingerprint: string (a 1-sentence normalized summary of the core story structure)

Return a JSON object: { "candidates": [ ... ] }
Return ONLY valid JSON, no markdown fences, no commentary.`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
  };

  const t0 = performance.now();
  const res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };

  if (!res.ok) {
    const artifact = await writeArtifact("s01", "error.json", JSON.stringify(raw, null, 2));
    return {
      id: "s01",
      name: "Gemini structured JSON generation",
      goal: "Verify Gemini returns valid structured JSON for story candidates.",
      result: "fail",
      measurements: {
        "httpStatus": res.status,
        "latencyMs": latencyMs,
        "errorMessage": raw.error?.message ?? "unknown",
      },
      notes: "Gemini API returned an error.",
      artifactPaths: [artifact],
    };
  }

  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usage = raw.usageMetadata ?? {};

  let parsed: unknown = null;
  let parseError = "";
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parseError = String(e);
  }

  const candidates = (parsed as { candidates?: unknown[] })?.candidates;
  const isArray = Array.isArray(candidates);
  const candidateCount = isArray ? candidates.length : 0;

  let allValid = true;
  const perCandidate: Array<{ index: number; valid: boolean; errors: string[] }> = [];
  if (isArray) {
    candidates.forEach((c, i) => {
      const v = validateCandidate(c);
      perCandidate.push({ index: i, valid: v.valid, errors: v.errors });
      if (!v.valid) allValid = false;
    });
  }

  const artifact = await writeArtifact(
    "s01",
    "response.json",
    JSON.stringify({ raw, parsed, perCandidate }, null, 2),
  );

  return {
    id: "s01",
    name: "Gemini structured JSON generation",
    goal: "Verify Gemini returns valid structured JSON for story candidates.",
    result: allValid && candidateCount > 0 ? "pass" : "fail",
    measurements: {
      "httpStatus": res.status,
      "latencyMs": latencyMs,
      "responseMimeType": "application/json",
      "parseOk": parseError === "",
      "candidateCount": candidateCount,
      "allValid": allValid,
      "promptTokens": usage.promptTokenCount ?? 0,
      "outputTokens": usage.candidatesTokenCount ?? 0,
    },
    notes: allValid && candidateCount > 0
      ? "Gemini returned valid structured JSON conforming to the StoryCandidate schema."
      : `Schema validation failed. Parse error: ${parseError || "none"}.`,
    artifactPaths: [artifact],
  };
}
