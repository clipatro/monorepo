/**
 * FFmpeg-based vertical video renderer.
 *
 * Replaces the HyperFrames renderer. Produces the same composition:
 *   - Top half (1080×960): scene images with Ken Burns zoom + crossfade transitions
 *   - Bottom half (1080×960): continuous muted gameplay video (fill/crop, no letterbox)
 *   - Divider line at the seam
 *   - Fade in (0–1.2s) + fade out (last 1.3s)
 *   - Voiceover as primary audio (EBU R128 normalized)
 *
 * GPU acceleration: auto-detects NVIDIA NVENC + CUDA. Uses h264_nvenc for
 * encoding and hwupload_cuda/scale_cuda for gameplay scaling when available.
 * Falls back to libx264 (CPU) if no GPU is detected.
 *
 * Ported from spikes/s14-ffmpeg-video.ts (4.0x faster than HyperFrames).
 */

import { join } from "node:path";
import { mkdir, rm, access } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function runCmd(
  cmd: string,
  opts?: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, ...opts });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// === GPU detection ===

interface GpuSupport {
  nvenc: boolean; // h264_nvenc encoder available
  cuda: boolean; // CUDA scale/hwupload filters available
}

async function detectGpu(): Promise<GpuSupport> {
  const support: GpuSupport = { nvenc: false, cuda: false };
  try {
    const { stdout } = await runCmd("ffmpeg -encoders 2>&1");
    support.nvenc = /h264_nvenc/.test(stdout);
  } catch {
    /* ignore */
  }
  try {
    const { stdout } = await runCmd("ffmpeg -filters 2>&1");
    support.cuda = /scale_cuda/.test(stdout) && /hwupload_cuda/.test(stdout);
  } catch {
    /* ignore */
  }

  // Verify NVENC actually works (not just listed — driver could be missing)
  if (support.nvenc) {
    try {
      await runCmd(
        `ffmpeg -y -f lavfi -i testsrc=duration=0.1:size=320x240:rate=30 ` +
          `-c:v h264_nvenc -preset p1 -f mp4 /dev/null 2>&1`,
        { timeout: 10000 },
      );
    } catch {
      support.nvenc = false;
    }
  }

  return support;
}

// === Composition constants (defaults — overridable by template config, D017) ===

const DEFAULT_FPS = 60;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_TOP_HEIGHT = 960;
const DEFAULT_XFADE_DUR = 0.6; // crossfade duration (matches HyperFrames overlap)
const DEFAULT_FADE_IN_DUR = 1.2;
const DEFAULT_FADE_OUT_DUR = 1.3;

