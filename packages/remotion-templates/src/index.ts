/**
 * @automation/remotion-templates
 *
 * Themable Remotion component catalog with hot-reloadable Studio.
 *
 * Usage:
 *   import { BarChart, midnightTheme } from "@automation/remotion-templates";
 *   <BarChart data={data} theme={midnightTheme} />
 *
 *   // Or use the registry:
 *   import { getTemplate } from "@automation/remotion-templates/registry";
 *   const template = getTemplate("bar-chart");
 *
 *   // Or create a custom theme:
 *   import { createTheme } from "@automation/remotion-templates/themes";
 *   const myTheme = createTheme("midnight", { accents: { primary: "#ff6b00" } });
 */

// Components — Documentary namespace
export { BarChart, type BarChartData } from "./documentary/components/BarChart.tsx";
export { LineChart, type LineChartData } from "./documentary/components/LineChart.tsx";
export { PieChart, type PieChartData } from "./documentary/components/PieChart.tsx";
export { AnimatedList, type AnimatedListData } from "./documentary/components/AnimatedList.tsx";
export { CircularProgress, type CircularProgressData } from "./documentary/components/CircularProgress.tsx";
export { TitleCard } from "./documentary/components/TitleCard.tsx";
export { EndCard } from "./documentary/components/EndCard.tsx";
export { HookHeadline, ChapterCard, QuestionCard, QuoteCard, ConclusionCard, type HookHeadlineData, type ChapterCardData, type QuestionCardData, type QuoteCardData, type ConclusionCardData } from "./documentary/components/DocumentaryNarrative.tsx";
export { KeyFact, StatisticSpotlight, MythFact, ComparisonSplit, BeforeAfter, type KeyFactData, type StatisticSpotlightData, type MythFactData, type ComparisonSplitData, type BeforeAfterData } from "./documentary/components/DocumentaryFacts.tsx";
export { EvidenceCard, SourceCitation, DocumentReveal, Timeline, EventCountdown, type EvidenceCardData, type SourceCitationData, type DocumentRevealData, type TimelineData, type EventCountdownData } from "./documentary/components/DocumentaryEvidence.tsx";
export { PersonProfile, LocationCard, MapRoute, ProcessSteps, CauseEffect, type PersonProfileData, type LocationCardData, type MapRouteData, type ProcessStepsData, type CauseEffectData } from "./documentary/components/DocumentaryContext.tsx";
export { HeroImageStory, ArchivalPhoto, PhotoStack, ImageComparison, ImageQuote, EvidenceZoom, ImageMosaic, CaptionedImage, type HeroImageStoryData, type ArchivalPhotoData, type PhotoStackData, type ImageComparisonData, type ImageQuoteData, type EvidenceZoomData, type ImageMosaicData, type CaptionedImageData } from "./documentary/components/DocumentaryMedia.tsx";

// Primitives
export { AnimatedNumber } from "./primitives/AnimatedNumber.tsx";
export { GradientText } from "./primitives/GradientText.tsx";
export { GlassCard } from "./primitives/GlassCard.tsx";
export { AnimatedBackground } from "./primitives/AnimatedBackground.tsx";
export { SectionTitle } from "./primitives/SectionTitle.tsx";
export { DocumentaryCanvas, DocumentaryPanel, DocumentaryPill, DocumentaryReveal, EditorialImage, getDocumentaryTokens, type DocumentaryTokens, type DocumentaryImageData } from "./documentary/canvas.tsx";
export { StoryIcon, storyIconNames, type StoryIconName } from "./primitives/StoryIcon.tsx";

export { componentCapabilities, getComponentCapability, recommendComponents, getLlmComponentCatalog, type NarrativeRole, type InformationShape, type ComponentTone, type MediaMode, type InputKind, type ComponentInputField, type ComponentCapability, type ComponentSelectionQuery, type ComponentRecommendation } from "./documentary/capabilities.ts";

// Mystery namespace
export {
  MysteryTitleCard, MysteryImageReveal, MysteryQuestion, MysteryClue, MysteryTimeline, MysteryQuote, MysteryLocation, MysteryStatistic, MysteryEnding, MysteryEndCard,
  type MysteryTitleCardData, type MysteryImageRevealData, type MysteryQuestionData, type MysteryClueData, type MysteryTimelineData, type MysteryQuoteData, type MysteryLocationData, type MysteryStatisticData, type MysteryEndingData,
  MysteryCanvas, MysteryReveal, MysteryImage, MysteryPanel, MysteryLabel, getMysteryTokens, type MysteryTokens, type MysteryImageData,
  mysteryTheme,
  loadMysteryFonts, PLAYFAIR_DISPLAY, IBM_PLEX_MONO,
  mysteryComponentCapabilities, getMysteryComponentCapability, getMysteryLlmCatalog, recommendMysteryComponents, type MysteryNarrativeRole, type MysteryInformationShape, type MysteryTone, type MysteryMediaMode, type MysteryComponentCapability, type MysterySelectionQuery,
  mysteryRegistry,
} from "./mystery/index.ts";

// Kids namespace
export {
  KidsTitleCard, KidsImageReveal, KidsQuestion, KidsFunFact, KidsNumberStat, KidsTimeline, KidsQuote, KidsTopList, KidsEnding, KidsEndCard,
  type KidsTitleCardData, type KidsImageRevealData, type KidsQuestionData, type KidsFunFactData, type KidsNumberStatData, type KidsTimelineData, type KidsQuoteData, type KidsTopListData, type KidsEndingData, type KidsEndCardData,
  KidsCanvas, KidsReveal, KidsImage, KidsCaption, KidsPanel, KidsLabel,
  KidsSceneCanvas, KidsScrim, KidsSpeechBubble, KidsThoughtBubble, KidsCalloutCard, KidsCaptionStrip, buildScrimBackground,
  getKidsTokens, type KidsTokens, type KidsImageData,
  type KidsSceneCanvasProps, type KidsScrimProps, type KidsSpeechBubbleProps, type KidsThoughtBubbleProps, type KidsCalloutCardProps, type KidsCaptionStripProps,
  kidsTheme,
  loadKidsFonts, FREDOKA, NUNITO,
  kidsComponentCapabilities, getKidsComponentCapability, getKidsLlmCatalog, recommendKidsComponents, type KidsNarrativeRole, type KidsInformationShape, type KidsTone, type KidsMediaMode, type KidsComponentCapability, type KidsSelectionQuery,
  kidsRegistry,
} from "./kids/index.ts";

// Themes
export {
  type ThemeConfig,
  archiveTheme,
  midnightTheme,
  sunsetTheme,
  forestTheme,
  royalTheme,
  themes,
  defaultTheme,
  getTheme,
  createTheme,
} from "./themes/index.ts";

// Registry
export {
  type TemplateDefinition,
  type TemplateEntry,
  type TemplateCategory,
  registry,
  getTemplate,
  listTemplates,
  listCategories,
} from "./registry/index.ts";
