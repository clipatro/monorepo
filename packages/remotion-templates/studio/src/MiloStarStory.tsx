/**
 * Milo and the Little Star — Cinematic Remotion composition.
 *
 * A complete children's animated story video with:
 * - Full-bleed storybook illustrations (Gemini-generated, consistent style)
 * - Kokoro TTS narration (af_heart voice) + background music
 * - Text integrated as caption strips and speech bubbles (no split panels)
 * - Gentle Ken Burns effects with varied pan/zoom per scene
 * - Warm custom theme matching the storybook aesthetic
 * - Scene timing matched to narration audio segments
 * - Cinematic crossfade transitions between scenes
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import {
  KidsSceneCanvas,
  KidsCaptionStrip,
  KidsSpeechBubble,
  loadKidsFonts,
  createTheme,
  type ThemeConfig,
} from "@automation/remotion-templates";

// ─── Warm storybook theme — golden, cozy, dreamy ────────────────────────────

const storybookTheme: ThemeConfig = createTheme("sunset", {
  name: "storybook-warm",
  bg: {
    base: "#1a0f0a",
    surface: "#2a1810",
    elevated: "#3a2418",
  },
  glass: {
    bg: "rgba(255, 220, 150, 0.08)",
    border: "rgba(255, 200, 120, 0.15)",
    highlight: "rgba(255, 220, 150, 0.12)",
  },
  text: {
    bright: "#fff8e7",
    mid: "#e8d5b0",
    dim: "#b8a080",
  },
  accents: {
    primary: "#ffc857",
    primaryDeep: "#e8a830",
    secondary: "#ff9b6a",
    tertiary: "#7dd3c0",
    success: "#7dd3c0",
    warning: "#ffc857",
    danger: "#ff6b6b",
  },
  chartColors: ["#ffc857", "#ff9b6a", "#7dd3c0", "#f4a261"],
  fonts: {
    display: "'Fredoka', 'Comic Sans MS', sans-serif",
    serif: "'Nunito', 'Segoe UI', sans-serif",
    sans: "'Nunito', 'Segoe UI', sans-serif",
    mono: "'Nunito', monospace",
  },
});

// ─── Scene definitions — timing from TTS audio ──────────────────────────────

const FPS = 30;

interface SceneDef {
  id: string;
  image: string;
  narration: string;
  caption: string;
  durationFrames: number;
  kenBurns: "in" | "out";
  kenBurnsPan: "left" | "right" | "up" | "down" | "none";
  zoomIntensity: number;
  scrim: "none" | "top" | "bottom" | "both" | "full";
  scrimStrength: number;
  imageTreatment: "bright" | "vivid" | "soft" | "clean";
  label?: string;
  captionVariant?: "white" | "accent" | "coral" | "mint";
  captionPosition?: "top" | "center" | "bottom";
  speechBubble?: {
    text: string;
    variant?: "accent" | "white" | "coral" | "mint" | "sunshine";
    speaker?: string;
    tail?: "left" | "right" | "down" | "none";
  };
}

const scenes: SceneDef[] = [
  {
    id: "scene-1",
    image: staticFile("milo-story/scene-1.png"),
    narration: "One evening, in a cozy little town, a curious boy named Milo was playing in the forest.",
    caption: "One evening, a curious boy named Milo was playing in the forest.",
    durationFrames: Math.round(6.65 * FPS),
    kenBurns: "in",
    kenBurnsPan: "right",
    zoomIntensity: 0.15,
    scrim: "bottom",
    scrimStrength: 0.5,
    imageTreatment: "soft",
    label: "OUR STORY BEGINS",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-2",
    image: staticFile("milo-story/scene-2.png"),
    narration: "Under a big oak tree, Milo found a tiny star, dim and sad, lying in the grass.",
    caption: "Under a big oak tree, Milo found a tiny star, dim and sad.",
    durationFrames: Math.round(6.075 * FPS),
    kenBurns: "in",
    kenBurnsPan: "down",
    zoomIntensity: 0.18,
    scrim: "both",
    scrimStrength: 0.45,
    imageTreatment: "soft",
    label: "A DISCOVERY",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-3",
    image: staticFile("milo-story/scene-3.png"),
    narration: "The little star whispered, 'I lost my glow. Can you help me find my way home?'",
    caption: "",
    durationFrames: Math.round(5.625 * FPS),
    kenBurns: "in",
    kenBurnsPan: "none",
    zoomIntensity: 0.1,
    scrim: "bottom",
    scrimStrength: 0.4,
    imageTreatment: "soft",
    speechBubble: {
      text: "I lost my glow. Can you help me find my way home?",
      variant: "sunshine",
      speaker: "Little Star",
      tail: "down",
    },
  },
  {
    id: "scene-4",
    image: staticFile("milo-story/scene-4.png"),
    narration: "Milo knew they had to reach the highest hill, so they set off on a grand adventure.",
    caption: "Milo set off on a grand adventure to the highest hill.",
    durationFrames: Math.round(5.625 * FPS),
    kenBurns: "in",
    kenBurnsPan: "right",
    zoomIntensity: 0.16,
    scrim: "bottom",
    scrimStrength: 0.5,
    imageTreatment: "bright",
    label: "THE ADVENTURE BEGINS",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-5",
    image: staticFile("milo-story/scene-5.png"),
    narration: "Along the way, they met a rabbit, an owl, and a deer, all eager to help.",
    caption: "They met a rabbit, an owl, and a deer — all eager to help!",
    durationFrames: Math.round(5.35 * FPS),
    kenBurns: "in",
    kenBurnsPan: "left",
    zoomIntensity: 0.14,
    scrim: "bottom",
    scrimStrength: 0.5,
    imageTreatment: "bright",
    label: "NEW FRIENDS",
    captionVariant: "accent",
    captionPosition: "bottom",
  },
  {
    id: "scene-6",
    image: staticFile("milo-story/scene-6.png"),
    narration: "Together, they climbed the hill, and the star's glow grew stronger with every step.",
    caption: "Together they climbed, and the star's glow grew stronger.",
    durationFrames: Math.round(5.6 * FPS),
    kenBurns: "in",
    kenBurnsPan: "up",
    zoomIntensity: 0.17,
    scrim: "bottom",
    scrimStrength: 0.5,
    imageTreatment: "vivid",
    label: "COURAGE & TEAMWORK",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-7",
    image: staticFile("milo-story/scene-7.png"),
    narration: "At the top, Milo held the star high, and it sparkled like never before.",
    caption: "At the top, Milo held the star high — it sparkled like never before!",
    durationFrames: Math.round(5.525 * FPS),
    kenBurns: "out",
    kenBurnsPan: "none",
    zoomIntensity: 0.2,
    scrim: "both",
    scrimStrength: 0.4,
    imageTreatment: "vivid",
    label: "THE MAGIC MOMENT",
    captionVariant: "accent",
    captionPosition: "top",
  },
  {
    id: "scene-8",
    image: staticFile("milo-story/scene-8.png"),
    narration: "With a gentle whoosh, the star flew back to the sky, leaving a trail of sparkles.",
    caption: "With a gentle whoosh, the star flew back to the sky...",
    durationFrames: Math.round(5.8 * FPS),
    kenBurns: "in",
    kenBurnsPan: "up",
    zoomIntensity: 0.22,
    scrim: "bottom",
    scrimStrength: 0.45,
    imageTreatment: "vivid",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-9",
    image: staticFile("milo-story/scene-9.png"),
    narration: "Milo smiled, knowing he had a friend in the sky forever.",
    caption: "Milo smiled, knowing he had a friend in the sky forever.",
    durationFrames: Math.round(4.5 * FPS),
    kenBurns: "in",
    kenBurnsPan: "right",
    zoomIntensity: 0.1,
    scrim: "both",
    scrimStrength: 0.5,
    imageTreatment: "soft",
    captionVariant: "white",
    captionPosition: "bottom",
  },
  {
    id: "scene-10",
    image: staticFile("milo-story/scene-10.png"),
    narration: "",
    caption: "",
    durationFrames: Math.round(4.0 * FPS),
    kenBurns: "in",
    kenBurnsPan: "none",
    zoomIntensity: 0.08,
    scrim: "full",
    scrimStrength: 0.3,
    imageTreatment: "bright",
  },
];

export const MILO_TOTAL_FRAMES = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

// ─── Individual scene component ─────────────────────────────────────────────

const StoryScene: React.FC<{ scene: SceneDef }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Gentle crossfade at the start of each scene
  const fadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Gentle fade out at the end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const sceneOpacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      <KidsSceneCanvas
        imageUrl={scene.image}
        imageAlt={`Milo story — ${scene.id}`}
        imageTreatment={scene.imageTreatment}
        kenBurns={scene.kenBurns}
        kenBurnsPan={scene.kenBurnsPan}
        zoomIntensity={scene.zoomIntensity}
        scrim={scene.scrim}
        scrimStrength={scene.scrimStrength}
        overlay="free"
        overlayPadding={48}
        label={scene.label}
        labelPosition="top-center"
        decorations={false}
        theme={storybookTheme}
      >
        {/* Caption strip for narration text (subtitles integrated into scene) */}
        {scene.caption && (
          <KidsCaptionStrip
            text={scene.caption}
            theme={storybookTheme}
            variant={scene.captionVariant ?? "white"}
            position={scene.captionPosition ?? "bottom"}
            fontSize={28}
            maxWidth={620}
            entrance="up"
            delay={6}
            style={{
              position: "absolute",
              left: 50,
              right: 50,
              ...(scene.captionPosition === "top"
                ? { top: 120 }
                : scene.captionPosition === "center"
                  ? { top: "50%", transform: "translateY(-50%)" }
                  : { bottom: 80 }),
            }}
          />
        )}

        {/* Speech bubble for the star's dialogue */}
        {scene.speechBubble && (
          <KidsSpeechBubble
            text={scene.speechBubble.text}
            theme={storybookTheme}
            variant={scene.speechBubble.variant ?? "sunshine"}
            speaker={scene.speechBubble.speaker}
            tail={scene.speechBubble.tail ?? "down"}
            fontSize={26}
            maxWidth={480}
            entrance="pop"
            delay={10}
            style={{
              position: "absolute",
              left: 120,
              top: 200,
            }}
          />
        )}

        {/* End card — subscribe CTA */}
        {scene.id === "scene-10" && (
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <div
              style={{
                fontFamily: storybookTheme.fonts.display,
                fontSize: 52,
                fontWeight: 700,
                color: storybookTheme.text.bright,
                textAlign: "center",
                textShadow: "0 4px 20px rgba(0,0,0,0.6), 0 0 40px rgba(255,200,87,0.3)",
                marginBottom: 16,
                opacity: interpolate(frame, [15, 35], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.back(1.5)),
                }),
              }}
            >
              Subscribe for
              <br />
              more stories!
            </div>
            <div
              style={{
                fontFamily: storybookTheme.fonts.sans,
                fontSize: 24,
                color: storybookTheme.accents.primary,
                fontWeight: 600,
                opacity: interpolate(frame, [30, 50], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              ✨ KidsNatureStories ✨
            </div>
          </AbsoluteFill>
        )}
      </KidsSceneCanvas>
    </AbsoluteFill>
  );
};

// ─── Main composition ───────────────────────────────────────────────────────

export const MiloStarStory: React.FC = () => {
  loadKidsFonts();

  return (
    <AbsoluteFill style={{ background: "#1a0f0a" }}>
      {/* Audio track — mixed narration + background music */}
      <Audio src={staticFile("milo-story-audio.wav")} />

      <Series>
        {scenes.map((scene) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={scene.durationFrames}
          >
            <StoryScene scene={scene} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
