/**
 * Kids namespace registry — component registration with sample data.
 */

import type React from "react";
import type { ThemeConfig } from "../themes/index.ts";
import type { TemplateDefinition } from "../registry/index.ts";
import {
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
} from "./components/KidsComponents.tsx";

const sampleImage = "https://images.unsplash.com/photo-1547036967-23d11aacaee0";

const titleData: KidsTitleCardData = {
  title: "Amazing Animals!",
  subtitle: "5 incredible creatures you need to meet",
  hook: "Did you know some animals can do the impossible?",
  label: "FUN FACTS!",
  imageUrl: sampleImage,
  imageAlt: "Colorful tropical animals",
};

const imageRevealData: KidsImageRevealData = {
  imageUrl: sampleImage,
  imageAlt: "A bright tropical reef full of fish",
  imageTreatment: "vivid",
  caption: "The ocean is full of colorful creatures!",
  label: "LOOK!",
  footer: "Coral Reef",
};

const questionData: KidsQuestionData = {
  question: "How do chameleons change color?",
  context: "These little lizards can turn from green to red in seconds!",
  label: "QUESTION!",
  footer: "Reptile Mystery",
};

const funFactData: KidsFunFactData = {
  fact: "A group of flamingos is called a 'flamboyance' — how perfect is that?",
  highlight: "Did you know?",
  label: "FUN FACT!",
  footer: "Bird Trivia",
  imageUrl: sampleImage,
  imageAlt: "Pink flamingos standing together",
  imageTreatment: "vivid",
};

const numberStatData: KidsNumberStatData = {
  value: 100,
  suffix: "+",
  label: "Teeth in a shark's mouth",
  context: "Some sharks can have over 100 teeth, and they grow new ones their whole life!",
  label2: "WOW!",
  footer: "Shark Facts",
};

const timelineData: KidsTimelineData = {
  title: "How a butterfly is born",
  steps: [
    { label: "Step 1", title: "Egg", detail: "A butterfly starts as a tiny egg on a leaf." },
    { label: "Step 2", title: "Caterpillar", detail: "It hatches and eats lots of leaves to grow." },
    { label: "Step 3", title: "Chrysalis", detail: "It wraps itself up and transforms inside." },
    { label: "Step 4", title: "Butterfly", detail: "A beautiful butterfly emerges and flies away!" },
  ],
  label2: "STEPS!",
  footer: "Life Cycle",
};

const quoteData: KidsQuoteData = {
  quote: "The more that you read, the more things you will know.",
  speaker: "Dr. Seuss",
  role: "Beloved children's author",
  label: "QUOTE!",
  footer: "Words to Live By",
};

const topListData: KidsTopListData = {
  title: "Top 3 Fastest Animals",
  items: [
    { rank: 1, title: "Peregrine Falcon", detail: "Up to 240 mph in a dive!" },
    { rank: 2, title: "Cheetah", detail: "Up to 70 mph on land!" },
    { rank: 3, title: "Sailfish", detail: "Up to 68 mph in the water!" },
  ],
  label: "TOP LIST!",
  footer: "Speed Champions",
};

const endingData: KidsEndingData = {
  message: "The world is full of amazing things to discover!",
  encouragement: "What will you learn about next?",
  label: "REMEMBER!",
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

export const kidsRegistry: TemplateDefinition[] = [
  entry("kids-title-card", "Kids Title Card", "Big playful opening with optional bright background image", "Narrative", KidsTitleCard, titleData, 120),
  entry("kids-image-reveal", "Kids Image Reveal", "Full bright image with a playful, simple caption", "Image & Media", KidsImageReveal, imageRevealData, 150),
  entry("kids-question", "Kids Question", "A curious question that sparks wonder — playful and direct", "Narrative", KidsQuestion, questionData, 120),
  entry("kids-fun-fact", "Kids Fun Fact", "A surprising fun fact with optional 'Did you know?' highlight", "Facts & Data", KidsFunFact, funFactData, 150),
  entry("kids-number-stat", "Kids Number Stat", "A single big animated number — huge Fredoka digits, count-up", "Facts & Data", KidsNumberStat, numberStatData, 120),
  entry("kids-timeline", "Kids Timeline", "Simple steps with playful colored dots — easy to follow", "Explainers", KidsTimeline, timelineData, 165),
  entry("kids-quote", "Kids Quote", "An inspiring quote with a big playful quotation mark", "Narrative", KidsQuote, quoteData, 150),
  entry("kids-top-list", "Kids Top List", "A ranked top-N list with bouncy pop-in and colorful rank badges", "Facts & Data", KidsTopList, topListData, 165),
  entry("kids-ending", "Kids Ending", "A warm, positive closing message with encouragement", "Narrative", KidsEnding, endingData, 135),
  entry("kids-end-card", "Kids End Card", "A big playful subscribe button with channel name", "Intro & Outro", KidsEndCard, {}, 90),
];
