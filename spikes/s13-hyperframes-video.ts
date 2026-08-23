/**
 * S13 — HyperFrames vertical video assembly (reusable).
 *
 * Goal: Prove that a Clipatro export folder (manifest.json + scene-timeline.csv +
 * scene images + gameplay video + voiceover) can be turned into a production-ready
 * 9:16 vertical video with HyperFrames — top half animated scene images, bottom half
 * continuous gameplay, normalized voiceover audio, fade in/out, 60fps render.
 *
 * No captions (this spike focuses on the visual + audio pipeline).
 *
 * Reusable: pass an export dir path as the first arg, or default to data/sample/.
 *   bun run spikes/run.ts s13 [path/to/export/]
 *
 * The spike:
 *   1. Reads manifest.json + scene-timeline.csv from the input dir
 *   2. Normalizes the voiceover (EBU R128 + anti-AI-detection EQ/reverb/room tone)
 *   3. Creates a HyperFrames project under spikes/output/s13/<project>/
 *   4. Generates a composition HTML with Ken Burns zoom + blur crossfade transitions
 *   5. Runs hyperframes check
 *   6. Renders to MP4 at 60fps, high quality
 *   7. Returns a SpikeResult
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, copyFile, rm, access } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spikeDir, writeArtifact, type SpikeResult } from "./lib/spike.ts";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const HF_CLI = "npx --yes hyperframes@0.8.6";

async function runCmd(cmd: string, opts?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, ...opts });
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Manifest {
  version: string;
  runId: string;
  storyTitle: string;
  audio: {
    durationSec: string;
    provider: string;
    model: string;
    voiceId: string;
  };
  scenes: {
    count: number;
    images: { order: number; file: string }[];
    imageTimeline: {
      scene: number;
      imageStartSec: string;
      imageEndSec: string;
      imageDurationSec: string;
    }[];
  };
  gameplay: {
    file: string;
    durationSec: string;
    muted: boolean;
  };
}

// ─── Audio normalization ────────────────────────────────────────────────────

/**
 * Clean two-pass loudnorm only — no EQ, no reverb, no room tone.
 *   - EBU R128 target: -16 LUFS, -1.5 dBTP
 *   - Preserves the original voice character; just levels the loudness.
 */
