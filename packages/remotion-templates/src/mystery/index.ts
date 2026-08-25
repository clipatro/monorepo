/**
 * Mystery namespace — public exports.
 *
 * REVISED v2 — feed-optimized design:
 * - Blurred BG images on every scene for visual depth
 * - Bold captions, Ken Burns zoom, fast hooks
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
