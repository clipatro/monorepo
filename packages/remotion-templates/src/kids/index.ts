/**
 * Kids namespace — public exports.
 *
 * Bright, playful, energetic storytelling for children's content.
 * - Fredoka (rounded display) for titles/headlines, Nunito for body
 * - Bouncy spring entrances — kids content should feel alive
 * - Saturated colors (sky blue, sunny yellow, coral, mint green)
 * - Split layout: image top ~55%, bright white text panel bottom ~45%
 * - Happy, warm, inviting — never dark or gloomy
 */

// Components
export {
  KidsTitleCard,
  KidsImageReveal,
  KidsQuestion,
  KidsFunFact,
  KidsNumberStat,
  KidsTimeline,
  KidsQuote,
  KidsTopList,
  KidsEnding,
  KidsEndCard,
  type KidsTitleCardData,
  type KidsImageRevealData,
  type KidsQuestionData,
  type KidsFunFactData,
  type KidsNumberStatData,
  type KidsTimelineData,
  type KidsQuoteData,
  type KidsTopListData,
  type KidsEndingData,
  type KidsEndCardData,
} from "./components/KidsComponents.tsx";

// Canvas + primitives
export {
  KidsCanvas,
  KidsReveal,
  KidsImage,
  KidsCaption,
  KidsPanel,
  KidsLabel,
  KidsSceneCanvas,
  KidsScrim,
  KidsSpeechBubble,
  KidsThoughtBubble,
  KidsCalloutCard,
  KidsCaptionStrip,
  buildScrimBackground,
  getKidsTokens,
  type KidsTokens,
  type KidsImageData,
  type KidsSceneCanvasProps,
  type KidsScrimProps,
  type KidsSpeechBubbleProps,
  type KidsThoughtBubbleProps,
  type KidsCalloutCardProps,
  type KidsCaptionStripProps,
} from "./canvas.tsx";

// Theme
export { kidsTheme } from "./theme.ts";

// Fonts — call loadKidsFonts() once at the top of any composition
export { loadKidsFonts, FREDOKA, NUNITO } from "./fonts.ts";

// Capabilities
export {
  kidsComponentCapabilities,
  getKidsComponentCapability,
  getKidsLlmCatalog,
  recommendKidsComponents,
  type KidsNarrativeRole,
  type KidsInformationShape,
  type KidsTone,
  type KidsMediaMode,
  type KidsComponentCapability,
  type KidsCatalogComponent,
  type KidsSelectionQuery,
} from "./capabilities.ts";

// Registry
export { kidsRegistry } from "./registry.ts";