async function normalizeVoiceover(inputPath: string, outputPath: string): Promise<{ lufs: number; truePeak: number; duration: number }> {
  const parseVal = (text: string, label: string): number => {
    const m = text.match(new RegExp(`${label}:\\s+(-?[\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };

  // First pass: measure original loudness
  const measureCmd = `ffmpeg -y -i "${inputPath}" -af loudnorm=print_format=summary -f null -`;
  let measureOut = "";
  try {
    const { stdout, stderr } = await runCmd(measureCmd);
    measureOut = stdout + stderr;
  } catch (e: any) {
    measureOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const measuredI = parseVal(measureOut, "Input Integrated");
  const measuredTP = parseVal(measureOut, "Input True Peak");
  const measuredLRA = parseVal(measureOut, "Input LRA");
  const measuredThresh = parseVal(measureOut, "Input Threshold");

  // Second pass: linear loudnorm with measured values — clean, no effects
  await runCmd(
    `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measuredI}:measured_TP=${measuredTP}:measured_LRA=${measuredLRA}:measured_thresh=${measuredThresh}:linear=true" -ar 48000 -ac 1 -c:a pcm_s16le "${outputPath}"`,
  );

  // Verify final loudness
  const verifyCmd = `ffmpeg -i "${outputPath}" -af loudnorm=print_format=summary -f null -`;
  let verifyOut = "";
  try {
    const { stdout, stderr } = await runCmd(verifyCmd);
    verifyOut = stdout + stderr;
  } catch (e: any) {
    verifyOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const finalLufs = parseVal(verifyOut, "Input Integrated");
  const finalTP = parseVal(verifyOut, "Input True Peak");
  const finalDur = await probeDuration(outputPath);

  return { lufs: finalLufs, truePeak: finalTP, duration: finalDur };
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await runCmd(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`);
  return parseFloat(stdout.trim());
}

// ─── Composition HTML generator ─────────────────────────────────────────────

interface SceneEntry {
  index: number;
  imageFile: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  // Preceding scene's end for overlap calculation
  prevEndSec: number;
}

/**
 * Generate a production-ready HyperFrames composition for a vertical 9:16 video.
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
function generateComposition(
  scenes: SceneEntry[],
  totalDuration: number,
  gameplayFile: string,
  voiceoverFile: string,
): string {
  // Ken Burns variants — cycle through for variety
  // These animate the IMG element only (scale, x, y)
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
    const s = scenes[i];
    const sceneNum = i + 1;
    const trackIndex = i + 1;
    const clipStart = i === 0 ? 0 : Math.max(0, s.startSec - overlapDur);
    const clipDur = s.endSec - clipStart;

    // Scene clip contains: wrapper (entrance/exit) > img (Ken Burns)
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

    // === Entrance/exit on the WRAPPER (opacity + blur only) ===
    // First scene: starts visible (fades in with global fade overlay)
    // Subsequent scenes: crossfade in via wrapper opacity + blur
    if (i > 0) {
      const transStart = clipStart;
      // Outgoing scene: blur out + fade out on its wrapper
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

    // === Ken Burns on the IMG (scale + x/y only) ===
    // Runs for the full scene duration — no conflict with wrapper tweens
    const kb = kbVariants[i % kbVariants.length];
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
      /* Wrapper handles entrance/exit (opacity + blur) */
      .scene-wrapper {
        position: absolute;
        inset: 0;
        will-change: opacity, filter;
      }
      /* Img handles Ken Burns (scale + pan) */
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

// ─── Main spike runner ──────────────────────────────────────────────────────

export async function run(inputDir?: string): Promise<SpikeResult> {
  const exportDir = inputDir
    ? resolve(inputDir)
    : join(PROJECT_ROOT, "data", "sample");

  console.log(`[s13] Input export dir: ${exportDir}`);

  // 1. Read manifest + timeline
  const manifestPath = join(exportDir, "manifest.json");
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const totalDuration = parseFloat(manifest.audio.durationSec);
  const storyTitle = manifest.storyTitle;

  console.log(`[s13] Story: "${storyTitle}" — ${manifest.scenes.count} scenes, ${totalDuration}s`);

  // Build scene entries from imageTimeline
  const scenes: SceneEntry[] = manifest.scenes.imageTimeline.map((t, i) => ({
    index: i,
    imageFile: manifest.scenes.images[i].file,
    startSec: parseFloat(t.imageStartSec),
    endSec: parseFloat(t.imageEndSec),
    durationSec: parseFloat(t.imageDurationSec),
    prevEndSec: i > 0 ? parseFloat(manifest.scenes.imageTimeline[i - 1].imageEndSec) : 0,
  }));

  // 2. Prepare output project dir
  const outDir = await spikeDir("s13");
  const projectDir = join(outDir, "hf-project");
  const assetsDir = join(projectDir, "assets");

  // Clean + recreate project dir
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  // 3. Stage assets
  console.log("[s13] Staging assets...");
  for (const s of scenes) {
    await copyFile(join(exportDir, s.imageFile), join(assetsDir, s.imageFile));
  }
  await copyFile(join(exportDir, manifest.gameplay.file), join(assetsDir, manifest.gameplay.file));

  // 4. Normalize voiceover
  console.log("[s13] Normalizing voiceover (loudnorm + anti-AI EQ/reverb)...");
  const voiceoverSrc = join(exportDir, "voiceover.wav");
  const voiceoverDst = join(assetsDir, "voiceover-normalized.wav");
  const audioMetrics = await normalizeVoiceover(voiceoverSrc, voiceoverDst);
  console.log(`[s13] Voiceover: ${audioMetrics.lufs} LUFS, ${audioMetrics.truePeak} dBTP, ${audioMetrics.duration}s`);

  // 5. Generate composition HTML
  console.log("[s13] Generating composition HTML...");
  const html = generateComposition(
    scenes,
    totalDuration,
    manifest.gameplay.file,
    "voiceover-normalized.wav",
  );
  await writeFile(join(projectDir, "index.html"), html, "utf-8");

  // Write minimal hyperframes.json + package.json
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
    media: { autoProxy: true },
    authoringSkill: "general-video",
  }, null, 2));
  await writeFile(join(projectDir, "package.json"), JSON.stringify({
    name: "vertical-scene-video",
    private: true,
    type: "module",
    scripts: {
      dev: `${HF_CLI} preview`,
      check: `${HF_CLI} check`,
      render: `${HF_CLI} render`,
    },
  }, null, 2));

  // 6. Run hyperframes check
  console.log("[s13] Running hyperframes check...");
  let checkPassed = false;
  let checkOutput = "";
  try {
    const { stdout, stderr } = await runCmd(
      `${HF_CLI} check "${projectDir}" 2>&1`,
      { timeout: 120000 },
    );
    checkOutput = stdout + stderr;
    checkPassed = checkOutput.includes("Check passed") || checkOutput.includes("0 error");
    console.log(`[s13] Check: ${checkPassed ? "PASSED" : "FAILED"}`);
  } catch (e: any) {
    checkOutput = e.stdout + (e.stderr ?? "");
    console.log(`[s13] Check: FAILED — ${e.message}`);
  }
  await writeArtifact("s13", "check-output.txt", checkOutput);

  if (!checkPassed) {
    return {
      id: "s13",
      name: "HyperFrames vertical video assembly",
      goal: "Turn a Clipatro export folder into a production-ready 9:16 vertical video with HyperFrames (60fps)",
      result: "fail",
      measurements: { checkPassed, sceneCount: scenes.length, totalDuration },
      notes: `hyperframes check failed. See check-output.txt. Story: "${storyTitle}"`,
      artifactPaths: [join(outDir, "check-output.txt")],
    };
  }

  // 7. Render to MP4 at 60fps with chrome-headless-shell + GPU
  console.log("[s13] Rendering to MP4 (60fps, high quality, chrome-headless-shell + GPU)...");
  const renderOutput = join(outDir, "render.mp4");
  const chromeHeadlessShellPath = join(PROJECT_ROOT, "chrome-headless-shell", "linux-154.0.8015.0", "chrome-headless-shell-linux64", "chrome-headless-shell");
  let renderSuccess = false;
  let renderOutput2 = "";
  try {
    const { stdout, stderr } = await runCmd(
      `${HF_CLI} render "${projectDir}" --fps 60 --quality high --gpu --output "${renderOutput}" 2>&1`,
      {
        timeout: 600000,
        env: { ...process.env, HYPERFRAMES_BROWSER_PATH: chromeHeadlessShellPath },
      },
    );
    renderOutput2 = stdout + stderr;
    renderSuccess = await exists(renderOutput);
    console.log(`[s13] Render: ${renderSuccess ? "SUCCESS" : "FAILED"}`);
  } catch (e: any) {
    renderOutput2 = e.stdout + (e.stderr ?? "");
    console.log(`[s13] Render: FAILED — ${e.message}`);
  }
  await writeArtifact("s13", "render-output.txt", renderOutput2);

  // 8. Verify rendered MP4
  let renderDuration = 0;
  let renderFps = "";
  let renderSize = 0;
  if (renderSuccess) {
    try {
      const { stdout: durOut } = await runCmd(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${renderOutput}"`);
      renderDuration = parseFloat(durOut.trim());
      const { stdout: fpsOut } = await runCmd(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${renderOutput}"`);
      renderFps = fpsOut.trim();
      const { stdout: sizeOut } = await runCmd(`ffprobe -v error -show_entries format=size -of csv=p=0 "${renderOutput}"`);
      renderSize = parseInt(sizeOut.trim(), 10);
    } catch {}
  }

  return {
    id: "s13",
    name: "HyperFrames vertical video assembly",
    goal: "Turn a Clipatro export folder into a production-ready 9:16 vertical video with HyperFrames (60fps)",
    result: renderSuccess ? "pass" : "partial",
    measurements: {
      checkPassed,
      sceneCount: scenes.length,
      totalDuration,
      audioLufs: audioMetrics.lufs,
      audioTruePeak: audioMetrics.truePeak,
      audioDuration: audioMetrics.duration,
      renderSuccess,
      renderDuration,
      renderFps,
      renderSizeMB: Math.round(renderSize / 1024 / 1024),
    },
    notes: renderSuccess
      ? `Rendered "${storyTitle}" — ${scenes.length} scenes, ${renderDuration}s at ${renderFps}fps. Voiceover: ${audioMetrics.lufs} LUFS.`
      : `Check passed but render failed. Story: "${storyTitle}". See render-output.txt.`,
    artifactPaths: renderSuccess
      ? [renderOutput, join(projectDir, "index.html")]
      : [join(outDir, "check-output.txt"), join(outDir, "render-output.txt"), join(projectDir, "index.html")],
  };
}
