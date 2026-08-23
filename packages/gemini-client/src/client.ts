/**
 * GeminiClient — thin wrapper around the Gemini REST API.
 *
 * Handles:
 * - Structured JSON generation (responseMimeType: application/json)
 * - Grounding with Google Search (tools: [{ google_search: {} }])
 * - Cost tracking (checkBudget before, calculateCost + recordCost after)
 * - JSON extraction from mixed text output (markdown fences, prose)
 * - Error handling with ProviderError
 * - Dry-run mode: when DRY_RUN=true, returns placeholder data instead of
 *   calling the real API (saves the Gemini bill during testing)
 */

import { ProviderError, type LlmClient, type LlmCallOptions, type LlmCallResult } from "@automation/contracts";
import { checkBudget, calculateCost, recordCost, type CostBreakdown } from "@automation/cost-tracker";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini-specific call options (alias for LlmCallOptions).
 * Kept for backwards compatibility — new code should use LlmCallOptions.
 */
export interface GeminiCallOptions extends LlmCallOptions {}

/**
 * Gemini-specific call result (alias for LlmCallResult).
 * Kept for backwards compatibility — new code should use LlmCallResult.
 */
export interface GeminiCallResult extends LlmCallResult {}

// === Dry-run flag: read once from env, shared across all GeminiClient instances ===

import { isDryRun } from "@automation/contracts";

function readDryRunFlag(): boolean {
  return isDryRun();
}

