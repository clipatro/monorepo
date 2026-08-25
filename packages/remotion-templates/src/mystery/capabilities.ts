/**
 * Mystery namespace capabilities — LLM-facing metadata for component selection.
 *
 * Mystery components are designed for:
 * - True crime, unsolved cases, historical mysteries
 * - Atmospheric, evidence-driven storytelling
 * - Real images that build intrigue without exaggeration
 * - Minimalist visual language — dark, quiet, restrained
 */

import type { StoryIconName } from "../primitives/StoryIcon.tsx";

export type MysteryNarrativeRole =
  | "opening"
  | "question"
  | "evidence"
  | "image-reveal"
  | "quote"
  | "timeline"
  | "location"
  | "statistic"
  | "closing"
  | "outro";

export type MysteryInformationShape =
  | "title"
  | "question"
  | "single-image"
  | "clue-with-image"
  | "quote"
  | "chronology"
  | "location-profile"
  | "single-statistic"
  | "closing-statement";

export type MysteryTone =
  | "mysterious"
  | "investigative"
  | "somber"
  | "unsettling"
  | "reflective"
  | "neutral";

export type MysteryMediaMode =
  | "none"
  | "optional-image"
  | "required-image";

export interface MysteryComponentInputField {
  name: string;
  kind: "string" | "number" | "array" | "image" | "optional";
  required: boolean;
  maxCharacters?: number;
  maxItems?: number;
  description?: string;
}

export interface MysteryComponentCapability {
  slug: string;
  name: string;
  purpose: string;
  narrativeRoles: MysteryNarrativeRole[];
  informationShapes: MysteryInformationShape[];
  tones: MysteryTone[];
  media: MysteryMediaMode;
  inputs: MysteryComponentInputField[];
  textBudget: { min: number; max: number };
  selectionHint: string;
  bestFor: string[];
  avoidWhen: string;
}

