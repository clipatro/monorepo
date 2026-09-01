/**
 * Kids namespace capabilities — LLM-facing metadata for component selection.
 *
 * Kids components are designed for:
 * - Children's educational and entertainment content
 * - Bright, playful, energetic storytelling
 * - Simple language, big numbers, fun facts, top lists
 * - Curious questions that engage young viewers
 * - Warm, positive, encouraging tone
 */

export type KidsNarrativeRole =
  | "opening"
  | "question"
  | "fun-fact"
  | "image-reveal"
  | "quote"
  | "timeline"
  | "statistic"
  | "top-list"
  | "closing"
  | "outro";

export type KidsInformationShape =
  | "title"
  | "question"
  | "single-image"
  | "fact-with-image"
  | "quote"
  | "steps"
  | "single-statistic"
  | "ranked-list"
  | "closing-message";

export type KidsTone =
  | "playful"
  | "curious"
  | "excited"
  | "warm"
  | "encouraging"
  | "energetic";

export type KidsMediaMode =
  | "none"
  | "optional-image"
  | "required-image";

export interface KidsComponentInputField {
  name: string;
  kind: "string" | "number" | "array" | "image" | "optional";
  required: boolean;
  maxCharacters?: number;
  maxItems?: number;
  description?: string;
}

export interface KidsComponentCapability {
  slug: string;
  name: string;
  purpose: string;
  narrativeRoles: KidsNarrativeRole[];
  informationShapes: KidsInformationShape[];
  tones: KidsTone[];
  media: KidsMediaMode;
  inputs: KidsComponentInputField[];
  textBudget: { min: number; max: number };
  selectionHint: string;
  bestFor: string[];
  avoidWhen: string;
}

