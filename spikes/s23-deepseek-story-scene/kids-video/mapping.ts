/**
 * S23 kids video — scene plan → kids component mapping.
 *
 * Maps each ScenePlanItem from the DeepSeek story+scene stage to a kids
 * namespace Remotion component (slug + typed data payload). The mapping is
 * rule-based, using the scene's storyPurpose, imageRequirement, and order
 * to pick the most appropriate kids component.
 *
 * Rules:
 *  - First scene  → kids-title-card (opening)
 *  - Last scene   → kids-end-card (outro CTA)
 *  - Second-to-last → kids-ending (warm closing message)
 *  - Scenes with a question in storyPurpose or narrationText → kids-question
 *  - Scenes with "fact" / "did you know" in purpose → kids-fun-fact
 *  - Scenes with a number/stat in narration → kids-number-stat
 *  - Scenes with "quote" in purpose → kids-quote
 *  - Scenes with "list" / "top" / "steps" / "timeline" → kids-top-list or kids-timeline
 *  - Default (image-bearing) → kids-image-reveal
 *
 * The data payload is built from the scene's narrationText, visualEvent,
 * environment, and characters, adapted to the chosen component's data shape.
 */

import type { ScenePlanItem } from "../types.ts";

// === Kids component slugs (must match kids/capabilities.ts) ===

export type KidsComponentSlug =
  | "kids-title-card"
  | "kids-image-reveal"
  | "kids-question"
  | "kids-fun-fact"
  | "kids-number-stat"
  | "kids-timeline"
  | "kids-quote"
  | "kids-top-list"
  | "kids-ending"
  | "kids-end-card";

// === Mapped scene (output of the mapping stage) ===

export interface MappedKidsScene {
  /** Original scene order from the scene plan. */
  order: number;
  /** Chosen kids component slug. */
  componentSlug: KidsComponentSlug;
  /** Typed data payload for the chosen component. */
  data: Record<string, unknown>;
  /** Narration segment for this scene (concatenated to form full narration). */
  narrationSegment: string;
  /** Whether this scene needs an image. */
  needsImage: boolean;
  /** Image search query for sourcing (Wikipedia/Gemini). */
  imageQuery?: string;
  /** Image treatment for the kids canvas. */
  imageTreatment?: "bright" | "vivid" | "soft" | "clean";
  /** Estimated duration in seconds (from the scene plan). */
  estimatedDurationSeconds: number;
}

// === Helpers ===

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function extractFirstNumber(text: string): number | null {
  // Match numbers with optional commas/decimals, e.g. "1,200" or "3.5" or "42"
  const match = text.match(/\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\b/);
  if (!match?.[1]) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // Cut at word boundary
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > 0 ? lastSpace : max).trim() + "…";
}

// === Main mapping function ===

/**
 * Map an array of ScenePlanItem to MappedKidsScene[]. The first scene becomes
 * the title card, the last becomes the end card, and the second-to-last
 * becomes the ending. Middle scenes are mapped by content heuristics.
 */