export const mysteryComponentCapabilities: MysteryComponentCapability[] = [
  {
    slug: "mystery-title-card",
    name: "Mystery Title Card",
    purpose: "Open the mystery with a quiet, atmospheric title. Optional background image darkened behind the text.",
    narrativeRoles: ["opening"],
    informationShapes: ["title"],
    tones: ["mysterious", "somber", "reflective"],
    media: "optional-image",
    inputs: [
      { name: "title", kind: "string", required: true, maxCharacters: 80, description: "The mystery title" },
      { name: "subtitle", kind: "string", required: false, maxCharacters: 120, description: "A quiet subtitle or tagline" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30, description: "A case file label, e.g. 'CASE 04'" },
      { name: "imageUrl", kind: "image", required: false, description: "Atmospheric background image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 5, max: 200 },
    selectionHint: "Use as the first scene to establish the mystery. Works with or without a background image.",
    bestFor: ["Opening a mystery video", "Setting the tone", "Establishing the case"],
    avoidWhen: "You need to present evidence or data. Use mystery-clue or mystery-statistic instead.",
  },
  {
    slug: "mystery-image-reveal",
    name: "Mystery Image Reveal",
    purpose: "A full-bleed image that builds the mystery. The image carries the weight; a quiet caption appears after.",
    narrativeRoles: ["image-reveal", "evidence"],
    informationShapes: ["single-image"],
    tones: ["mysterious", "investigative", "somber"],
    media: "required-image",
    inputs: [
      { name: "imageUrl", kind: "image", required: true, description: "The mystery image — real, atmospheric" },
      { name: "imageAlt", kind: "string", required: true, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "dark | desaturated | noir | clean" },
      { name: "caption", kind: "string", required: false, maxCharacters: 200, description: "A quiet caption that appears after the image settles" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
    ],
    textBudget: { min: 0, max: 200 },
    selectionHint: "Use when you have a real image that tells the story. Let the image breathe — keep the caption short.",
    bestFor: ["Showing a crime scene", "Revealing a location", "Atmospheric transitions", "Building tension"],
    avoidWhen: "The image is not available or not relevant. Use mystery-question or mystery-clue instead.",
  },
  {
    slug: "mystery-question",
    name: "Mystery Question",
    purpose: "Pose a question to the viewer. Quiet, direct, no exaggeration. The question lingers.",
    narrativeRoles: ["question"],
    informationShapes: ["question"],
    tones: ["mysterious", "investigative", "reflective"],
    media: "none",
    inputs: [
      { name: "question", kind: "string", required: true, maxCharacters: 200, description: "The question — direct, no embellishment" },
      { name: "context", kind: "string", required: false, maxCharacters: 300, description: "A line of context above the question" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
    ],
    textBudget: { min: 10, max: 500 },
    selectionHint: "Use to pose the central question of the mystery or a sub-question at a narrative turning point.",
    bestFor: ["Central mystery question", "Sub-questions", "Narrative pivots", "Engaging the viewer"],
    avoidWhen: "You have evidence to present. Use mystery-clue instead.",
  },
  {
    slug: "mystery-clue",
    name: "Mystery Clue",
    purpose: "Present a piece of evidence with an image. The image is noir-treated; the clue text is quiet and factual.",
    narrativeRoles: ["evidence"],
    informationShapes: ["clue-with-image"],
    tones: ["investigative", "mysterious", "neutral"],
    media: "required-image",
    inputs: [
      { name: "imageUrl", kind: "image", required: true, description: "Evidence image — real, relevant" },
      { name: "imageAlt", kind: "string", required: true, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "noir | dark | desaturated | clean" },
      { name: "clue", kind: "string", required: true, maxCharacters: 250, description: "What this evidence tells us — factual, no speculation" },
      { name: "clueNumber", kind: "string", required: false, maxCharacters: 20, description: "e.g. 'CLUE 03'" },
      { name: "source", kind: "string", required: false, maxCharacters: 80, description: "Where the evidence was found" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
    ],
    textBudget: { min: 20, max: 250 },
    selectionHint: "Use when you have a real image of evidence and a factual observation about it.",
    bestFor: ["Physical evidence", "Document evidence", "Scene photos", "Forensic details"],
    avoidWhen: "You don't have an image. Use mystery-question or mystery-statistic instead.",
  },
  {
    slug: "mystery-timeline",
    name: "Mystery Timeline",
    purpose: "A sparse vertical timeline of key events. Minimal — just dates, titles, and optional details.",
    narrativeRoles: ["timeline"],
    informationShapes: ["chronology"],
    tones: ["investigative", "neutral", "somber"],
    media: "none",
    inputs: [
      { name: "title", kind: "string", required: false, maxCharacters: 80 },
      { name: "events", kind: "array", required: true, maxItems: 6, description: "Array of { date, title, detail? }" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
    ],
    textBudget: { min: 30, max: 600 },
    selectionHint: "Use to show the sequence of events in the mystery. Keep it sparse — 3-5 events maximum.",
    bestFor: ["Sequence of events", "Before/during/after", "Establishing chronology"],
    avoidWhen: "You have more than 6 events. Split into two timelines or use mystery-statistic for key dates.",
  },
  {
    slug: "mystery-quote",
    name: "Mystery Quote",
    purpose: "A quote from someone involved — witness, investigator, journalist. Quiet, italicized, with optional image.",
    narrativeRoles: ["quote"],
    informationShapes: ["quote"],
    tones: ["reflective", "somber", "mysterious"],
    media: "optional-image",
    inputs: [
      { name: "quote", kind: "string", required: true, maxCharacters: 300, description: "The quote — exact, attributed" },
      { name: "speaker", kind: "string", required: true, maxCharacters: 60 },
      { name: "role", kind: "string", required: false, maxCharacters: 80, description: "Speaker's role or relationship" },
      { name: "when", kind: "string", required: false, maxCharacters: 40 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional portrait or scene image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
    ],
    textBudget: { min: 20, max: 300 },
    selectionHint: "Use for a real, attributed quote from someone connected to the mystery.",
    bestFor: ["Witness statements", "Investigator quotes", "Journalist accounts", "Family member testimony"],
    avoidWhen: "The quote is fabricated or unattributed. Mystery content must be factual.",
  },
  {
    slug: "mystery-location",
    name: "Mystery Location",
    purpose: "A place connected to the mystery — with image, coordinates, and what happened there.",
    narrativeRoles: ["location"],
    informationShapes: ["location-profile"],
    tones: ["mysterious", "somber", "investigative"],
    media: "required-image",
    inputs: [
      { name: "place", kind: "string", required: true, maxCharacters: 60 },
      { name: "region", kind: "string", required: false, maxCharacters: 60 },
      { name: "coordinates", kind: "string", required: false, maxCharacters: 40 },
      { name: "significance", kind: "string", required: true, maxCharacters: 300, description: "What happened here" },
      { name: "facts", kind: "array", required: false, maxItems: 4, description: "Array of { label, value }" },
      { name: "imageUrl", kind: "image", required: true, description: "Real image of the location" },
      { name: "imageAlt", kind: "string", required: true, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "dark | desaturated | noir | clean" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
    ],
    textBudget: { min: 30, max: 400 },
    selectionHint: "Use when a specific place is central to the mystery and you have a real image of it.",
    bestFor: ["Crime scenes", "Last known locations", "Discovery sites", "Key geographical features"],
    avoidWhen: "You don't have a real image of the location. Use mystery-question instead.",
  },
  {
    slug: "mystery-statistic",
    name: "Mystery Statistic",
    purpose: "A single number that unsettles. Large, quiet, serif. No chart, no comparison — just the number.",
    narrativeRoles: ["statistic"],
    informationShapes: ["single-statistic"],
    tones: ["unsettling", "somber", "neutral"],
    media: "none",
    inputs: [
      { name: "value", kind: "number", required: true, description: "The number" },
      { name: "prefix", kind: "string", required: false, maxCharacters: 3 },
      { name: "suffix", kind: "string", required: false, maxCharacters: 5 },
      { name: "decimals", kind: "number", required: false },
      { name: "label", kind: "string", required: true, maxCharacters: 80, description: "What the number represents" },
      { name: "context", kind: "string", required: false, maxCharacters: 250, description: "A sentence explaining the number" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
    ],
    textBudget: { min: 10, max: 330 },
    selectionHint: "Use for a single, striking number — casualties, duration, cost, distance. One number, no chart.",
    bestFor: ["Casualty counts", "Time elapsed", "Search areas", "Cost of investigations", "Distances"],
    avoidWhen: "You need to compare multiple values. Use mystery-timeline or a documentary chart component instead.",
  },
  {
    slug: "mystery-ending",
    name: "Mystery Ending",
    purpose: "A closing statement that lingers. Not a resolution — an open thought. Ends with a single accent dot.",
    narrativeRoles: ["closing"],
    informationShapes: ["closing-statement"],
    tones: ["reflective", "somber", "mysterious"],
    media: "none",
    inputs: [
      { name: "statement", kind: "string", required: true, maxCharacters: 250, description: "The closing thought — not a resolution" },
      { name: "openQuestion", kind: "string", required: false, maxCharacters: 200, description: "An open question to leave the viewer with" },
      { name: "caseLabel", kind: "string", required: false, maxCharacters: 30 },
    ],
    textBudget: { min: 20, max: 450 },
    selectionHint: "Use as the final content scene. Leave the mystery open — don't resolve it unless it's truly solved.",
    bestFor: ["Closing a mystery video", "Leaving questions open", "Reflecting on the case"],
    avoidWhen: "This is not the last scene. Use mystery-question for mid-video questions.",
  },
  {
    slug: "mystery-end-card",
    name: "Mystery End Card",
    purpose: "The final card. A single dot and 'End of file'. Nothing else.",
    narrativeRoles: ["outro"],
    informationShapes: ["title"],
    tones: ["neutral", "somber"],
    media: "none",
    inputs: [],
    textBudget: { min: 0, max: 0 },
    selectionHint: "Always use as the very last scene. No data needed.",
    bestFor: ["Closing the video"],
    avoidWhen: "Never — this should always be the final scene.",
  },
];

export function getMysteryComponentCapability(slug: string): MysteryComponentCapability | undefined {
  return mysteryComponentCapabilities.find((c) => c.slug === slug);
}

// ─── LLM catalog (JSON-safe) ─────────────────────────────────────────────────

export interface MysteryCatalogComponent {
  slug: string;
  name: string;
  purpose: string;
  narrativeRoles: MysteryNarrativeRole[];
  informationShapes: MysteryInformationShape[];
  tones: MysteryTone[];
  media: MysteryMediaMode;
  inputs: Array<{
    name: string;
    kind: "string" | "number" | "array" | "image" | "optional";
    required: boolean;
    max?: number;
  }>;
  textBudget: { min: number; max: number };
  selectionHint: string;
}

export function getMysteryLlmCatalog(): { components: MysteryCatalogComponent[] } {
  return {
    components: mysteryComponentCapabilities.map((c) => ({
      slug: c.slug,
      name: c.name,
      purpose: c.purpose,
      narrativeRoles: c.narrativeRoles,
      informationShapes: c.informationShapes,
      tones: c.tones,
      media: c.media,
      inputs: c.inputs.map((i) => ({
        name: i.name,
        kind: i.kind,
        required: i.required,
        max: i.maxCharacters ?? i.maxItems,
      })),
      textBudget: c.textBudget,
      selectionHint: c.selectionHint,
    })),
  };
}

// ─── Recommendation ──────────────────────────────────────────────────────────

export interface MysterySelectionQuery {
  narrativeRole?: MysteryNarrativeRole;
  informationShape?: MysteryInformationShape;
  tone?: MysteryTone;
  availableImages?: number;
}

export function recommendMysteryComponents(query: MysterySelectionQuery): MysteryComponentCapability[] {
  return mysteryComponentCapabilities
    .filter((c) => {
      if (query.narrativeRole && !c.narrativeRoles.includes(query.narrativeRole)) return false;
      if (query.informationShape && !c.informationShapes.includes(query.informationShape)) return false;
      if (query.tone && !c.tones.includes(query.tone)) return false;
      if (query.availableImages !== undefined) {
        if (c.media === "required-image" && query.availableImages < 1) return false;
      }
      return true;
    })
    .sort((a, b) => b.narrativeRoles.length - a.narrativeRoles.length);
}
