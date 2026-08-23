/**
 * HyperFrames composition HTML generator for 9:16 vertical videos.
 *
 * Layout:
 *   - Top half (0–960px): scene images with Ken Burns zoom + crossfade transitions
 *   - Bottom half (960–1920px): continuous muted gameplay video
 *   - Solid divider at the exact seam (960px)
 *   - Fade in at start, fade out at end
 *   - Voiceover as primary audio track
 *
 * Animation architecture (no tween conflicts):
 *   - Each scene clip contains a wrapper div + img inside it
 *   - The WRAPPER handles entrance/exit (opacity + blur) — crossfade transitions
 *   - The IMG handles Ken Burns (scale + x/y) — continuous slow camera move
 *   - No two tweens ever touch the same property on the same element
 */

import type { SceneEntry } from "./types";

export function generateComposition(
  scenes: SceneEntry[],
  totalDuration: number,
  gameplayFile: string,
  voiceoverFile: string,
): string {
  const kbVariants = [
    { from: { scale: 1.0 }, to: { scale: 1.12 }, ease: "power1.inOut" },
    { from: { scale: 1.12 }, to: { scale: 1.0 }, ease: "power1.inOut" },
    { from: { scale: 1.05, x: -20 }, to: { scale: 1.12, x: 20 }, ease: "power1.inOut" },
    { from: { scale: 1.05, x: 20 }, to: { scale: 1.12, x: -20 }, ease: "power1.inOut" },
    { from: { scale: 1.08, y: -15 }, to: { scale: 1.0, y: 15 }, ease: "power1.inOut" },
  ];

  const sceneClips: string[] = [];
  const sceneAnimations: string[] = [];
  const overlapDur = 0.6;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]!;
    const sceneNum = i + 1;
    const trackIndex = i + 1;
    const clipStart = i === 0 ? 0 : Math.max(0, s.startSec - overlapDur);
    const clipDur = s.endSec - clipStart;

    sceneClips.push(`      <!-- Scene ${sceneNum} (top half, ${clipStart.toFixed(2)}s–${s.endSec.toFixed(2)}s) -->
      <div
        id="scene${sceneNum}"
        class="clip scene-clip"
        data-start="${clipStart.toFixed(2)}"
        data-duration="${clipDur.toFixed(2)}"
        data-track-index="${trackIndex}"
        data-layout-allow-overflow
      >
        <div id="scene${sceneNum}-wrapper" class="scene-wrapper">
          <img id="scene${sceneNum}-img" class="scene-img" src="assets/${s.imageFile}" alt="" />
        </div>
      </div>`);

    if (i > 0) {
      const transStart = clipStart;
      sceneAnimations.push(
        `  // Scene ${i} → Scene ${sceneNum}: crossfade at ${transStart.toFixed(2)}s
  tl.to("#scene${i}-wrapper",
    { opacity: 0, filter: "blur(12px)", duration: ${overlapDur}, ease: "power2.inOut" },
    ${transStart.toFixed(2)});
  // Incoming scene: fade in from blurred
  tl.fromTo("#scene${sceneNum}-wrapper",
    { opacity: 0, filter: "blur(12px)" },
    { opacity: 1, filter: "blur(0px)", duration: ${overlapDur}, ease: "power2.inOut" },
    ${transStart.toFixed(2)});`,
      );
    }

    const kb = kbVariants[i % kbVariants.length]!;
    const kbDuration = s.durationSec;
    const kbStart = s.startSec;
    const kbFromParts = Object.entries(kb.from).map(([k, v]) => `${k}: ${v}`).join(", ");
    const kbToParts = Object.entries(kb.to).map(([k, v]) => `${k}: ${v}`).join(", ");
    sceneAnimations.push(
      `  // Scene ${sceneNum}: Ken Burns (${kbDuration.toFixed(2)}s)
  tl.fromTo("#scene${sceneNum}-img",
    { ${kbFromParts} },
    { ${kbToParts}, duration: ${kbDuration.toFixed(2)}, ease: "${kb.ease}" },
    ${kbStart.toFixed(2)});`,
    );
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>Vertical Scene Video</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #000;
      }
      body { font-family: "Inter", system-ui, sans-serif; }

      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #0a0a0a;
      }

      /* Scene image clips (top half: 0–960px) */
      .scene-clip {
        position: absolute;
        top: 0;
        left: 0;
        width: 1080px;
        height: 960px;
        overflow: hidden;
      }
      .scene-wrapper {
        position: absolute;
        inset: 0;
        will-change: opacity, filter;
      }
      .scene-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform-origin: center center;
        will-change: transform;
      }

      /* Gameplay video (bottom half: 960–1920px) */
      #gameplay {
        position: absolute;
        top: 960px;
        left: 0;
        width: 1080px;
        height: 960px;
        object-fit: cover;
        z-index: 1;
      }

      /* Solid divider at the exact seam between top and bottom halves */
      #divider {
        position: absolute;
        top: 957px;
        left: 0;
        width: 1080px;
        height: 6px;
        background: #0a0a0a;
        z-index: 20;
        pointer-events: none;
      }

      /* Fade overlay */
      #fade-clip {
        position: absolute;
        inset: 0;
        z-index: 100;
        pointer-events: none;
      }
      #fade-overlay {
        position: absolute;
        inset: 0;
        background: #000;
        will-change: opacity;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-width="1080"
      data-height="1920"
      data-duration="${totalDuration.toFixed(2)}"
      data-fps="60"
    >
      <!-- Gameplay video (bottom half, continuous) -->
      <video
        id="gameplay"
        src="assets/${gameplayFile}"
        data-start="0"
        data-duration="${totalDuration.toFixed(2)}"
        data-track-index="0"
        muted
        playsinline
      ></video>

      <!-- Solid divider at seam -->
      <div
        id="divider"
        class="clip"
        data-start="0"
        data-duration="${totalDuration.toFixed(2)}"
        data-track-index="${scenes.length + 2}"
      ></div>

${sceneClips.join("\n\n")}

      <!-- Fade overlay (full screen) -->
      <div
        id="fade-clip"
        class="clip"
        data-start="0"
        data-duration="${totalDuration.toFixed(2)}"
        data-track-index="${scenes.length + 3}"
      >
        <div id="fade-overlay"></div>
      </div>

      <!-- Voiceover audio -->
      <audio
        id="voiceover"
        src="assets/${voiceoverFile}"
        data-start="0"
        data-duration="${totalDuration.toFixed(2)}"
        data-track-index="${scenes.length + 4}"
        data-volume="1"
      ></audio>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });

      // Fade in (0–1.2s)
      tl.fromTo("#fade-overlay",
        { opacity: 1 },
        { opacity: 0, duration: 1.2, ease: "power2.out" },
        0);

${sceneAnimations.join("\n\n")}

      // Fade out (last 1.3s)
      tl.to("#fade-overlay",
        { opacity: 1, duration: 1.3, ease: "power2.in" },
        ${(totalDuration - 1.3).toFixed(2)});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}
