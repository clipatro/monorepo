/**
 * S23 kids video — Remotion composition generator.
 *
 * Generates a render.tsx entry point that uses the kids namespace components
 * from @automation/remotion-templates, plus a composition-config.json. The
 * generated render.tsx imports all 10 kids components, loads kids fonts,
 * and renders each timed scene as a Remotion <Sequence> with the appropriate
 * kids component and data. A single <Audio> track plays the mixed narration
 * + background music.
 *
 * Reuses the S22 composition generation pattern (staticFile for images/audio,
 * SceneRenderer switch on slug).
 */

import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { SceneTimingPlan, TimedScene } from "./timing.ts";
import type { SourcedImage } from "./images.ts";
import type { MusicSyncOutput } from "./music.ts";

export interface CompositionOutput {
  renderEntryPath: string;
  configPath: string;
  compositionId: string;
  publicDir: string;
  costUsd: number;
}

// === Render entry code generation ===

function generateKidsRenderEntry(plan: SceneTimingPlan): string {
  const scenes = plan.scenes;

  const sceneRenders = scenes
    .map((s) => {
      const dataStr = JSON.stringify(s.data);
      const imageProp = s.imageUrl ? `imageUrl={staticFile("${s.imageUrl}")}` : "";
      const treatmentProp = s.imageTreatment ? `imageTreatment="${s.imageTreatment}"` : "";
      return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <KidsSceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={kidsTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
    })
    .join("\n");

  return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import {
  kidsTheme,
  loadKidsFonts,
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
} from "@automation/remotion-templates";

// Load Fredoka + Nunito via @remotion/google-fonts. Idempotent.
loadKidsFonts();

const KidsSceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl
    ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment }
    : data;
  switch (slug) {
    case "kids-title-card": return <KidsTitleCard data={fullData} theme={theme} />;
    case "kids-image-reveal": return <KidsImageReveal data={fullData} theme={theme} />;
    case "kids-question": return <KidsQuestion data={fullData} theme={theme} />;
    case "kids-fun-fact": return <KidsFunFact data={fullData} theme={theme} />;
    case "kids-number-stat": return <KidsNumberStat data={fullData} theme={theme} />;
    case "kids-timeline": return <KidsTimeline data={fullData} theme={theme} />;
    case "kids-quote": return <KidsQuote data={fullData} theme={theme} />;
    case "kids-top-list": return <KidsTopList data={fullData} theme={theme} />;
    case "kids-ending": return <KidsEnding data={fullData} theme={theme} />;
    case "kids-end-card": return <KidsEndCard data={fullData} theme={theme} />;
    default: return (
      <AbsoluteFill style={{ background: "#4FC3F7", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a2e" }}>
        <p>Unknown kids component: {slug}</p>
      </AbsoluteFill>
    );
  }
};

const KidsVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#4FC3F7" }}>
${sceneRenders}
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="KidsVideo" component={KidsVideo} durationInFrames={${plan.totalFrames}} fps={${plan.fps}} width={${plan.width}} height={${plan.height}} />
);

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
}

// === Main composition generation function ===

export async function generateComposition(
  plan: SceneTimingPlan,
  images: SourcedImage[],
  musicSync: MusicSyncOutput,
  outDir: string,
): Promise<CompositionOutput> {
  // Build image map: sceneOrder -> relative path
  const imageMap: Record<number, string> = {};
  for (const img of images) {
    imageMap[img.sceneOrder] = img.relativePath;
  }

  // Write composition config
  const config = {
    fps: plan.fps,
    width: plan.width,
    height: plan.height,
    totalFrames: plan.totalFrames,
    totalSeconds: plan.totalSeconds,
    theme: "kids-bright",
    scenes: plan.scenes.map((s) => ({
      order: s.order,
      componentSlug: s.componentSlug,
      data: s.data,
      imageUrl: s.imageUrl,
      imageTreatment: s.imageTreatment,
      narrationSegment: s.narrationSegment,
      startFrame: s.startFrame,
      durationFrames: s.durationFrames,
      endFrame: s.endFrame,
      durationSeconds: s.durationSeconds,
    })),
    audioFile: "mixed-audio.wav",
  };
  const configPath = join(outDir, "composition-config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));

  // Generate render.tsx
  const renderEntryPath = join(outDir, "render.tsx");
  const componentCode = generateKidsRenderEntry(plan);
  await writeFile(renderEntryPath, componentCode);

  // Copy assets to public dir
  const publicDir = join(outDir, "public");
  await mkdir(publicDir, { recursive: true });
  await copyFile(musicSync.mixedAudioPath, join(publicDir, "mixed-audio.wav"));

  const imagesPublicDir = join(publicDir, "images");
  await mkdir(imagesPublicDir, { recursive: true });
  for (const img of images) {
    const filename = img.relativePath.split("/").pop()!;
    await copyFile(img.absolutePath, join(imagesPublicDir, filename));
  }

  const compositionId = "KidsVideo";
  return { renderEntryPath, configPath, compositionId, publicDir, costUsd: 0 };
}
