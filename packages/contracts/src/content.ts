/**
 * Content-type classification for a run.
 * Determines whether research, source, and dramatization checks are mandatory.
 *
 * D015: Expanded from 3 to 10 predefined types. Channels enable/disable which
 * types they allow via the `content_types` JSON column. The ContentTypeRegistry
 * holds behavior flags for each type.
 */
export type ContentType =
  | "fictional_story"
  | "psychology_concept_story"
  | "true_case"
  | "educational_explainer"
  | "listicle"
  | "commentary"
  | "historical_event"
  | "motivational"
  | "tutorial"
  | "documentary_style";

/**
 * Behavior flags that drive pipeline behavior for each content type.
 * - requiresResearch: whether the research step runs (grounding/evidence gathering)
 * - requiresEvidence: whether sourced claims are mandatory in the story
 * - allowsDramatization: whether fictional dramatization is permitted
 * - characterRole: what role channel characters may play (affects scene planner)
 */
export interface ContentTypeBehavior {
  requiresResearch: boolean;
  requiresEvidence: boolean;
  allowsDramatization: boolean;
  /** "protagonist" | "supporting_only" | "none" — what role characters may play */
  characterRole: "protagonist" | "supporting_only" | "none";
  /** Human-readable label for UI dropdowns */
  label: string;
  /** Short description for UI tooltips */
  description: string;
}

/**
 * Registry of all known content types and their behavior flags.
 * Used by the research handler, story generation, scene planner, and UI.
 */
export const CONTENT_TYPE_REGISTRY: Record<ContentType, ContentTypeBehavior> = {
  fictional_story: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: true,
    characterRole: "protagonist",
    label: "Fictional Story",
    description: "Invented, hypothetical, or dramatized narrative.",
  },
  psychology_concept_story: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: true,
    characterRole: "protagonist",
    label: "Psychology Concept Story",
    description: "Explain a psychological mechanism through a relatable scenario.",
  },
  true_case: {
    requiresResearch: true,
    requiresEvidence: true,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "True Case",
    description: "Real person, event, study, or documented case requiring evidence.",
  },
  educational_explainer: {
    requiresResearch: true,
    requiresEvidence: true,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "Educational Explainer",
    description: "Teach a concept with factual grounding and clear examples.",
  },
  listicle: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "Listicle",
    description: "Numbered list of items, signs, tips, or examples.",
  },
  commentary: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "Commentary",
    description: "Opinion or analysis on a topic, trend, or event.",
  },
  historical_event: {
    requiresResearch: true,
    requiresEvidence: true,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "Historical Event",
    description: "Recount a documented historical incident with evidence.",
  },
  motivational: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: true,
    characterRole: "protagonist",
    label: "Motivational",
    description: "Inspirational narrative with an emotional arc and takeaway.",
  },
  tutorial: {
    requiresResearch: false,
    requiresEvidence: false,
    allowsDramatization: false,
    characterRole: "none",
    label: "Tutorial",
    description: "Step-by-step how-to guide for a specific skill or task.",
  },
  documentary_style: {
    requiresResearch: true,
    requiresEvidence: true,
    allowsDramatization: false,
    characterRole: "supporting_only",
    label: "Documentary Style",
    description: "Factual documentary-style narration with sourced claims.",
  },
};

/** All known content type values (for validation). */
export const KNOWN_CONTENT_TYPES = Object.keys(CONTENT_TYPE_REGISTRY) as ContentType[];

/** Default content types for new channels. */
export const DEFAULT_CONTENT_TYPES: ContentType[] = [
  "fictional_story",
  "psychology_concept_story",
  "true_case",
];

/**
 * Look up behavior flags for a content type. Falls back to fictional_story
 * for unknown types (backward compatibility).
 */
export function getContentTypeBehavior(type: string): ContentTypeBehavior {
  return CONTENT_TYPE_REGISTRY[type as ContentType] ?? CONTENT_TYPE_REGISTRY.fictional_story;
}

/** Check if a content type requires the research step. */
export function requiresResearch(type: string): boolean {
  return getContentTypeBehavior(type).requiresResearch;
}

/** Check if a content type requires sourced evidence. */
export function requiresEvidence(type: string): boolean {
  return getContentTypeBehavior(type).requiresEvidence;
}

/** Check if a content type allows fictional dramatization. */
export function allowsDramatization(type: string): boolean {
  return getContentTypeBehavior(type).allowsDramatization;
}

// === Story Concept (D014 — classification as concept director) ===

/**
 * The output of the classification step when it acts as the concept director.
 * This is the single source of truth for character selection and creative
 * direction that all downstream steps (story generation, scene planning,
 * image generation) follow.
 */
export interface StoryConcept {
  contentType: ContentType;
  /** Whether the story needs any characters at all (false for pure explainers). */
  needsCharacters: boolean;
  /** "none" | "single" | "multi" — how many characters are involved. */
  characterMode: "none" | "single" | "multi";
  /** Selected characters from the channel roster. */
  characters: Array<{
    name: string;
    existingCharacterId: string | null;
    roleInStory: string;
  }>;
  /** New characters to create (not in the roster yet). */
  newCharacters: Array<{
    name: string;
    bible: Record<string, unknown>;
    roleInStory: string;
  }>;
  /** Concise summary of the story angle, emotional tone, and character dynamics. */
  creativeDirection: string;
  /** Brief explanation of why these characters were chosen / why new ones are needed. */
  reasoning: string;
}

/** A structured story candidate produced by the story generator. */
export interface StoryCandidate {
  title: string;
  hook: string;
  premise: string;
  storyline: string;
  contentType: ContentType;
  emotionalArc: string;
  corePsychologicalIdea: string;
  mainCharacterRole: string;
  keyEvents: string[];
  twistOrResolution: string;
  lessonOrTakeaway: string;
  /** Normalized story fingerprint for duplicate detection. */
  fingerprint: string;
  /** Source references where applicable (true-case / psychology content). */
  sourceReferences?: string[];
  /** Character assignments — which existing characters are used in this story. */
  characters?: Array<{
    name: string;
    existingCharacterId: string | null;
    roleInStory: string;
  }>;
  /** New characters proposed by the LLM — to be auto-created on story approval. */
  newCharacters?: Array<{
    name: string;
    bible: Record<string, unknown>;
    roleInStory: string;
  }>;
}

/** Input to the story generator facade. */
export interface StoryGenerationInput {
  channel: string;
  topic: string;
  contentType?: ContentType;
  targetDurationSeconds?: number;
  emotionalDirection?: string;
  requiredIdeas?: string[];
  forbiddenIdeas?: string[];
  /** Concise "avoid repeating" context from novelty retrieval. */
  noveltyContext?: string;
  /** Number of candidates to generate. */
  candidateCount?: number;
  /** Optional storyline — when provided, the story is built around this storyline. */
  storyline?: string;
}

/** Output of the story generator facade. */
export interface StoryGenerationOutput {
  candidates: StoryCandidate[];
}
