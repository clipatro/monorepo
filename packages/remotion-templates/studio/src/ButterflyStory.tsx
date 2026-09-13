/**
 * Butterfly Story — Remotion composition for the full-bleed kids video.
 *
 * Sequences all 10 refactored kids components with butterfly story data,
 * timed to match the Kokoro TTS narration. Uses consistent Unsplash imagery
 * (monarch butterflies, caterpillars, chrysalises) throughout for visual
 * continuity. Audio track is the mixed narration + background music.
 *
 * Scene timing is derived from the TTS segment durations in timing.json.
 */

import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import {
  KidsTitleCard,
  KidsImageReveal,
  KidsQuestion,
  KidsFunFact,
  KidsNumberStat,
  KidsTimeline,
  KidsEnding,
  KidsEndCard,
  loadKidsFonts,
  kidsTheme,
  type KidsTitleCardData,
  type KidsImageRevealData,
  type KidsQuestionData,
  type KidsFunFactData,
  type KidsNumberStatData,
  type KidsTimelineData,
  type KidsEndingData,
  type KidsEndCardData,
} from "@automation/remotion-templates";

// ─── Images — consistent monarch butterfly imagery from Unsplash (free license) ──

const IMG = {
  butterflyOnFlower: "https://images.unsplash.com/photo-1563800588844-9d137052f74b?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  caterpillarOnLeaf: "https://images.unsplash.com/photo-1661179478811-238457f5035c?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  caterpillarOnStem: "https://images.unsplash.com/photo-1566231186625-ae1fcf4e73a0?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  greenChrysalis: "https://images.unsplash.com/photo-1634607706204-3cc5bda4363b?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  butterflyOnZinnia: "https://images.unsplash.com/photo-1601328304599-c03d52d1cb3f?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  butterflyInMeadow: "https://images.unsplash.com/photo-1748873353674-b12743b87006?fm=jpg&q=80&w=1080&auto=format&fit=crop",
  butterfliesOnFlowers: "https://images.unsplash.com/photo-1741025985858-aaa9663a28a0?fm=jpg&q=80&w=1080&auto=format&fit=crop",
};

// ─── Scene data — complete butterfly metamorphosis story ─────────────────────

const titleData: KidsTitleCardData = {
  title: "The Butterfly Journey!",
  subtitle: "How a caterpillar becomes a butterfly",
  hook: "Have you ever wondered how butterflies get their wings?",
  label: "NATURE STORY!",
  imageUrl: IMG.butterflyOnFlower,
  imageAlt: "A beautiful monarch butterfly resting on a purple flower",
  imageTreatment: "vivid",
};

const eggCaterpillarData: KidsImageRevealData = {
  caption: "It starts with a tiny egg on a leaf...",
  label: "THE BEGINNING",
  footer: "Stage 1: The Egg",
  imageUrl: IMG.caterpillarOnLeaf,
  imageAlt: "A monarch caterpillar on a green leaf",
  imageTreatment: "bright",
};

const funFactData: KidsFunFactData = {
  fact: "A caterpillar can grow 100 times bigger than when it was born!",
  highlight: "Did you know?",
  label: "FUN FACT!",
  footer: "Stage 2: The Caterpillar",
  imageUrl: IMG.caterpillarOnStem,
  imageAlt: "A caterpillar resting on a green plant stem",
  imageTreatment: "vivid",
};

const questionData: KidsQuestionData = {
  question: "What happens next?",
  context: "The caterpillar has eaten enough. Now comes the most amazing part!",
  label: "QUESTION!",
  footer: "The Big Mystery",
  imageUrl: IMG.greenChrysalis,
  imageAlt: "A green monarch butterfly chrysalis",
  imageTreatment: "bright",
};

const timelineData: KidsTimelineData = {
  title: "The Amazing Transformation",
  steps: [
    { label: "Stage 1", title: "Egg", detail: "A tiny egg on a leaf." },
    { label: "Stage 2", title: "Caterpillar", detail: "It eats and grows, eating and eating!" },
    { label: "Stage 3", title: "Chrysalis", detail: "It wraps up and transforms inside." },
    { label: "Stage 4", title: "Butterfly", detail: "A beautiful butterfly emerges!" },
  ],
  label2: "METAMORPHOSIS!",
  footer: "4 Stages of Change",
  imageUrl: IMG.greenChrysalis,
  imageAlt: "A green chrysalis where the transformation happens",
  imageTreatment: "bright",
};

const numberStatData: KidsNumberStatData = {
  value: 4,
  label: "Stages of metamorphosis",
  context: "Egg, caterpillar, chrysalis, butterfly — nature's most amazing transformation!",
  label2: "AMAZING!",
  footer: "From crawling to flying",
  imageUrl: IMG.butterflyOnZinnia,
  imageAlt: "A monarch butterfly on a bright zinnia flower",
  imageTreatment: "vivid",
};

const endingData: KidsEndingData = {
  message: "The butterfly flies off to sip nectar and start the journey again!",
  encouragement: "What will you discover in nature today?",
  label: "THE END!",
  imageUrl: IMG.butterflyInMeadow,
  imageAlt: "A butterfly landing on a colorful flower in a sunny meadow",
  imageTreatment: "bright",
};

const endCardData: KidsEndCardData = {
  cta: "Subscribe for more nature stories!",
  channelName: "KidsNatureStories",
  finalQuestion: "What's your favorite animal?",
  imageUrl: IMG.butterfliesOnFlowers,
  imageAlt: "Butterflies resting on vibrant purple flowers",
  imageTreatment: "vivid",
};

// ─── Scene durations (frames at 30fps, derived from TTS timing) ──────────────

const FPS = 30;
const SCENES = [
  { frames: Math.round(7.225 * FPS) },   // title
  { frames: Math.round(6.55 * FPS) },    // egg-caterpillar
  { frames: Math.round(8.85 * FPS) },    // fun-fact
  { frames: Math.round(4.1 * FPS) },     // question
  { frames: Math.round(13.35 * FPS) },   // timeline
  { frames: Math.round(6.225 * FPS) },   // number-stat
  { frames: Math.round(8.1 * FPS) },     // ending
  { frames: Math.round(4.0 * FPS) },     // end-card
];

export const TOTAL_FRAMES = SCENES.reduce((sum, s) => sum + s.frames, 0);

// ─── Composition ────────────────────────────────────────────────────────────

export const ButterflyStory: React.FC = () => {
  loadKidsFonts();

  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* Audio track — mixed narration + background music */}
      <Audio src={staticFile("butterfly-story-audio.wav")} />

      <Series>
        <Series.Sequence durationInFrames={SCENES[0]!.frames}>
          <KidsTitleCard data={titleData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[1]!.frames}>
          <KidsImageReveal data={eggCaterpillarData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[2]!.frames}>
          <KidsFunFact data={funFactData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[3]!.frames}>
          <KidsQuestion data={questionData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[4]!.frames}>
          <KidsTimeline data={timelineData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[5]!.frames}>
          <KidsNumberStat data={numberStatData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[6]!.frames}>
          <KidsEnding data={endingData} theme={kidsTheme} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES[7]!.frames}>
          <KidsEndCard data={endCardData} theme={kidsTheme} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
