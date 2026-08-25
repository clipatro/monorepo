/**
 * Mystery namespace registry — component registration with sample data.
 */

import type React from "react";
import type { ThemeConfig } from "../themes/index.ts";
import type { TemplateDefinition } from "../registry/index.ts";
import {
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
} from "./components/MysteryComponents.tsx";

const sampleImage = "https://images.unsplash.com/photo-1571987506974-8e42c7c5d3f1";

const titleData: MysteryTitleCardData = {
  title: "The Vanishing at Cape Noren",
  subtitle: "Three keepers. One lighthouse. No bodies.",
  caseLabel: "CASE 04",
  imageUrl: sampleImage,
  imageAlt: "Foggy lighthouse on a remote coast",
};

const imageRevealData: MysteryImageRevealData = {
  imageUrl: sampleImage,
  imageAlt: "The lighthouse as it appears today",
  imageTreatment: "dark",
  caption: "The lighthouse has been automated since 1972. The original keeper quarters remain locked.",
  caseLabel: "EVIDENCE",
  footer: "Photographed 2019",
};

const questionData: MysteryQuestionData = {
  question: "How do three experienced keepers vanish from an island on a clear night?",
  context: "The weather log shows no storm. The sea was calm. The last entry in the logbook was routine.",
  caseLabel: "THE QUESTION",
  footer: "December 15, 1900",
};

const clueData: MysteryClueData = {
  clueNumber: "CLUE 01",
  clue: "The clock had stopped. The table was set for a meal that was never eaten. One chair was overturned.",
  source: "Relief vessel report, December 26, 1900",
  imageUrl: sampleImage,
  imageAlt: "Interior of a lighthouse keeper's quarters",
  imageTreatment: "noir",
};

const timelineData: MysteryTimelineData = {
  title: "The disappearance",
  events: [
    { date: "Dec 7", title: "Last supply run", detail: "The relief vessel delivered provisions and reported all three keepers well." },
    { date: "Dec 15", title: "Last log entry", detail: "Keeper Ducat noted severe winds and damage to the west landing." },
    { date: "Dec 26", title: "Discovery", detail: "The relief vessel arrived to find the lighthouse unmanned." },
  ],
  caseLabel: "TIMELINE",
  footer: "Flannan Isles, Scotland",
};

const quoteData: MysteryQuoteData = {
  quote: "We entered the kitchen. The ashes were cold. Whatever had happened here had happened days ago.",
  speaker: "Joseph Moore",
  role: "Relief keeper, first to enter the lighthouse",
  when: "December 26, 1900",
  imageUrl: sampleImage,
  imageAlt: "Portrait of a lighthouse keeper",
  imageTreatment: "desaturated",
};

const locationData: MysteryLocationData = {
  place: "Eilean Mòr",
  region: "Flannan Isles, Scotland",
  coordinates: "58.2947° N · 6.6131° W",
  significance: "The largest of the Flannan Isles and the site of the lighthouse where all three keepers vanished.",
  facts: [
    { label: "Population", value: "0" },
    { label: "Lighthouse", value: "1900" },
    { label: "Keepers", value: "3" },
  ],
  imageUrl: sampleImage,
  imageAlt: "Remote rocky island with a lighthouse",
  imageTreatment: "dark",
};

const statisticData: MysteryStatisticData = {
  value: 117,
  suffix: " years",
  label: "Since the disappearance",
  context: "The Flannan Isles mystery has never been officially solved. Theories range from a rogue wave to something stranger.",
  caseLabel: "DATA",
  footer: "As of 2017",
};

const endingData: MysteryEndingData = {
  statement: "The lighthouse still operates. The keeper quarters remain sealed. The logbook sits in a museum in Edinburgh.",
  openQuestion: "What really happened on Eilean Mòr on that December night?",
  caseLabel: "CLOSING",
};

const entry = <T,>(
  slug: string,
  name: string,
  subtitle: string,
  category: TemplateDefinition["category"],
  component: React.FC<{ data: T; theme?: ThemeConfig; delay?: number }>,
  data: T,
  durationInFrames = 150,
): TemplateDefinition => ({
  slug,
  name,
  subtitle,
  category,
  component,
  defaultProps: { data },
  durationInFrames,
  fps: 30,
  width: 720,
  height: 1280,
});

export const mysteryRegistry: TemplateDefinition[] = [
  entry("mystery-title-card", "Mystery Title Card", "Atmospheric opening with optional darkened background image", "Narrative", MysteryTitleCard, titleData, 120),
  entry("mystery-image-reveal", "Mystery Image Reveal", "Full-bleed image that builds the mystery with a quiet caption", "Image & Media", MysteryImageReveal, imageRevealData, 150),
  entry("mystery-question", "Mystery Question", "A question posed to the viewer — quiet, direct, lingering", "Narrative", MysteryQuestion, questionData, 120),
  entry("mystery-clue", "Mystery Clue", "Evidence image with a factual observation — noir treatment", "Evidence", MysteryClue, clueData, 150),
  entry("mystery-timeline", "Mystery Timeline", "Sparse vertical timeline of key events", "Evidence", MysteryTimeline, timelineData, 165),
  entry("mystery-quote", "Mystery Quote", "A quote from someone involved — italicized, with optional image", "Narrative", MysteryQuote, quoteData, 150),
  entry("mystery-location", "Mystery Location", "A place connected to the mystery — image, coordinates, significance", "People & Places", MysteryLocation, locationData, 150),
  entry("mystery-statistic", "Mystery Statistic", "A single unsettling number — large, quiet, serif", "Facts & Data", MysteryStatistic, statisticData, 120),
  entry("mystery-ending", "Mystery Ending", "A closing statement that lingers — not a resolution", "Narrative", MysteryEnding, endingData, 135),
  entry("mystery-end-card", "Mystery End Card", "A single dot and 'End of file'. Nothing else.", "Intro & Outro", MysteryEndCard, {}, 90),
];
