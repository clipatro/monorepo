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

/**
 * The region of the 720×1280 frame where a component places its text/caption
 * overlay. The image-generation pipeline reads this to instruct the image
 * model to keep characters and important objects OUT of this region so the
 * caption never overlaps them.
 *
 * Coordinates are fractions of the frame (0 = top/left edge, 1 = bottom/right
 * edge). `verticalExtent` / `horizontalExtent` describe the bounding box the
 * text occupies; `zone` is a short semantic label for logging and fallbacks.
 */
export type KidsTextZone =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "full";

export interface KidsTextPlacement {
  /** Semantic label for where text appears — used for logging + fallbacks. */
  zone: KidsTextZone;
  /** Plain-language description of the reserved text region, for image-gen prompts. */
  description: string;
  /** Vertical bounding box of the text region as fractions of frame height (0-1). */
  verticalExtent: { from: number; to: number };
  /** Horizontal bounding box of the text region as fractions of frame width (0-1). */
  horizontalExtent: { from: number; to: number };
}

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
  /**
   * Where this component places its text/caption overlay on the 720×1280
   * frame. The image-generation pipeline reads this to keep characters and
   * important objects out of the reserved text region.
   */
  textPlacement: KidsTextPlacement;
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
    textPlacement: {
      zone: "top",
      description: "Title, hook, subtitle, and label pill appear in the TOP portion of the frame (roughly the top 45%). Keep characters and key subjects in the lower 55% of the frame.",
      verticalExtent: { from: 0.06, to: 0.45 },
      horizontalExtent: { from: 0.05, to: 0.95 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "A speech-bubble caption and label pill appear in the BOTTOM portion of the frame, above the platform safe area (roughly 55%-83% down). Keep characters and key subjects in the upper 55% of the frame.",
      verticalExtent: { from: 0.55, to: 0.83 },
      horizontalExtent: { from: 0.1, to: 0.9 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "The question and context line appear in the BOTTOM portion of the frame (roughly 60%-96% down). Keep characters and key subjects in the upper 60% of the frame.",
      verticalExtent: { from: 0.6, to: 0.96 },
      horizontalExtent: { from: 0.07, to: 0.93 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "A callout card with the fact appears in the BOTTOM portion of the frame (roughly 55%-96% down). Keep characters and key subjects in the upper 55% of the frame.",
      verticalExtent: { from: 0.55, to: 0.96 },
      horizontalExtent: { from: 0.07, to: 0.93 },
    },
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
    textPlacement: {
      zone: "center",
      description: "The big number, label, and context appear in the CENTER of the frame (roughly 25%-75% down). Keep characters and key subjects toward the top and bottom edges, away from the center.",
      verticalExtent: { from: 0.25, to: 0.75 },
      horizontalExtent: { from: 0.08, to: 0.92 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "The title and step list appear in the BOTTOM portion of the frame (roughly 50%-96% down). Keep characters and key subjects in the upper 50% of the frame.",
      verticalExtent: { from: 0.5, to: 0.96 },
      horizontalExtent: { from: 0.07, to: 0.93 },
    },
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
    textPlacement: {
      zone: "center",
      description: "The quotation mark, quote, and attribution appear in the CENTER of the frame (roughly 20%-80% down). Keep characters and key subjects toward the top and bottom edges, away from the center.",
      verticalExtent: { from: 0.2, to: 0.8 },
      horizontalExtent: { from: 0.08, to: 0.92 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "The title and ranked list appear in the BOTTOM portion of the frame (roughly 50%-96% down). Keep characters and key subjects in the upper 50% of the frame.",
      verticalExtent: { from: 0.5, to: 0.96 },
      horizontalExtent: { from: 0.07, to: 0.93 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "The label pill, message, and encouragement appear in the LOWER portion of the frame, above the platform safe area (roughly 78%-93% down). Keep characters and key subjects in the upper 78% of the frame — their face and body must be well above the text region so nothing overlaps.",
      verticalExtent: { from: 0.78, to: 0.93 },
      horizontalExtent: { from: 0.08, to: 0.92 },
    },
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
    textPlacement: {
      zone: "bottom",
      description: "The final question, subscribe CTA button, and channel name appear in the LOWER portion of the frame, above the platform safe area (roughly 75%-92% down). Keep characters and key subjects in the upper 75% of the frame — their face and body must be well above the text region so nothing overlaps.",
      verticalExtent: { from: 0.75, to: 0.92 },
      horizontalExtent: { from: 0.08, to: 0.92 },
    },
    selectionHint: "Always use as the very last scene. A subscribe CTA with the channel name.",
    bestFor: ["Closing the video", "Driving subscriptions"],
    avoidWhen: "Never — this should always be the final scene.",
  },
  // ─── Subtitle-safe scene components (intelligent layout selection) ──────
  // These two components are the primary scene components for story videos.
  // The LLM picks "top" or "bottom" per scene based on where the character
  // and important visual elements are best positioned, then the image
  // generator is instructed to keep characters OUT of the reserved subtitle
  // region. This guarantees subtitles never overlap characters.
  {
    slug: "kids-subtitle-top-scene",
    name: "Kids Subtitle Top Scene",
    purpose: "A full-bleed scene image with the narration/caption in a translucent white speech bubble anchored at the TOP of the frame. Characters and important visual elements are placed in the LOWER portion of the image so the subtitle never overlaps them.",
    narrativeRoles: ["image-reveal", "opening", "closing"],
    informationShapes: ["single-image", "fact-with-image"],
    tones: ["playful", "warm", "curious", "excited", "encouraging"],
    media: "required-image",
    inputs: [
      { name: "caption", kind: "string", required: true, maxCharacters: 200, description: "The narration/caption text" },
      { name: "label", kind: "string", required: false, maxCharacters: 30, description: "Optional emotion label pill" },
      { name: "imageUrl", kind: "image", required: true, description: "Scene background image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "vivid | bright | soft | clean" },
    ],
    textBudget: { min: 5, max: 200 },
    textPlacement: {
      zone: "top",
      description: "The subtitle speech bubble appears at the TOP of the frame (roughly 6%-30% down). Keep ALL characters, faces, hands, and important objects in the LOWER 70% of the frame — well below the subtitle region.",
      verticalExtent: { from: 0.06, to: 0.30 },
      horizontalExtent: { from: 0.10, to: 0.90 },
    },
    selectionHint: "Use when the scene's composition naturally places the character/subject in the lower part of the frame (e.g. looking up at something, standing in a valley, underground, looking at the sky).",
    bestFor: ["Scenes where character looks upward", "Scenes with open sky/space at top", "Scenes where subject is low in frame"],
    avoidWhen: "The character's face or important action is in the top portion of the frame. Use kids-subtitle-bottom-scene instead.",
  },
  {
    slug: "kids-subtitle-bottom-scene",
    name: "Kids Subtitle Bottom Scene",
    purpose: "A full-bleed scene image with the narration/caption in a translucent white speech bubble anchored at the BOTTOM of the frame (above platform safe area). Characters and important visual elements are placed in the UPPER portion of the image so the subtitle never overlaps them.",
    narrativeRoles: ["image-reveal", "opening", "closing"],
    informationShapes: ["single-image", "fact-with-image"],
    tones: ["playful", "warm", "curious", "excited", "encouraging"],
    media: "required-image",
    inputs: [
      { name: "caption", kind: "string", required: true, maxCharacters: 200, description: "The narration/caption text" },
      { name: "label", kind: "string", required: false, maxCharacters: 30, description: "Optional emotion label pill" },
      { name: "imageUrl", kind: "image", required: true, description: "Scene background image" },
      { name: "imageAlt", kind: "string", required: false, maxCharacters: 100 },
      { name: "imageTreatment", kind: "string", required: false, description: "vivid | bright | soft | clean" },
    ],
    textBudget: { min: 5, max: 200 },
    textPlacement: {
      zone: "bottom",
      description: "The subtitle speech bubble appears at the BOTTOM of the frame (roughly 72%-90% down). Keep ALL characters, faces, hands, and important objects in the UPPER 72% of the frame — well above the subtitle region.",
      verticalExtent: { from: 0.72, to: 0.90 },
      horizontalExtent: { from: 0.10, to: 0.90 },
    },
    selectionHint: "Use when the scene's composition naturally places the character/subject in the upper part of the frame (e.g. looking down from a hill, flying, tall trees, character standing tall).",
    bestFor: ["Scenes where character is standing tall", "Scenes with ground/low elements at bottom", "Most standard scenes"],
    avoidWhen: "The character's face or important action is in the bottom portion of the frame. Use kids-subtitle-top-scene instead.",
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
  textPlacement: KidsTextPlacement;
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
      textPlacement: c.textPlacement,
      selectionHint: c.selectionHint,
    })),
  };
}

// ─── Text-placement → image-generation instructions ─────────────────────────
//
// Converts a component's KidsTextPlacement into explicit, model-friendly
// composition instructions for the image generator. The image model is told
// exactly which region of the frame is reserved for text and where to place
// characters/objects instead, so the caption never overlaps them.

/**
 * Build a concise, image-model-friendly composition directive from a
 * component's text placement. Returns a string suitable for appending to an
 * image-generation positive prompt.
 */
export function textPlacementToImageInstructions(tp: KidsTextPlacement): string {
  const vFromPct = Math.round(tp.verticalExtent.from * 100);
  const vToPct = Math.round(tp.verticalExtent.to * 100);
  const hFromPct = Math.round(tp.horizontalExtent.from * 100);
  const hToPct = Math.round(tp.horizontalExtent.to * 100);

  // Determine the "safe" region (where characters SHOULD go) as the
  // complement of the text region along the dominant axis.
  let safeZone: string;
  if (tp.zone === "top") {
    safeZone = `Place all characters and important objects in the LOWER ${100 - vToPct}% of the frame (below ${vToPct}% down).`;
  } else if (tp.zone === "bottom") {
    safeZone = `Place all characters and important objects in the UPPER ${vFromPct}% of the frame (above ${vFromPct}% down).`;
  } else if (tp.zone === "center") {
    safeZone = `Place all characters and important objects near the TOP (above ${vFromPct}% down) and BOTTOM (below ${vToPct}% down) edges — keep the vertical center clear.`;
  } else if (tp.zone === "left") {
    safeZone = `Place all characters and important objects on the RIGHT side (right of ${hToPct}% across).`;
  } else if (tp.zone === "right") {
    safeZone = `Place all characters and important objects on the LEFT side (left of ${hFromPct}% across).`;
  } else {
    safeZone = `Place all characters and important objects away from the ${tp.zone} region of the frame.`;
  }

  return [
    `COMPOSITION / TEXT-SAFE AREA: A text caption overlay will appear in the ${tp.zone.toUpperCase()} region of the frame (vertically ${vFromPct}%-${vToPct}% down, horizontally ${hFromPct}%-${hToPct}% across).`,
    safeZone,
    `Keep that ${tp.zone.toUpperCase()} text region clear of characters, faces, hands, and important objects — leave negative spacing so the caption never overlaps them. Nothing cropped or pushed against any edge.`,
  ].join(" ");
}

/**
 * Build a short negative-prompt fragment reinforcing the text-safe area, for
 * appending to the image generator's negative prompt.
 */
export function textPlacementToNegativeHint(tp: KidsTextPlacement): string {
  const vFromPct = Math.round(tp.verticalExtent.from * 100);
  const vToPct = Math.round(tp.verticalExtent.to * 100);
  return `characters or important objects in the ${tp.zone} text region (${vFromPct}%-${vToPct}% down), text overlap, cropped subject, subject touching frame edge`;
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