// Ken Burns variants — match the HyperFrames composition
const KB_VARIANTS = [
  { zStart: 1.0, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, center
  { zStart: 1.12, zEnd: 1.0, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)" }, // zoom out, center
  { zStart: 1.05, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)-on*20", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, pan right
  { zStart: 1.05, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)+on*20", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, pan left
  { zStart: 1.08, zEnd: 1.0, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)+on*15" }, // zoom out, pan down
];

// === Types ===

export interface RenderScene {
  index: number;
  imageFile: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface RenderInput {
  /** Directory containing manifest.json, scene images, gameplay file, voiceover.wav */
  exportDir: string;
  /** Path to the already-normalized voiceover WAV */
  voiceoverPath: string;
  /** Total video duration in seconds */
  totalDuration: number;
  /** Scene entries (image + timing) */
  scenes: RenderScene[];
  /** Gameplay video filename (relative to exportDir) */
  gameplayFile: string;
  /** Working directory for intermediate files */
  workDir: string;
  /** Final output MP4 path */
  outputPath: string;
  /** D017: Optional template-derived render params (overrides defaults) */
  templateParams?: RenderParams;
  /** Optional logger */
  log?: (msg: string) => void;
}

/**
 * D017: Template-derived render parameters. Extracted from the template config
 * so the renderer reads layout/render settings from the template instead of
 * hardcoded constants.
 */
export interface RenderParams {
  fps: number;
  width: number;
  height: number;
  topHeight: number;
  xfadeDur: number;
  fadeInDur: number;
  fadeOutDur: number;
  kenBurnsVariants: number;
  dividerY?: number;
  dividerHeight?: number;
  dividerColor?: string;
}

/** Clip render input — for the ai-video-clips template (no gameplay, no images). */
export interface ClipRenderInput {
  /** Directory containing the clip files + voiceover. */
  exportDir: string;
  /** Path to the already-normalized voiceover WAV (null if no voiceover). */
  voiceoverPath: string | null;
  /** Total video duration in seconds. */
  totalDuration: number;
  /** Clip entries (file + timing). */
  clips: Array<{ index: number; clipFile: string; durationSec: number }>;
  /** Working directory for intermediate files. */
  workDir: string;
  /** Final output MP4 path. */
  outputPath: string;
  /** D017: Template-derived render params. */
  templateParams: RenderParams;
  /** Optional logger. */
  log?: (msg: string) => void;
}

export interface RenderResult {
  success: boolean;
  outputPath: string;
  durationSec: number;
  fps: string;
  sizeBytes: number;
  width: number;
  height: number;
  codec: string;
  gpuUsed: boolean;
  error?: string;
  log?: string;
}

// === Main render function ===

export async function renderVideo(input: RenderInput): Promise<RenderResult> {
  const log = input.log ?? (() => {});
  const logBuf: string[] = [];
  const pushLog = (msg: string) => {
    logBuf.push(msg);
    log(msg);
  };

  const { exportDir, voiceoverPath, totalDuration, scenes, gameplayFile, workDir, outputPath } = input;

  // D017: Use template-derived params if provided, otherwise defaults
  const tp = input.templateParams;
  const FPS = tp?.fps ?? DEFAULT_FPS;
  const WIDTH = tp?.width ?? DEFAULT_WIDTH;
  const HEIGHT = tp?.height ?? DEFAULT_HEIGHT;
  const TOP_HEIGHT = tp?.topHeight ?? DEFAULT_TOP_HEIGHT;
  const XFADE_DUR = tp?.xfadeDur ?? DEFAULT_XFADE_DUR;
  const FADE_IN_DUR = tp?.fadeInDur ?? DEFAULT_FADE_IN_DUR;
  const FADE_OUT_DUR = tp?.fadeOutDur ?? DEFAULT_FADE_OUT_DUR;
  const kbVariants = tp?.kenBurnsVariants ? KB_VARIANTS.slice(0, Math.min(tp.kenBurnsVariants, KB_VARIANTS.length)) : KB_VARIANTS;

  // Detect GPU capabilities
  pushLog("Detecting GPU support...");
  const gpu = await detectGpu();
  const useGpu = gpu.nvenc;
  pushLog(`  NVENC: ${gpu.nvenc ? "yes (h264_nvenc)" : "no"}`);
  pushLog(`  CUDA:  ${gpu.cuda ? "yes (scale_cuda)" : "no"}`);
  pushLog(`  Mode:  ${useGpu ? "GPU-accelerated" : "CPU-only"}`);

  // Encoder settings
  const encOpts = useGpu
    ? `-c:v h264_nvenc -preset p4 -tune hq -rc vbr -cq 20 -maxrate 12M -bufsize 24M -pix_fmt yuv420p`
    : `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p`;
  const encOptsInter = useGpu
    ? `-c:v h264_nvenc -preset p1 -tune hq -rc vbr -cq 24 -maxrate 8M -bufsize 16M -pix_fmt yuv420p`
    : `-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p`;

  pushLog(`\nFFmpeg render: ${useGpu ? "GPU (NVENC + CUDA)" : "CPU (libx264)"}`);
  pushLog(`  Export dir: ${exportDir}`);
  pushLog(`  Output:     ${outputPath}`);
  pushLog(`  Duration:   ${totalDuration.toFixed(2)}s`);
  pushLog(`  Scenes:     ${scenes.length}`);
  pushLog(`  FPS:        ${FPS}`);
  pushLog(`  Resolution: ${WIDTH}x${HEIGHT}`);

  // Prepare intermediate clips directory (subdirectory of workDir so we don't
  // clobber the normalized voiceover that the caller placed in workDir).
  const clipsDir = join(workDir, "clips");
  await rm(clipsDir, { recursive: true, force: true });
  await mkdir(clipsDir, { recursive: true });

  try {
    // 1. Render each scene as a Ken Burns clip
    pushLog("\nRendering Ken Burns scene clips...");
    const sceneClips: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i]!;
      const kb = kbVariants[i % kbVariants.length]!;
      const clipPath = join(clipsDir, `scene-${String(i + 1).padStart(2, "0")}.mp4`);
      sceneClips.push(clipPath);

      const totalFrames = Math.round(s.durationSec * FPS);
      const zExpr = `'${kb.zStart}+(${kb.zEnd - kb.zStart})*on/${totalFrames}'`;
      const xExpr = `'${kb.xExpr}'`;
      const yExpr = `'${kb.yExpr}'`;

      const t1 = Date.now();
      const cmd =
        `ffmpeg -y -loop 1 -t ${s.durationSec} -i "${join(exportDir, s.imageFile)}" ` +
        `-filter_complex "` +
        `scale=${WIDTH * 2}:-1,` +
        `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=${totalFrames}:s=${WIDTH}x${TOP_HEIGHT}:fps=${FPS},` +
        `format=yuv420p` +
        `" ` +
        `${encOptsInter} -t ${s.durationSec} "${clipPath}" 2>&1`;

      await runCmd(cmd, { timeout: 120000 });
      pushLog(
        `  Scene ${i + 1}/${scenes.length}: ${s.durationSec.toFixed(2)}s clip → ${((Date.now() - t1) / 1000).toFixed(1)}s`,
      );
    }

    // 2. Crossfade scene clips together with xfade
    pushLog("\nCrossfading scene clips...");
    const sceneTimelinePath = join(clipsDir, "scene-timeline.mp4");
    const t2 = Date.now();

    // Track the actual scene timeline duration (xfade overlaps reduce it)
    let sceneTimelineDuration: number;

    if (sceneClips.length === 1) {
      sceneTimelineDuration = scenes[0]!.durationSec;
      await runCmd(`ffmpeg -y -i "${sceneClips[0]}" -c copy "${sceneTimelinePath}" 2>&1`, { timeout: 30000 });
    } else {
      const inputs = sceneClips.map((c) => `-i "${c}"`).join(" ");
      const filters: string[] = [];
      let prevLabel = "0:v";
      let cumulativeDur = scenes[0]!.durationSec;

      for (let i = 1; i < sceneClips.length; i++) {
        const offset = cumulativeDur - XFADE_DUR;
        const outLabel = i < sceneClips.length - 1 ? `v${i}` : "vout";
        filters.push(
          `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}[${outLabel}]`,
        );
        prevLabel = outLabel;
        cumulativeDur = offset + scenes[i]!.durationSec;
      }
      sceneTimelineDuration = cumulativeDur;

      const filterComplex = filters.join(";");
      const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" ${encOptsInter} "${sceneTimelinePath}" 2>&1`;
      await runCmd(cmd, { timeout: 120000 });
    }
    pushLog(`  Scene timeline → ${((Date.now() - t2) / 1000).toFixed(1)}s (${sceneTimelineDuration.toFixed(2)}s)`);

    // Scene timeline is shorter than totalDuration because xfade overlaps eat
    // (n-1)*XFADE_DUR seconds. Pad the top half with tpad (clone last frame) so
    // the last scene image stays visible until the end and fade-out applies.
    const scenePadding = Math.max(0, totalDuration - sceneTimelineDuration);
    if (scenePadding > 0.01) {
      pushLog(`  Padding scene timeline by ${scenePadding.toFixed(2)}s (clone last frame)`);
    }

    // 3. Prepare gameplay video
    const gameplaySrc = join(exportDir, gameplayFile);
    const gameplayScaled = join(clipsDir, "gameplay-scaled.mp4");
    pushLog("\nPreparing gameplay video...");
    const t3 = Date.now();

    if (gpu.cuda) {
      await runCmd(
        `ffmpeg -y -hwaccel cuda -hwaccel_output_format cuda -i "${gameplaySrc}" -t ${totalDuration} ` +
          `-vf "scale_cuda=${WIDTH}:${TOP_HEIGHT}:force_original_aspect_ratio=increase,hwdownload,format=nv12,crop=${WIDTH}:${TOP_HEIGHT},fps=${FPS},format=yuv420p" ` +
          `${encOptsInter} -an "${gameplayScaled}" 2>&1`,
        { timeout: 120000 },
      );
    } else {
      await runCmd(
        `ffmpeg -y -i "${gameplaySrc}" -t ${totalDuration} ` +
          `-vf "scale=${WIDTH}:${TOP_HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${TOP_HEIGHT},fps=${FPS},format=yuv420p" ` +
          `${encOptsInter} -an "${gameplayScaled}" 2>&1`,
        { timeout: 120000 },
      );
    }
    pushLog(`  Gameplay scaled → ${((Date.now() - t3) / 1000).toFixed(1)}s`);

    // 4. Vstack: scene timeline (top) + gameplay (bottom) + divider + fade + audio
    pushLog("\nCompositing final video (vstack + divider + fade + audio)...");
    const t4 = Date.now();
    const fadeOutStart = totalDuration - FADE_OUT_DUR;

    const finalFilter = [
      // Pad scene timeline to totalDuration (clone last frame) before fade so
      // fade-out lands within the stream's actual duration.
      `[0:v]tpad=stop_mode=clone:stop_duration=${scenePadding.toFixed(3)},fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[topfade]`,
      `[1:v]fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[botfade]`,
      `[topfade][botfade]vstack=inputs=2[stacked]`,
      `[stacked]drawbox=x=0:y=${(tp?.dividerY ?? TOP_HEIGHT - 3)}:w=${WIDTH}:h=${tp?.dividerHeight ?? 6}:color=${(tp?.dividerColor ?? "#0a0a0a").replace("#", "0x")}:t=fill[withdiv]`,
    ].join(";");

    const finalCmd =
      `ffmpeg -y ` +
      `-i "${sceneTimelinePath}" ` +
      `-i "${gameplayScaled}" ` +
      `-i "${voiceoverPath}" ` +
      `-filter_complex "${finalFilter}" ` +
      `-map "[withdiv]" -map 2:a ` +
      `${encOpts} ` +
      `-c:a aac -b:a 192k ` +
      `-t ${totalDuration} ` +
      `-movflags +faststart ` +
      `"${outputPath}" 2>&1`;

    await runCmd(finalCmd, { timeout: 300000 });
    pushLog(`  Final composite → ${((Date.now() - t4) / 1000).toFixed(1)}s`);

    // 5. Probe the output
    const success = await exists(outputPath);
    if (!success) {
      return {
        success: false,
        outputPath,
        durationSec: 0,
        fps: "",
        sizeBytes: 0,
        width: 0,
        height: 0,
        codec: "",
        gpuUsed: useGpu,
        error: "Render produced no output file",
        log: logBuf.join("\n"),
      };
    }

    let durationSec = 0;
    let fps = "";
    let sizeBytes = 0;
    let width = 0;
    let height = 0;
    let codec = "";
    try {
      const { stdout: durOut } = await runCmd(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
      );
      durationSec = parseFloat(durOut.trim());
      const { stdout: sizeOut } = await runCmd(
        `ffprobe -v error -show_entries format=size -of csv=p=0 "${outputPath}"`,
      );
      sizeBytes = parseInt(sizeOut.trim(), 10);
      const { stdout: wOut } = await runCmd(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${outputPath}"`,
      );
      width = parseInt(wOut.trim(), 10);
      const { stdout: hOut } = await runCmd(
        `ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "${outputPath}"`,
      );
      height = parseInt(hOut.trim(), 10);
      const { stdout: fpsOut } = await runCmd(
        `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${outputPath}"`,
      );
      fps = fpsOut.trim();
      const { stdout: codecOut } = await runCmd(
        `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${outputPath}"`,
      );
      codec = codecOut.trim();
    } catch {
      /* non-critical */
    }

    pushLog(`\nOutput: ${width}x${height}, ${durationSec.toFixed(2)}s, ${fps} fps, ${codec}, ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);

    return {
      success: true,
      outputPath,
      durationSec,
      fps,
      sizeBytes,
      width,
      height,
      codec,
      gpuUsed: useGpu,
      log: logBuf.join("\n"),
    };
  } catch (e: any) {
    const errDetail = e?.stderr ?? e?.stdout ?? e?.message ?? String(e);
    return {
      success: false,
      outputPath,
      durationSec: 0,
      fps: "",
      sizeBytes: 0,
      width: 0,
      height: 0,
      codec: "",
      gpuUsed: useGpu,
      error: errDetail,
      log: logBuf.join("\n"),
    };
  }
}

// === Clip-based render (ai-video-clips template, D017) ===

/**
 * Render a video from AI-generated clips (no images, no gameplay).
 *
 * Stitches per-scene video clips with crossfade transitions, applies fade
 * in/out, and optionally mixes in a voiceover audio track. This is the
 * render path for the `ai-video-clips` template.
 */
export async function renderClipsVideo(input: ClipRenderInput): Promise<RenderResult> {
  const log = input.log ?? (() => {});
  const logBuf: string[] = [];
  const pushLog = (msg: string) => {
    logBuf.push(msg);
    log(msg);
  };

  const { exportDir, voiceoverPath, totalDuration, clips, workDir, outputPath, templateParams: tp } = input;

  const FPS = tp.fps;
  const WIDTH = tp.width;
  const HEIGHT = tp.height;
  const XFADE_DUR = tp.xfadeDur;
  const FADE_IN_DUR = tp.fadeInDur;
  const FADE_OUT_DUR = tp.fadeOutDur;

  // Detect GPU capabilities
  pushLog("Detecting GPU support...");
  const gpu = await detectGpu();
  const useGpu = gpu.nvenc;
  pushLog(`  NVENC: ${gpu.nvenc ? "yes" : "no"}, CUDA: ${gpu.cuda ? "yes" : "no"}`);

  const encOpts = useGpu
    ? `-c:v h264_nvenc -preset p4 -tune hq -rc vbr -cq 20 -maxrate 12M -bufsize 24M -pix_fmt yuv420p`
    : `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p`;
  const encOptsInter = useGpu
    ? `-c:v h264_nvenc -preset p1 -tune hq -rc vbr -cq 24 -maxrate 8M -bufsize 16M -pix_fmt yuv420p`
    : `-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p`;

  pushLog(`\nFFmpeg clip render: ${useGpu ? "GPU" : "CPU"}`);
  pushLog(`  Clips: ${clips.length}, Duration: ${totalDuration.toFixed(2)}s, ${WIDTH}x${HEIGHT}@${FPS}fps`);

  const clipsDir = join(workDir, "clips");
  await rm(clipsDir, { recursive: true, force: true });
  await mkdir(clipsDir, { recursive: true });

  try {
    // 1. Scale/normalize each clip to target resolution + fps
    pushLog("\nNormalizing clips...");
    const scaledClips: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i]!;
      const srcPath = join(exportDir, c.clipFile);
      const scaledPath = join(clipsDir, `clip-${String(i + 1).padStart(2, "0")}.mp4`);
      scaledClips.push(scaledPath);

      await runCmd(
        `ffmpeg -y -i "${srcPath}" ` +
          `-vf "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p" ` +
          `${encOptsInter} -an "${scaledPath}" 2>&1`,
        { timeout: 120000 },
      );
      pushLog(`  Clip ${i + 1}/${clips.length}: ${c.durationSec.toFixed(2)}s normalized`);
    }

    // 2. Crossfade clips together
    pushLog("\nCrossfading clips...");
    const timelinePath = join(clipsDir, "clip-timeline.mp4");
    let timelineDuration: number;

    if (scaledClips.length === 1) {
      timelineDuration = clips[0]!.durationSec;
      await runCmd(`ffmpeg -y -i "${scaledClips[0]}" -c copy "${timelinePath}" 2>&1`, { timeout: 30000 });
    } else {
      const inputs = scaledClips.map((c) => `-i "${c}"`).join(" ");
      const filters: string[] = [];
      let prevLabel = "0:v";
      let cumulativeDur = clips[0]!.durationSec;

      for (let i = 1; i < scaledClips.length; i++) {
        const offset = cumulativeDur - XFADE_DUR;
        const outLabel = i < scaledClips.length - 1 ? `v${i}` : "vout";
        filters.push(
          `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}[${outLabel}]`,
        );
        prevLabel = outLabel;
        cumulativeDur = offset + clips[i]!.durationSec;
      }
      timelineDuration = cumulativeDur;

      const filterComplex = filters.join(";");
      await runCmd(
        `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" ${encOptsInter} "${timelinePath}" 2>&1`,
        { timeout: 120000 },
      );
    }
    pushLog(`  Timeline → ${timelineDuration.toFixed(2)}s`);

    // Pad timeline to totalDuration (clone last frame)
    const padding = Math.max(0, totalDuration - timelineDuration);
    if (padding > 0.01) {
      pushLog(`  Padding timeline by ${padding.toFixed(2)}s`);
    }

    // 3. Composite: pad + fade + optional audio
    pushLog("\nCompositing final video...");
    const fadeOutStart = totalDuration - FADE_OUT_DUR;

    if (voiceoverPath) {
      // With voiceover
      const filter = [
        `[0:v]tpad=stop_mode=clone:stop_duration=${padding.toFixed(3)},fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[v]`,
      ].join(";");

      await runCmd(
        `ffmpeg -y -i "${timelinePath}" -i "${voiceoverPath}" ` +
          `-filter_complex "${filter}" -map "[v]" -map 1:a ` +
          `${encOpts} -c:a aac -b:a 192k -t ${totalDuration} -movflags +faststart "${outputPath}" 2>&1`,
        { timeout: 300000 },
      );
    } else {
      // No voiceover — video only
      const filter = [
        `[0:v]tpad=stop_mode=clone:stop_duration=${padding.toFixed(3)},fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[v]`,
      ].join(";");

      await runCmd(
        `ffmpeg -y -i "${timelinePath}" ` +
          `-filter_complex "${filter}" -map "[v]" ` +
          `${encOpts} -t ${totalDuration} -movflags +faststart "${outputPath}" 2>&1`,
        { timeout: 300000 },
      );
    }
    pushLog("  Final composite done");

    // 4. Probe output
    const success = await exists(outputPath);
    if (!success) {
      return { success: false, outputPath, durationSec: 0, fps: "", sizeBytes: 0, width: 0, height: 0, codec: "", gpuUsed: useGpu, error: "Render produced no output file", log: logBuf.join("\n") };
    }

    let durationSec = 0, fps = "", sizeBytes = 0, width = 0, height = 0, codec = "";
    try {
      const probe = async (args: string) => (await runCmd(`ffprobe -v error ${args} "${outputPath}"`)).stdout.trim();
      durationSec = parseFloat(await probe("-show_entries format=duration -of csv=p=0"));
      sizeBytes = parseInt(await probe("-show_entries format=size -of csv=p=0"), 10);
      width = parseInt(await probe("-select_streams v:0 -show_entries stream=width -of csv=p=0"), 10);
      height = parseInt(await probe("-select_streams v:0 -show_entries stream=height -of csv=p=0"), 10);
      fps = await probe("-select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0");
      codec = await probe("-select_streams v:0 -show_entries stream=codec_name -of csv=p=0");
    } catch { /* non-critical */ }

    pushLog(`\nOutput: ${width}x${height}, ${durationSec.toFixed(2)}s, ${fps} fps, ${codec}, ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);

    return { success: true, outputPath, durationSec, fps, sizeBytes, width, height, codec, gpuUsed: useGpu, log: logBuf.join("\n") };
  } catch (e: any) {
    const errDetail = e?.stderr ?? e?.stdout ?? e?.message ?? String(e);
    return { success: false, outputPath, durationSec: 0, fps: "", sizeBytes: 0, width: 0, height: 0, codec: "", gpuUsed: useGpu, error: errDetail, log: logBuf.join("\n") };
  }
}

// === Helper: extract RenderParams from a TemplateConfig (D017) ===

import type { TemplateConfig } from "@automation/contracts";

export function templateToRenderParams(config: TemplateConfig): RenderParams {
  const layout = config.layout;
  // Find the top region (for image-sequence templates) or use the full region
  const topRegion = layout.regions.find((r) => r.slot === "top");
  const fullRegion = layout.regions.find((r) => r.slot === "full");
  const topHeight = topRegion?.height ?? fullRegion?.height ?? layout.height;

  // Find the image-sequence region for transition duration
  const imageSeqRegion = layout.regions.find((r) => r.type === "image-sequence");
  const videoSeqRegion = layout.regions.find((r) => r.type === "video-sequence");
  const xfadeDur = imageSeqRegion?.transitionDuration ?? videoSeqRegion?.transitionDuration ?? DEFAULT_XFADE_DUR;

  return {
    fps: config.render.fps,
    width: layout.width,
    height: layout.height,
    topHeight,
    xfadeDur,
    fadeInDur: layout.fadeIn.duration,
    fadeOutDur: layout.fadeOut.duration,
    kenBurnsVariants: config.render.kenBurnsVariants ?? KB_VARIANTS.length,
    dividerY: layout.divider?.y,
    dividerHeight: layout.divider?.height,
    dividerColor: layout.divider?.color,
  };
}