export const kidsComponentCapabilities: KidsComponentCapability[] = [
  {
    slug: "kids-title-card",
    name: "Kids Title Card",
    purpose: "Open with a big, playful title. Optional bright background image. Bouncy entrance grabs attention.",
    narrativeRoles: ["opening"],
    informationShapes: ["title"],
    tones: ["playful", "excited", "energetic"],
    media: "optional-image",
    inputs: [
      { name: "title", kind: "string", required: true, maxCharacters: 60, description: "The video title — short and fun" },
      { name: "subtitle", kind: "string", required: false, maxCharacters: 100, description: "A playful subtitle" },
      { name: "hook", kind: "string", required: false, maxCharacters: 120, description: "A hook that grabs attention in the first 2s" },
      { name: "label", kind: "string", required: false, maxCharacters: 30, description: "Pill label e.g. 'FUN FACTS!'" },
      { name: "imageUrl", kind: "image", required: false, description: "Bright background image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 5, max: 280 },
    selectionHint: "Use as the first scene to open the video with energy. Works with or without a background image.",
    bestFor: ["Opening a kids video", "Setting the tone", "Introducing the topic"],
    avoidWhen: "You need to present facts or data. Use kids-fun-fact or kids-number-stat instead.",
  },
  {
    slug: "kids-image-reveal",
    name: "Kids Image Reveal",
    purpose: "A full bright image with a playful caption. The image carries the visual; the caption explains it simply.",
    narrativeRoles: ["image-reveal"],
    informationShapes: ["single-image"],
    tones: ["playful", "curious", "excited"],
    media: "required-image",
    inputs: [
      { name: "imageUrl", kind: "image", required: true, description: "A bright, colorful image" },
      { name: "imageAlt", kind: "string", required: true, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "bright | vivid | soft | clean" },
      { name: "caption", kind: "string", required: false, maxCharacters: 180, description: "A simple, playful caption" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
    ],
    textBudget: { min: 0, max: 180 },
    selectionHint: "Use when you have a bright, relevant image that tells the story. Keep the caption simple and fun.",
    bestFor: ["Showing animals", "Showing places", "Showing objects", "Visual transitions"],
    avoidWhen: "The image is not available or not relevant. Use kids-question or kids-fun-fact instead.",
  },
  {
    slug: "kids-question",
    name: "Kids Question",
    purpose: "Pose a curious question to the viewer. Playful, direct, engaging. Sparks curiosity.",
    narrativeRoles: ["question"],
    informationShapes: ["question"],
    tones: ["curious", "playful", "excited"],
    media: "optional-image",
    inputs: [
      { name: "question", kind: "string", required: true, maxCharacters: 150, description: "The question — simple and curious" },
      { name: "context", kind: "string", required: false, maxCharacters: 250, description: "A line of context above the question" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional related image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 10, max: 400 },
    selectionHint: "Use to pose a curious question that engages young viewers. Great for narrative pivots.",
    bestFor: ["Opening hooks", "Mid-video pivots", "Engaging curiosity", "Transition questions"],
    avoidWhen: "You have a fact to present. Use kids-fun-fact instead.",
  },
  {
    slug: "kids-fun-fact",
    name: "Kids Fun Fact",
    purpose: "Present a fun fact with an image. Bright, vivid image treatment. Optional 'Did you know?' highlight pill.",
    narrativeRoles: ["fun-fact"],
    informationShapes: ["fact-with-image"],
    tones: ["excited", "playful", "curious"],
    media: "optional-image",
    inputs: [
      { name: "fact", kind: "string", required: true, maxCharacters: 200, description: "The fun fact — simple, surprising, age-appropriate" },
      { name: "highlight", kind: "string", required: false, maxCharacters: 40, description: "Optional highlight pill e.g. 'Did you know?'" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional related image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "vivid | bright | soft | clean" },
    ],
    textBudget: { min: 20, max: 200 },
    selectionHint: "Use to present a surprising or interesting fact. Keep language simple and age-appropriate.",
    bestFor: ["Animal facts", "Science facts", "History facts", "World records", 'How things work'],
    avoidWhen: "The fact involves complex numbers. Use kids-number-stat for big-number facts.",
  },
  {
    slug: "kids-number-stat",
    name: "Kids Number Stat",
    purpose: "A single big, animated number for kids. Huge Fredoka digits with a count-up animation. One number, no chart.",
    narrativeRoles: ["statistic"],
    informationShapes: ["single-statistic"],
    tones: ["excited", "energetic", "playful"],
    media: "optional-image",
    inputs: [
      { name: "value", kind: "number", required: true, description: "The number" },
      { name: "prefix", kind: "string", required: false, maxCharacters: 3 },
      { name: "suffix", kind: "string", required: false, maxCharacters: 5 },
      { name: "decimals", kind: "number", required: false },
      { name: "label", kind: "string", required: true, maxCharacters: 60, description: "What the number represents" },
      { name: "context", kind: "string", required: false, maxCharacters: 200, description: "A sentence explaining the number" },
      { name: "label2", kind: "string", required: false, maxCharacters: 30, description: "Pill label e.g. 'WOW!'" },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional related image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 10, max: 260 },
    selectionHint: "Use for a single, impressive number — distances, sizes, counts, ages. One big number, no chart.",
    bestFor: ["Animal sizes", "Planet distances", "Population counts", "Speed records", "Age of things"],
    avoidWhen: "You need to compare multiple values or show a trend. Use kids-top-list or a documentary chart instead.",
  },
  {
    slug: "kids-timeline",
    name: "Kids Timeline",
    purpose: "Simple steps or a sequence of events with playful colored dots. Easy to follow for young viewers.",
    narrativeRoles: ["timeline"],
    informationShapes: ["steps"],
    tones: ["playful", "curious", "energetic"],
    media: "optional-image",
    inputs: [
      { name: "title", kind: "string", required: false, maxCharacters: 60 },
      { name: "steps", kind: "array", required: true, maxItems: 5, description: "Array of { label, title, detail? }" },
      { name: "label2", kind: "string", required: false, maxCharacters: 30, description: "Pill label e.g. 'STEPS!'" },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional related image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 30, max: 500 },
    selectionHint: "Use to show steps, a sequence, or how something happens. Keep it simple — 3-5 steps maximum.",
    bestFor: ["How things work", "Life cycles", "Step-by-step processes", "Event sequences"],
    avoidWhen: "You have more than 5 steps. Split into two timelines or simplify.",
  },
  {
    slug: "kids-quote",
    name: "Kids Quote",
    purpose: "A quote from a person or character. Big playful quotation mark. Warm and friendly attribution.",
    narrativeRoles: ["quote"],
    informationShapes: ["quote"],
    tones: ["warm", "playful", "encouraging"],
    media: "optional-image",
    inputs: [
      { name: "quote", kind: "string", required: true, maxCharacters: 250, description: "The quote — simple and inspiring" },
      { name: "speaker", kind: "string", required: true, maxCharacters: 50 },
      { name: "role", kind: "string", required: false, maxCharacters: 70, description: "Speaker's role or who they are" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional portrait or scene image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 20, max: 250 },
    selectionHint: "Use for an inspiring or fun quote from a real person, scientist, explorer, or character.",
    bestFor: ["Scientist quotes", "Explorer quotes", "Inspiring messages", "Character quotes"],
    avoidWhen: "The quote is too complex for children. Simplify or use kids-fun-fact instead.",
  },
  {
    slug: "kids-top-list",
    name: "Kids Top List",
    purpose: "A ranked top-N list with bouncy pop-in items and colorful rank badges. Engaging and easy to follow.",
    narrativeRoles: ["top-list"],
    informationShapes: ["ranked-list"],
    tones: ["excited", "energetic", "playful"],
    media: "optional-image",
    inputs: [
      { name: "title", kind: "string", required: false, maxCharacters: 60 },
      { name: "items", kind: "array", required: true, maxItems: 5, description: "Array of { rank, title, detail? }" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "footer", kind: "string", required: false, maxCharacters: 60 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional related image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 30, max: 500 },
    selectionHint: "Use for ranked lists — biggest animals, fastest creatures, tallest buildings. Keep to 3-5 items.",
    bestFor: ["Top 5 animals", "Biggest things", "Fastest things", "Tallest things", "Most amazing facts"],
    avoidWhen: "You have more than 5 items. Split into two lists or simplify.",
  },
  {
    slug: "kids-ending",
    name: "Kids Ending",
    purpose: "A warm, positive closing message. Encourages the viewer. Ends on a happy note.",
    narrativeRoles: ["closing"],
    informationShapes: ["closing-message"],
    tones: ["warm", "encouraging", "playful"],
    media: "optional-image",
    inputs: [
      { name: "message", kind: "string", required: true, maxCharacters: 200, description: "The closing message — warm and positive" },
      { name: "encouragement", kind: "string", required: false, maxCharacters: 150, description: "A final encouraging thought or question" },
      { name: "label", kind: "string", required: false, maxCharacters: 30 },
      { name: "imageUrl", kind: "image", required: false, description: "Optional bright closing image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 20, max: 350 },
    selectionHint: "Use as the final content scene. End on a warm, encouraging note.",
    bestFor: ["Closing a kids video", "Encouraging learning", "Positive send-off"],
    avoidWhen: "This is not the last scene. Use kids-question for mid-video questions.",
  },
  {
    slug: "kids-end-card",
    name: "Kids End Card",
    purpose: "The final card. A big playful subscribe button and channel name. Pulses gently to attract attention.",
    narrativeRoles: ["outro"],
    informationShapes: ["title"],
    tones: ["energetic", "playful"],
    media: "optional-image",
    inputs: [
      { name: "cta", kind: "string", required: false, maxCharacters: 40, description: "Subscribe button text" },
      { name: "channelName", kind: "string", required: false, maxCharacters: 40 },
      { name: "finalQuestion", kind: "string", required: false, maxCharacters: 120, description: "A final hook question" },
      { name: "imageUrl", kind: "image", required: false, description: "Optional background image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
    ],
    textBudget: { min: 0, max: 160 },
    selectionHint: "Always use as the very last scene. A subscribe CTA with the channel name.",
    bestFor: ["Closing the video", "Driving subscriptions"],
    avoidWhen: "Never — this should always be the final scene.",
  },
];

export function getKidsComponentCapability(slug: string): KidsComponentCapability | undefined {
  return kidsComponentCapabilities.find((c) => c.slug === slug);
}

// ─── LLM catalog (JSON-safe) ─────────────────────────────────────────────────

export interface KidsCatalogComponent {
  slug: string;
  name: string;
  purpose: string;
  narrativeRoles: KidsNarrativeRole[];
  informationShapes: KidsInformationShape[];
  tones: KidsTone[];
  media: KidsMediaMode;
  inputs: Array<{
    name: string;
    kind: "string" | "number" | "array" | "image" | "optional";
    required: boolean;
    max?: number;
  }>;
  textBudget: { min: number; max: number };
  selectionHint: string;
}

export function getKidsLlmCatalog(): { components: KidsCatalogComponent[] } {
  return {
    components: kidsComponentCapabilities.map((c) => ({
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

export interface KidsSelectionQuery {
  narrativeRole?: KidsNarrativeRole;
  informationShape?: KidsInformationShape;
  tone?: KidsTone;
  availableImages?: number;
}

export function recommendKidsComponents(query: KidsSelectionQuery): KidsComponentCapability[] {
  return kidsComponentCapabilities
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
