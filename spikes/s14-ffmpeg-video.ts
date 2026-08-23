#!/usr/bin/env bun
/**
 * S14 — Raw FFmpeg vertical video renderer (alternative to HyperFrames).
 *
 * Reproduces the same composition as the HyperFrames renderer:
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
 * Usage:
 *   bun run spikes/s14-ffmpeg-video.ts [export-dir] [output.mp4]
 *
 * If no args, uses the default test export at /tmp/ffmpeg-spike/export.
 */

import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir, rm, copyFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_OUTPUT = join(__dirname, "output", "s14");

const execAsync = promisify(exec);

async function runCmd(cmd: string, opts?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, ...opts });
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// === GPU detection ===

interface GpuSupport {
  nvenc: boolean;   // h264_nvenc encoder available
  cuda: boolean;    // CUDA scale/hwupload filters available
}

async function detectGpu(): Promise<GpuSupport> {
  const support: GpuSupport = { nvenc: false, cuda: false };
  try {
    const { stdout } = await runCmd("ffmpeg -encoders 2>&1");
    support.nvenc = /h264_nvenc/.test(stdout);
  } catch { /* ignore */ }
  try {
    const { stdout } = await runCmd("ffmpeg -filters 2>&1");
    support.cuda = /scale_cuda/.test(stdout) && /hwupload_cuda/.test(stdout);
  } catch { /* ignore */ }

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

interface Manifest {
  audio: { durationSec: string };
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
  gameplay: { file: string };
  storyTitle: string;
}

// Ken Burns variants — match the HyperFrames composition
const KB_VARIANTS = [
  { zStart: 1.0, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, center
  { zStart: 1.12, zEnd: 1.0, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)" }, // zoom out, center
  { zStart: 1.05, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)-on*20", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, pan right
  { zStart: 1.05, zEnd: 1.12, xExpr: "iw/2-(iw/zoom/2)+on*20", yExpr: "ih/2-(ih/zoom/2)" }, // zoom in, pan left
  { zStart: 1.08, zEnd: 1.0, xExpr: "iw/2-(iw/zoom/2)", yExpr: "ih/2-(ih/zoom/2)+on*15" }, // zoom out, pan down
];

const FPS = 60;
const WIDTH = 1080;
const HEIGHT = 1920;
const TOP_HEIGHT = 960;
const XFADE_DUR = 0.6; // crossfade duration (matches HyperFrames overlap)
const FADE_IN_DUR = 1.2;
const FADE_OUT_DUR = 1.3;

async function main() {
  const exportDir = process.argv[2] ?? "/tmp/ffmpeg-spike/export";
  await mkdir(SPIKE_OUTPUT, { recursive: true });
  const outputPath = process.argv[3] ?? join(SPIKE_OUTPUT, "output-ffmpeg.mp4");

  // Detect GPU capabilities
  console.log("Detecting GPU support...");
  const gpu = await detectGpu();
  const useGpu = gpu.nvenc;
  console.log(`  NVENC: ${gpu.nvenc ? "yes (h264_nvenc)" : "no"}`);
  console.log(`  CUDA:  ${gpu.cuda ? "yes (scale_cuda)" : "no"}`);
  console.log(`  Mode:  ${useGpu ? "GPU-accelerated" : "CPU-only"}`);

  // Encoder settings: NVENC for GPU, libx264 for CPU
  // NVENC: VBR with CQ quality target + max bitrate cap to prevent huge files
  // CPU:   libx264 with CRF (constant quality, auto-bitrate)
  const encOpts = useGpu
    ? `-c:v h264_nvenc -preset p4 -tune hq -rc vbr -cq 20 -maxrate 12M -bufsize 24M -pix_fmt yuv420p`
    : `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p`;
  // For intermediate clips (less critical quality), use faster preset + lower bitrate
  const encOptsInter = useGpu
    ? `-c:v h264_nvenc -preset p1 -tune hq -rc vbr -cq 24 -maxrate 8M -bufsize 16M -pix_fmt yuv420p`
    : `-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p`;

  console.log(`\nS14 — FFmpeg Video Spike (${useGpu ? "GPU" : "CPU"})`);
  console.log(`  Export dir: ${exportDir}`);
  console.log(`  Output:     ${outputPath}`);

  // 1. Read manifest
  const manifestPath = join(exportDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("manifest.json not found");
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const totalDuration = parseFloat(manifest.audio.durationSec);
  const scenes = manifest.scenes.imageTimeline.map((t, i) => ({
    index: i,
    imageFile: manifest.scenes.images[i]?.file ?? `scene-${String(i + 1).padStart(2, "0")}.jpg`,
    startSec: parseFloat(t.imageStartSec),
    endSec: parseFloat(t.imageEndSec),
    durationSec: parseFloat(t.imageDurationSec),
  }));

  console.log(`  Duration:   ${totalDuration.toFixed(2)}s`);
  console.log(`  Scenes:     ${scenes.length}`);
  console.log(`  FPS:        ${FPS}`);
  console.log(`  Resolution: ${WIDTH}x${HEIGHT}`);

  // 2. Prepare working directory
  const workDir = join(SPIKE_OUTPUT, "work");
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  // 3. Normalize voiceover (EBU R128 loudnorm)
  const voiceoverSrc = join(exportDir, "voiceover.wav");
  const voiceoverNorm = join(workDir, "voiceover-normalized.wav");
  console.log("\nNormalizing voiceover (EBU R128)...");
  const t0 = Date.now();
  try {
    await runCmd(
      `ffmpeg -y -i "${voiceoverSrc}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 2 "${voiceoverNorm}" 2>&1`,
      { timeout: 60000 },
    );
  } catch (e: any) {
    console.error("Voiceover normalization failed:", e.message);
    process.exit(1);
  }
  console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 4. Render each scene as a Ken Burns clip
  //    zoompan runs on CPU (no CUDA variant), but encoding uses NVENC.
  console.log("\nRendering Ken Burns scene clips...");
  const sceneClips: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]!;
    const kb = KB_VARIANTS[i % KB_VARIANTS.length]!;
    const clipPath = join(workDir, `scene-${String(i + 1).padStart(2, "0")}.mp4`);
    sceneClips.push(clipPath);

    const totalFrames = Math.round(s.durationSec * FPS);
    const zExpr = `'${kb.zStart}+(${kb.zEnd - kb.zStart})*on/${totalFrames}'`;
    const xExpr = `'${kb.xExpr}'`;
    const yExpr = `'${kb.yExpr}'`;

    const t1 = Date.now();
    // Pre-scale to 2x for smooth zoompan, then zoompan, then encode with NVENC
    const cmd = `ffmpeg -y -loop 1 -t ${s.durationSec} -i "${join(exportDir, s.imageFile)}" ` +
      `-filter_complex "` +
      `scale=${WIDTH * 2}:-1,` +
      `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=${totalFrames}:s=${WIDTH}x${TOP_HEIGHT}:fps=${FPS},` +
      `format=yuv420p` +
      `" ` +
      `${encOptsInter} -t ${s.durationSec} "${clipPath}" 2>&1`;

    try {
      await runCmd(cmd, { timeout: 120000 });
      console.log(`  Scene ${i + 1}/${scenes.length}: ${s.durationSec.toFixed(2)}s clip → ${((Date.now() - t1) / 1000).toFixed(1)}s`);
    } catch (e: any) {
      console.error(`  Scene ${i + 1} failed:`, e.message?.slice(0, 200));
      process.exit(1);
    }
  }

  // 5. Crossfade scene clips together with xfade
  //    xfade runs on CPU (no CUDA variant), encoding uses NVENC.
  console.log("\nCrossfading scene clips...");
  const sceneTimelinePath = join(workDir, "scene-timeline.mp4");
  const t2 = Date.now();

  if (sceneClips.length === 1) {
    await runCmd(`ffmpeg -y -i "${sceneClips[0]}" -c copy "${sceneTimelinePath}" 2>&1`, { timeout: 30000 });
  } else {
    const inputs = sceneClips.map(c => `-i "${c}"`).join(" ");
    const filters: string[] = [];
    let prevLabel = "0:v";
    let cumulativeDur = scenes[0]!.durationSec;

    for (let i = 1; i < sceneClips.length; i++) {
      const offset = cumulativeDur - XFADE_DUR;
      const outLabel = i < sceneClips.length - 1 ? `v${i}` : "vout";
      filters.push(`[${prevLabel}][${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}[${outLabel}]`);
      prevLabel = outLabel;
      cumulativeDur = offset + scenes[i]!.durationSec;
    }

    const filterComplex = filters.join(";");
    const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" ${encOptsInter} "${sceneTimelinePath}" 2>&1`;

    try {
      await runCmd(cmd, { timeout: 120000 });
    } catch (e: any) {
      console.error("Xfade failed:", e.message?.slice(0, 300));
      process.exit(1);
    }
  }
  console.log(`  Scene timeline → ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  // 6. Prepare gameplay video
  //    With CUDA: hwupload_cuda → scale_cuda → hwdownload (GPU-accelerated decode+scale)
  //    Without:   CPU scale + crop
  const gameplaySrc = join(exportDir, manifest.gameplay.file);
  const gameplayScaled = join(workDir, "gameplay-scaled.mp4");
  console.log("\nPreparing gameplay video...");
  const t3 = Date.now();

  if (gpu.cuda) {
    // GPU-accelerated: decode with CUDA, scale on GPU, download as nv12 then convert
    // -hwaccel cuda -hwaccel_output_format cuda uploads decoded frames to GPU memory
    // scale_cuda does the resize on GPU, hwdownload as nv12, then format=yuv420p + crop on CPU
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
  console.log(`  Gameplay scaled → ${((Date.now() - t3) / 1000).toFixed(1)}s`);

  // 7. Vstack: scene timeline (top) + gameplay (bottom) + divider + fade
  //    vstack + drawbox + fade run on CPU, final encode uses NVENC.
  console.log("\nCompositing final video (vstack + divider + fade + audio)...");
  const t4 = Date.now();

  const fadeOutStart = totalDuration - FADE_OUT_DUR;

  const finalFilter = [
    `[0:v]fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[topfade]`,
    `[1:v]fade=t=in:st=0:d=${FADE_IN_DUR},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_DUR}[botfade]`,
    `[topfade][botfade]vstack=inputs=2[stacked]`,
    `[stacked]drawbox=x=0:y=${TOP_HEIGHT - 3}:w=${WIDTH}:h=6:color=0x0a0a0a:t=fill[withdiv]`,
  ].join(";");

  const finalCmd = `ffmpeg -y ` +
    `-i "${sceneTimelinePath}" ` +
    `-i "${gameplayScaled}" ` +
    `-i "${voiceoverNorm}" ` +
    `-filter_complex "${finalFilter}" ` +
    `-map "[withdiv]" -map 2:a ` +
    `${encOpts} ` +
    `-c:a aac -b:a 192k ` +
    `-t ${totalDuration} ` +
    `-movflags +faststart ` +
    `"${outputPath}" 2>&1`;

  try {
    await runCmd(finalCmd, { timeout: 300000 });
  } catch (e: any) {
    console.error("Final composite failed:", e.message?.slice(0, 300));
    process.exit(1);
  }
  console.log(`  Final composite → ${((Date.now() - t4) / 1000).toFixed(1)}s`);

  // 8. Probe the output
  console.log("\nOutput probe:");
  try {
    const { stdout: durOut } = await runCmd(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`);
    const { stdout: sizeOut } = await runCmd(`ffprobe -v error -show_entries format=size -of csv=p=0 "${outputPath}"`);
    const { stdout: wOut } = await runCmd(`ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${outputPath}"`);
    const { stdout: hOut } = await runCmd(`ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "${outputPath}"`);
    const { stdout: fpsOut } = await runCmd(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${outputPath}"`);
    const { stdout: codecOut } = await runCmd(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${outputPath}"`);
    const dur = parseFloat(durOut.trim());
    const size = parseInt(sizeOut.trim(), 10);
    console.log(`  Duration:   ${dur.toFixed(2)}s`);
    console.log(`  Resolution: ${wOut.trim()}x${hOut.trim()}`);
    console.log(`  FPS:        ${fpsOut.trim()}`);
    console.log(`  Codec:      ${codecOut.trim()}`);
    console.log(`  Size:       ${(size / 1024 / 1024).toFixed(1)} MB`);
  } catch { /* non-critical */ }

  // 9. Summary
  const totalTime = (Date.now() - t0) / 1000;
  console.log(`\n=== SPIKE COMPLETE ===`);
  console.log(`  Mode:       ${useGpu ? "GPU (NVENC + CUDA)" : "CPU (libx264)"}`);
  console.log(`  Total time: ${totalTime.toFixed(1)}s`);
  console.log(`  Output:     ${outputPath}`);
  console.log(`  (HyperFrames took: 156s for the same export)`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