export class GeminiClient implements LlmClient {
  private apiKey: string;
  private dryRun: boolean;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.dryRun = readDryRunFlag();
    if (!this.apiKey && !this.dryRun) {
      console.warn("[gemini-client] GEMINI_API_KEY not set — Gemini calls will fail");
    }
    if (this.dryRun) {
      console.log("[gemini-client] DRY-RUN mode active — all Gemini calls return placeholder data (no API cost)");
    }
  }

  /** Returns true if dry-run mode is active. */
  isDryRun(): boolean {
    return this.dryRun;
  }

  /** Execute a Gemini generateContent call with cost tracking. */
  async call(options: LlmCallOptions): Promise<LlmCallResult> {
    // === Dry-run mode: return dummy data without hitting the API ===
    if (this.dryRun) {
      return dryRunCall(options);
    }

    if (!this.apiKey) {
      throw new ProviderError("GEMINI_API_KEY not set", "gemini", options.model, undefined, false);
    }

    // Check budget before the call
    // Use a conservative estimate for text calls
    const estimatedCost = 0.01;
    try {
      checkBudget(estimatedCost, { runId: options.runId });
    } catch (err) {
      throw new ProviderError(
        `Budget exceeded: ${err instanceof Error ? err.message : "unknown"}`,
        "gemini", options.model, err, false,
      );
    }

    // Build the request body
    const contents = [{ role: "user", parts: [{ text: options.prompt }] }];
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.8,
        maxOutputTokens: options.maxOutputTokens ?? 4096,
      },
    };

    if (options.systemInstruction) {
      body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
    }

    if (options.useGrounding) {
      body.tools = [{ google_search: {} }];
      // google_search is incompatible with responseMimeType
    } else if (options.responseJson !== false) {
      (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
    }

    const t0 = performance.now();
    const res = await fetch(
      `${API_BASE}/models/${options.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const latencyMs = Math.round(performance.now() - t0);

    const raw = await res.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          webSearchQueries?: string[];
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
      error?: { message?: string; status?: string };
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    if (!res.ok) {
      const msg = raw.error?.message ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status === 503;
      throw new ProviderError(msg, "gemini", options.model, raw.error, retryable);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = raw.usageMetadata ?? {};
    const groundingMeta = raw.candidates?.[0]?.groundingMetadata;

    // Parse JSON from text
    let json: unknown | null = null;
    if (options.responseJson !== false || options.useGrounding) {
      json = extractJson(text);
    }

    // Calculate cost
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const groundingQueries = groundingMeta?.webSearchQueries?.length ?? 0;

    const cost = calculateCost({
      model: options.model,
      inputTokens,
      outputTokens,
      groundingQueries,
    });

    // Record cost
    recordCost(cost, {
      runId: options.runId,
      stepId: options.stepId,
      capability: options.capability,
      inputTokens,
      outputTokens,
      groundingQueries,
      notes: `latency=${latencyMs}ms`,
    });

    return {
      text,
      json,
      usage: {
        promptTokens: inputTokens,
        outputTokens,
        totalTokens: usage.totalTokenCount ?? 0,
      },
      grounding: groundingMeta ? {
        searchQueries: groundingMeta.webSearchQueries ?? [],
        chunks: (groundingMeta.groundingChunks ?? []).map((c) => ({
          uri: c.web?.uri,
          title: c.web?.title,
        })),
      } : undefined,
      cost,
    };
  }
}

// === Dry-run implementation ===

/**
 * Return dummy data for a Gemini call based on the capability.
 * The dummy data is structured to match what the real API would return
 * so the pipeline can flow end-to-end without errors.
 */
async function dryRunCall(options: LlmCallOptions): Promise<LlmCallResult> {
  const dummyText = JSON.stringify(generateDummyResponse(options), null, 2);
  const dummyUsage = {
    promptTokens: Math.min(Math.ceil(options.prompt.length / 4), 500),
    outputTokens: Math.min(Math.ceil(dummyText.length / 4), 1000),
    totalTokens: Math.min(Math.ceil((options.prompt.length + dummyText.length) / 4), 1500),
  };

  // Zero-cost in dry-run mode — use calculateCost to get a valid CostBreakdown, then zero it
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

  // Record a zero-cost entry so the cost ledger shows dry-run activity
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
    grounding: options.useGrounding ? {
      searchQueries: [`dry-run query: ${options.capability}`],
      chunks: [{ uri: "https://example.com/dry-run-source", title: "Dry-Run Source" }],
    } : undefined,
    cost,
    remoteRequestId: `dry-run-${Date.now()}`,
    dryRun: true,
  };
}

/**
 * Generate a contextually-appropriate dummy response based on the capability.
 * This ensures the pipeline can flow end-to-end in dry-run mode.
 */
function generateDummyResponse(options: LlmCallOptions): unknown {
  const cap = options.capability;

  // Story classification
  if (cap === "story.classify") {
    return {
      contentType: "fictional_story",
      reasoning: "Dry-run: classified as fictional_story (dummy response).",
    };
  }

  // Story candidate generation
  if (cap === "story.generate") {
    return {
      candidates: [
        {
          title: "The Quiet Witness (Dry-Run)",
          hook: "She noticed what everyone else missed.",
          premise: "A quiet observer discovers a hidden truth about her small town.",
          storyline: "In a sleepy coastal town, a young woman working at the local diner notices patterns others overlook. When a stranger arrives asking questions about a decades-old disappearance, she realizes her observations might hold the key to solving the mystery. As she pieces together fragments of memory and overheard conversations, she uncovers a connection that changes everything she thought she knew about her community.",
          contentType: "fictional_story",
          emotionalArc: "Curiosity → Suspicion → Revelation → Bittersweet understanding",
          corePsychologicalIdea: "The bystander effect and how observation without action shapes identity",
          mainCharacterRole: "Observer / Protagonist",
          keyEvents: [
            "Notices the stranger asking questions at the diner",
            "Overhears a conversation about the old disappearance",
            "Finds a faded photograph in the town archive",
            "Confronts a longtime resident with her discovery",
          ],
          twistOrResolution: "The disappearance was voluntary — the person left to protect someone they loved",
          lessonOrTakeaway: "Sometimes the most important thing we can do is simply pay attention",
          fingerprint: "A quiet observer in a small town uncovers a decades-old secret about a disappearance",
          sourceReferences: [],
        },
        {
          title: "The Weight of Silence (Dry-Run)",
          hook: "He hadn't spoken in three years. Then he said one word.",
          premise: "A selectively mute child breaks his silence at a critical moment.",
          storyline: "After a traumatic event, a young boy stops speaking entirely. His parents try everything — therapists, specialists, new schools. Then one day during a crisis, he utters a single word that changes the trajectory of his family's life and reveals what he's been carrying all along.",
          contentType: "fictional_story",
          emotionalArc: "Concern → Frustration → Breakthrough → Healing",
          corePsychologicalIdea: "Selective mutism as a trauma response and the power of timing in communication",
          mainCharacterRole: "Child / Protagonist",
          keyEvents: [
            "Stops speaking after the traumatic event",
            "Parents try increasingly desperate interventions",
            "A crisis occurs at home",
            "He speaks one word that reframes everything",
          ],
          twistOrResolution: "The word he finally says is the name of someone he lost — acknowledging the grief he couldn't express",
          lessonOrTakeaway: "Healing happens on its own timeline, not ours",
          fingerprint: "A mute child breaks silence during a crisis, revealing unprocessed grief",
          sourceReferences: [],
        },
        {
          title: "The Map She Never Finished (Dry-Run)",
          hook: "Her grandmother left her a map with one missing piece.",
          premise: "A woman inherits an incomplete hand-drawn map and must retrace her grandmother's steps.",
          storyline: "When her grandmother passes, a woman discovers a hand-drawn map among the belongings — but the final destination is missing. Following the clues through places her grandmother visited decades ago, she uncovers a story of love, sacrifice, and a choice that defined her family's future.",
          contentType: "fictional_story",
          emotionalArc: "Grief → Curiosity → Discovery → Acceptance",
          corePsychologicalIdea: "Intergenerational secrets and how unfinished stories shape family identity",
          mainCharacterRole: "Granddaughter / Protagonist",
          keyEvents: [
            "Finds the incomplete map in her grandmother's belongings",
            "Visits the first marked location — a coastal village",
            "Meets someone who remembers her grandmother",
            "Discovers the missing destination was a place of farewell",
          ],
          twistOrResolution: "The map's missing piece points to a place where her grandmother said goodbye to her first love",
          lessonOrTakeaway: "Some maps lead us not to destinations, but to understanding",
          fingerprint: "A woman follows her deceased grandmother's incomplete map to uncover a family secret",
          sourceReferences: [],
        },
      ],
    };
  }

  // Story DNA extraction
  if (cap === "story.dna") {
    return {
      protagonistArchetype: "The Observer",
      protagonistGoal: "To understand what others overlook",
      incitingIncident: "A stranger arrives asking questions about the past",
      centralConflict: "Truth vs. community harmony",
      mainObstacle: "No one wants to talk about the old disappearance",
      reversalOrTwist: "The disappearance was voluntary, not a crime",
      resolution: "She shares her discovery and the town confronts its past",
      psychologicalMechanism: "Bystander effect and observational learning",
      lesson: "Attention is the quietest form of courage",
      setting: "Small coastal town, present day",
    };
  }

  // Duplicate detection adjudication
  if (cap === "story.adjudicate") {
    return {
      sharedPremise: "Both involve quiet observers uncovering secrets",
      sharedEventSequence: "Similar inciting incident but different resolutions",
      sharedTwist: "Different twists — one is voluntary disappearance, other is grief expression",
      meaningfulDifferences: "Different settings, characters, and emotional arcs",
      finalClassification: "original",
    };
  }

  // Research grounding
  if (cap === "research.grounding") {
    return `Dry-run research results for topic.

Based on the search, here are the key findings:

1. Source: "Understanding the Psychology of Observation" (example.com)
   Excerpt: Research shows that observational awareness plays a crucial role in community dynamics.

2. Source: "The Bystander Effect in Small Communities" (example.com)
   Excerpt: Studies indicate that in close-knit communities, people often notice more but act less.

3. Source: "Memory and Place Attachment" (example.com)
   Excerpt: Place-based memory shapes how communities process historical events.

Key findings:
- Observational awareness is a documented psychological phenomenon
- Small communities show unique patterns of collective memory
- The bystander effect manifests differently in close-knit populations

Uncertainties:
- Limited longitudinal data on small-town observation patterns
- Individual vs. community-level effects are hard to separate

Safe facts:
- The bystander effect is a well-documented psychological concept
- Place attachment influences memory formation
- Community dynamics affect information flow

Warnings:
- Avoid making specific claims about real communities without verification`;
  }

  // Research structuring
  if (cap === "research.structure") {
    return {
      sources: [
        { id: "s1", title: "Understanding the Psychology of Observation", url: "https://example.com/observation", excerpt: "Research shows that observational awareness plays a crucial role in community dynamics." },
        { id: "s2", title: "The Bystander Effect in Small Communities", url: "https://example.com/bystander", excerpt: "Studies indicate that in close-knit communities, people often notice more but act less." },
        { id: "s3", title: "Memory and Place Attachment", url: "https://example.com/memory", excerpt: "Place-based memory shapes how communities process historical events." },
      ],
      claims: [
        { id: "c1", claim: "The bystander effect is a well-documented psychological phenomenon", sourceIds: ["s1", "s2"], confidence: "high" },
        { id: "c2", claim: "Small communities show unique patterns of collective memory", sourceIds: ["s3"], confidence: "medium" },
        { id: "c3", claim: "Community dynamics affect information flow", sourceIds: ["s2", "s3"], confidence: "medium" },
      ],
      uncertainties: [
        "Limited longitudinal data on small-town observation patterns",
        "Individual vs. community-level effects are hard to separate",
      ],
      allowedFacts: [
        "The bystander effect is a well-documented psychological concept",
        "Place attachment influences memory formation",
        "Community dynamics affect information flow",
      ],
      warnings: [
        "Avoid making specific claims about real communities without verification",
      ],
    };
  }

  // Scene planning
  if (cap === "image.scene_plan") {
    return {
      scenes: [
        {
          order: 1,
          storyPurpose: "Establish the setting and the protagonist's quiet life",
          narrationText: "In a sleepy coastal town where everyone knows everyone, she worked the morning shift at the only diner on Main Street. She noticed things. The way regulars held their coffee cups. Who came in agitated. Who avoided eye contact.",
          visualEvent: "A woman serves coffee in a quiet diner, observing customers",
          characterRole: "protagonist",
          poseAndExpression: "Standing behind counter, alert but calm expression",
          environment: "Small-town diner, morning light through windows",
          cameraFraming: "Medium shot, establishing the diner space",
          lightingAndMood: "Warm morning light, peaceful but slightly melancholic",
          expectedDurationSeconds: 7,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Standing behind counter, alert but calm expression" },
          ],
        },
        {
          order: 2,
          storyPurpose: "Inciting incident — the stranger arrives",
          narrationText: "Then one Tuesday, a stranger walked in. He didn't order. He just asked questions about someone who disappeared from town thirty years ago. Nobody wanted to talk about it. But she remembered the name.",
          visualEvent: "A stranger enters the diner and asks questions",
          characterRole: "protagonist",
          poseAndExpression: "Leaning forward, listening intently",
          environment: "Diner interior, the stranger seated at the counter",
          cameraFraming: "Over-the-shoulder shot from protagonist's perspective",
          lightingAndMood: "Slightly darker, tension building",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Leaning forward, listening intently" },
            { name: "George", roleInScene: "supporting", poseAndExpression: "Seated at counter, serious and inquiring" },
          ],
        },
        {
          order: 3,
          storyPurpose: "Investigation — finding the photograph",
          narrationText: "She started digging. The town archive had boxes nobody had opened in years. And there, between old newspapers and faded menus, she found a photograph. Three people on a dock. One of them was the man who disappeared.",
          visualEvent: "Searching through old boxes in an archive room, finding a photograph",
          characterRole: "protagonist",
          poseAndExpression: "Holding a photograph, expression of discovery",
          environment: "Dim archive room with shelves of old boxes",
          cameraFraming: "Close-up on the photograph, then pull back to protagonist",
          lightingAndMood: "Dusty light, sense of uncovering something hidden",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Holding a photograph, expression of discovery" },
          ],
        },
        {
          order: 4,
          storyPurpose: "Confrontation and twist",
          narrationText: "She brought the photo to the oldest resident in town. He looked at it for a long time. Then he said something she never expected. 'He didn't disappear. He left. And he left because he loved someone enough to let go.'",
          visualEvent: "Conversation with an elderly resident, showing the photograph",
          characterRole: "protagonist",
          poseAndExpression: "Sitting across from an old man, expression shifting from determination to understanding",
          environment: "A porch or living room of an old house",
          cameraFraming: "Two-shot, both characters in frame",
          lightingAndMood: "Golden afternoon light, emotional weight",
          expectedDurationSeconds: 9,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Sitting across from an old man, expression shifting from determination to understanding" },
            { name: "Noah", roleInScene: "supporting", poseAndExpression: "Sitting in chair, looking at photograph with deep emotion" },
          ],
        },
        {
          order: 5,
          storyPurpose: "Resolution and takeaway",
          narrationText: "Sometimes the most important thing we can do is simply pay attention. Not act. Not solve. Just notice. Because the things people carry — the things they can't say — they're visible, if you're quiet enough to see them.",
          visualEvent: "The protagonist back at the diner, looking out the window thoughtfully",
          characterRole: "protagonist",
          poseAndExpression: "Looking out window, contemplative, at peace",
          environment: "Diner, late afternoon light",
          cameraFraming: "Wide shot, protagonist framed by the window",
          lightingAndMood: "Warm golden hour, reflective and bittersweet",
          expectedDurationSeconds: 8,
          imageRequirement: "character_scene",
          sourceClaimIds: [],
          characters: [
            { name: "Emily", roleInScene: "protagonist", poseAndExpression: "Looking out window, contemplative, at peace" },
          ],
        },
      ],
    };
  }

  // Default: return a generic dummy JSON object
  return {
    dryRun: true,
    capability: cap,
    message: "Dry-run dummy response — no real Gemini API call was made.",
    model: options.model,
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
