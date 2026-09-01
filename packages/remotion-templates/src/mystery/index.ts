/**
 * Mystery namespace — public exports.
 *
 * REVISED v3 — editorial documentary polish:
 * - Unified type system: serif (Georgia) for content, mono (IBM Plex Mono) for labels
 * - Generous bottom space (150px) reserved for captions
 * - Light bottom gradient — images stay visible and atmospheric
 * - One accent element per frame — restraint over decoration
 * - Quiet cubic-ease entrances — no springs, no bounces
 * - Cliffhanger endings, not "end of file"
 */

// Components
export {
  MysteryTitleCard,
  MysteryImageReveal,
  MysteryQuestion,
  MysteryClue,
  MysteryTimeline,
  MysteryQuote,
  MysteryLocation,
  MysteryStatistic,
  MysteryEnding,
  MysteryEndCard,
  type MysteryTitleCardData,
  type MysteryImageRevealData,
  type MysteryQuestionData,
  type MysteryClueData,
  type MysteryTimelineData,
  type MysteryQuoteData,
  type MysteryLocationData,
  type MysteryStatisticData,
  type MysteryEndingData,
  type MysteryEndCardData,
} from "./components/MysteryComponents.tsx";

// Canvas + primitives
export {
  MysteryCanvas,
  MysteryReveal,
  MysteryImage,
  MysteryCaption,
  MysteryPanel,
  MysteryLabel,
  getMysteryTokens,
  type MysteryTokens,
  type MysteryImageData,
} from "./canvas.tsx";

// Theme
export { mysteryTheme } from "./theme.ts";

// Fonts — call loadMysteryFonts() once at the top of any composition
export { loadMysteryFonts, PLAYFAIR_DISPLAY, IBM_PLEX_MONO } from "./fonts.ts";

// Capabilities
export {
  mysteryComponentCapabilities,
  getMysteryComponentCapability,
  getMysteryLlmCatalog,
  recommendMysteryComponents,
  type MysteryNarrativeRole,
  type MysteryInformationShape,
  type MysteryTone,
  type MysteryMediaMode,
  type MysteryComponentCapability,
  type MysteryCatalogComponent,
  type MysterySelectionQuery,
} from "./capabilities.ts";

// Registry
export { mysteryRegistry } from "./registry.ts";