export function mapScenesToKidsComponents(
  scenes: ScenePlanItem[],
  videoTitle: string,
  channelName: string,
): MappedKidsScene[] {
  if (scenes.length === 0) return [];

  const mapped: MappedKidsScene[] = [];
  const lastIndex = scenes.length - 1;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const isFirst = i === 0;
    const isLast = i === lastIndex;
    const isSecondToLast = i === lastIndex - 1 && scenes.length > 2;

    const purpose = scene.storyPurpose;
    const narration = scene.narrationText;
    const combined = `${purpose} ${narration}`;

    // Default image query from the visual event + environment
    const imageQuery = scene.visualEvent
      ? `${scene.environment} ${scene.visualEvent}`.slice(0, 120)
      : scene.environment.slice(0, 120);

    const needsImage = scene.imageRequirement === "character_scene" || isFirst || isLast;
    const imageTreatment: "bright" | "vivid" | "soft" | "clean" = "bright";

    let slug: KidsComponentSlug;
    let data: Record<string, unknown>;

    if (isFirst) {
      // Opening title card
      slug = "kids-title-card";
      data = {
        title: truncate(videoTitle, 60),
        subtitle: truncate(scene.narrationText, 100),
        hook: truncate(scene.narrationText, 120),
        label: "FUN STORY!",
      };
    } else if (isLast) {
      // Outro end card
      slug = "kids-end-card";
      data = {
        cta: "Subscribe for more fun!",
        channelName,
        finalQuestion: truncate(scene.narrationText, 120),
      };
    } else if (isSecondToLast) {
      // Warm closing message
      slug = "kids-ending";
      data = {
        message: truncate(scene.narrationText, 200),
        encouragement: "What do YOU think?",
        label: "REMEMBER!",
      };
    } else if (hasKeyword(combined, ["did you know", "fun fact", "fact:"])) {
      slug = "kids-fun-fact";
      data = {
        fact: truncate(narration, 200),
        highlight: "Did you know?",
        label: "FUN FACT!",
      };
    } else if (hasKeyword(combined, ["?"]) && hasKeyword(combined, ["question", "wonder", "what if", "why", "how come"])) {
      slug = "kids-question";
      data = {
        question: truncate(narration, 150),
        context: truncate(purpose, 250),
        label: "QUESTION!",
      };
    } else if (hasKeyword(combined, ["quote", "said", "once said"])) {
      slug = "kids-quote";
      // Try to extract a speaker from the characters array
      const speaker = scene.characters?.[0]?.name ?? "A wise person";
      data = {
        quote: truncate(narration, 250),
        speaker,
        role: scene.characters?.[0]?.roleInScene ?? "",
      };
    } else if (hasKeyword(combined, ["top", "list", "ranked", "biggest", "fastest", "tallest"])) {
      // Build a simple top-list from the key events if available, else from narration
      const items = scene.characters && scene.characters.length > 1
        ? scene.characters.slice(0, 5).map((c, idx) => ({
            rank: idx + 1,
            title: c.name,
            detail: c.roleInScene,
          }))
        : [{
            rank: 1,
            title: truncate(narration, 60),
            detail: "",
          }];
      slug = "kids-top-list";
      data = {
        title: truncate(purpose, 60),
        items,
        label: "TOP LIST!",
      };
    } else if (hasKeyword(combined, ["step", "timeline", "sequence", "first", "then", "next", "finally"])) {
      // Build steps from narration — split on sentence boundaries
      const sentences = narration.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).slice(0, 5);
      const steps = sentences.map((s, idx) => ({
        label: `Step ${idx + 1}`,
        title: truncate(s, 80),
      }));
      slug = "kids-timeline";
      data = {
        title: truncate(purpose, 60),
        steps: steps.length > 0 ? steps : [{ label: "Step 1", title: truncate(narration, 80) }],
        label2: "STEPS!",
      };
    } else {
      // Check for a number stat
      const num = extractFirstNumber(narration);
      if (num !== null && num > 0 && hasKeyword(combined, ["number", "count", "size", "distance", "speed", "age", "years", "times", "feet", "meters", "miles"])) {
        slug = "kids-number-stat";
        data = {
          value: num,
          label: truncate(purpose, 60),
          context: truncate(narration, 200),
          label2: "WOW!",
        };
      } else {
        // Default: image reveal with caption
        slug = "kids-image-reveal";
        data = {
          caption: truncate(narration, 180),
          label: truncate(purpose, 30),
        };
      }
    }

    mapped.push({
      order: scene.order,
      componentSlug: slug,
      data,
      narrationSegment: narration,
      needsImage,
      imageQuery: needsImage ? imageQuery : undefined,
      imageTreatment,
      estimatedDurationSeconds: scene.expectedDurationSeconds,
    });
  }

  return mapped;
}

// === Narration assembly ===

/**
 * Concatenate narration segments from all mapped scenes (excluding the title
 * card's hook which is part of the opening, and the end card which is a CTA).
 * The title card and end card narration are included as they contain the
 * hook and closing words.
 */
export function assembleFullNarration(mapped: MappedKidsScene[]): string {
  return mapped
    .map((s) => s.narrationSegment)
    .filter((s) => s.trim().length > 0)
    .join(" ");
}
