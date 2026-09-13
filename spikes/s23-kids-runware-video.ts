/**
 * S23 — Kids Story Video with Runware FLUX.2 [klein] 9B.
 *
 * Generates a complete kids storytelling video using:
 *   - Runware FLUX.2 [klein] 9B (model: runware:400@2) for image generation
 *   - Reference images for consistent character identity across all scenes
 *   - Kokoro TTS (af_heart voice) for warm, child-friendly narration
 *   - FFmpeg for audio mixing (narration + background music) and video assembly
 *
 * Pipeline (each stage persists artifacts to spikes/output/s23-kids-runware/):
 *   1. Load story plan  — read the Milo & the Little Star story plan
 *   2. Reference image  — generate a character reference image for Milo (the
 *                          main character) using Runware text-to-image (no ref)
 *   3. Scene images     — generate each scene image using Runware with the
 *                          Milo reference image attached for consistency
 *   4. Narration        — Kokoro TTS (af_heart) per-scene WAVs + concatenated
 *   5. Music mix        — narration + background.mp3 (ducked under voice)
 *   6. Video assembly   — FFmpeg: per-scene image clips timed to narration,
 *                          concatenated into the final MP4 with mixed audio
 *
 * Usage:
 *   bun run spikes/s23-kids-runware-video.ts
 *   bun run spikes/s23-kids-runware-video.ts --skip-images   # reuse existing images
 *   bun run spikes/s23-kids-runware-video.ts --skip-narration # reuse existing audio
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { loadEnv, spikeDir, writeArtifact, type SpikeResult } from "./lib/spike.ts";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, ".."); // spikes/ → clipatro/

// === Constants ===

const SPIKE_ID = "s23-kids-runware";
const STORY_PLAN_PATH = join(__dirname, "s23", "milo-star-story", "story-plan.json");
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

const RUNWARE_API_URL = "https://api.runware.ai/v1";
const RUNWARE_MODEL = "runware:400@2"; // FLUX.2 [klein] 9B
const IMAGE_WIDTH = 1088;  // ~9:16 vertical
const IMAGE_HEIGHT = 1920;

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "af_heart"; // warm, expressive female — perfect for kids

// === Types ===

interface StoryScene {
  sceneId: string;
  narration: string;
  imagePrompt: string;
  emotion: string;
  durationSec: number;
}

interface StoryPlan {
  title: string;
  totalDurationSec: number;
  artStyle: string;
  characterDesign: Record<string, string>;
  scenes: StoryScene[];
}

interface SceneImageResult {
  sceneId: string;
  imagePath: string;
  costUsd: number;
  latencyMs: number;
  usedReference: boolean;
}

interface NarrationSegment {
  sceneId: string;
  text: string;
  wavPath: string;
  durationSec: number;
}

// === Helpers ===

function log(stage: string, msg: string): void {
  console.log(`  [${stage}] ${msg}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${path}"`,
  );
  const probe = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(probe.format?.duration ?? "0");
}

// === Stage 1: Load story plan ===

async function loadStoryPlan(): Promise<StoryPlan> {
  const raw = await readFile(STORY_PLAN_PATH, "utf-8");
  const plan = JSON.parse(raw) as StoryPlan;
  if (!plan.scenes || plan.scenes.length === 0) {
    throw new Error("Story plan has no scenes");
  }
  return plan;
}

// === Stage 2 & 3: Runware image generation ===

/**
 * Generate an image via Runware FLUX.2 [klein] 9B.
 * If referenceImages are provided, they are sent in inputs.referenceImages
 * for character consistency.
 *
 * Returns the downloaded image buffer and the cost from the API response.
 */
async function runwareGenerate(
  apiKey: string,
  positivePrompt: string,
  negativePrompt: string,
  referenceDataUris: string[],
  destPath: string,
): Promise<{ costUsd: number; latencyMs: number; imageURL: string }> {
  const taskUUID = randomUUID();
  const task: Record<string, unknown> = {
    taskType: "imageInference",
    taskUUID,
    model: RUNWARE_MODEL,
    positivePrompt,
    negativePrompt,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    numberResults: 1,
    outputFormat: "JPEG",
    outputQuality: 95,
    steps: 4,
    CFGScale: 3.5,
  };

  if (referenceDataUris.length > 0) {
    task.inputs = { referenceImages: referenceDataUris };
  }

  const t0 = performance.now();
  const res = await fetch(RUNWARE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([task]),
  });

  const raw = await res.json() as {
    data?: Array<{
      taskType: string;
      imageUUID: string;
      taskUUID: string;
      seed: number;
      imageURL: string;
      cost?: number;
    }>;
    errors?: Array<{ code: string; message: string }>;
  };

  const latencyMs = Math.round(performance.now() - t0);

  if (!res.ok || raw.errors?.length) {
    const errMsg = raw.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Runware API error: ${errMsg}`);
  }

  const result = raw.data?.[0];
  if (!result?.imageURL) {
    throw new Error("Runware returned no image URL");
  }

  // Download the generated image
  const imgRes = await fetch(result.imageURL);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image: HTTP ${imgRes.status}`);
  }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  await writeFile(destPath, imgBuf);

  // Runware reports cost per image; default estimate if not provided
  const costUsd = result.cost ?? 0.001;

  return { costUsd, latencyMs, imageURL: result.imageURL };
}

/** Convert a local image file to a data URI for use as a reference image. */
async function fileToDataUri(path: string): Promise<string> {
  const buf = await readFile(path);
  const ext = path.endsWith(".png") ? "png" : "jpeg";
  return `data:image/${ext};base64,${buf.toString("base64")}`;
}

// Consistent art style prefix — prepended to every image prompt
const ART_STYLE_PREFIX = `STORYBOOK ILLUSTRATION STYLE — soft, warm, hand-painted children's book illustration with gentle lighting, rounded shapes, and a dreamy comforting atmosphere. Warm autumn color palette with golden tones. Consistent character designs across all images.

CHARACTER DESIGNS (use EXACTLY these descriptions in every image):
- MILO: A young boy aged 6-7 with curly brown hair, big expressive eyes, wearing a blue jacket and yellow boots. Kind and curious face.
- STAR: A small, round star character with a friendly face (two dot eyes and a smile). Glowing with warm golden-yellow light.
- RABBIT: A friendly, fluffy rabbit with soft brown fur, long ears, gentle expression. Small and cute.
- OWL: A wise, friendly owl with large round eyes, soft brown and white feathers, gentle knowing smile.
- DEER: A gentle, friendly deer with soft brown fur, large kind eyes, small antlers. Elegant and calm.

ART STYLE: Soft storybook illustration, warm golden lighting, rounded shapes, no harsh lines, gentle and inviting. Vertical composition (portrait orientation 9:16). No text, no watermark, no border.`;

const NEGATIVE_PROMPT = "text, watermark, logo, border, signature, blurry, deformed, extra limbs, bad anatomy, scary, dark, horror, realistic photo, 3d render, cgi";

/**
 * Generate all scene images.
 * Stage 2: First generate a character reference image for Milo (no reference).
 * Stage 3: Then generate each scene using the Milo reference for consistency.
 */
async function generateAllImages(
  plan: StoryPlan,
  outDir: string,
  apiKey: string,
  skipExisting: boolean,
): Promise<{ images: SceneImageResult[]; totalCostUsd: number; refImagePath: string }> {
  const imagesDir = join(outDir, "images");
  await mkdir(imagesDir, { recursive: true });

  const images: SceneImageResult[] = [];
  let totalCostUsd = 0;

  // ─── Stage 2: Generate Milo character reference image ───────────────────
  const refImagePath = join(imagesDir, "milo-reference.jpg");

  if (skipExisting && await exists(refImagePath)) {
    log("RefImage", "Reusing existing Milo reference image");
  } else {
    log("RefImage", "Generating Milo character reference image (no reference)...");
    const refPrompt = `${ART_STYLE_PREFIX}

CHARACTER REFERENCE SHEET: A young boy named Milo, aged 6-7, with curly brown hair, big expressive brown eyes, wearing a blue jacket and yellow boots. He has a kind and curious face with rosy cheeks. Show him in a friendly neutral pose, standing in a warm autumn forest with golden light, looking at the camera with a gentle smile. Full body visible. This is a character reference image for maintaining visual consistency across scenes.

Vertical 9:16 composition. No text, no watermark.`;

    const result = await runwareGenerate(apiKey, refPrompt, NEGATIVE_PROMPT, [], refImagePath);
    totalCostUsd += result.costUsd;
    log("RefImage", `OK — ${result.latencyMs}ms, $${result.costUsd.toFixed(4)}`);
  }

  // Load the reference image as a data URI for all subsequent scene generations
  const refDataUri = await fileToDataUri(refImagePath);

  // ─── Stage 3: Generate each scene image ─────────────────────────────────
  for (const scene of plan.scenes) {
    const sceneImagePath = join(imagesDir, `${scene.sceneId}.jpg`);

    if (skipExisting && await exists(sceneImagePath)) {
      log("Image", `  ${scene.sceneId}: reusing existing image`);
      images.push({
        sceneId: scene.sceneId,
        imagePath: sceneImagePath,
        costUsd: 0,
        latencyMs: 0,
        usedReference: true,
      });
      continue;
    }

    // The last scene (end card) has no Milo — generate without reference
    const isEndCard = scene.sceneId === "scene-10" || !scene.narration;
    const refs = isEndCard ? [] : [refDataUri];

    const fullPrompt = `${ART_STYLE_PREFIX}

SCENE: ${scene.imagePrompt}

EMOTION: ${scene.emotion}
Vertical 9:16 composition. No text, no watermark.`;

    log("Image", `  ${scene.sceneId}: generating (ref=${refs.length})...`);
    try {
      const result = await runwareGenerate(apiKey, fullPrompt, NEGATIVE_PROMPT, refs, sceneImagePath);
      totalCostUsd += result.costUsd;
      log("Image", `    OK — ${result.latencyMs}ms, $${result.costUsd.toFixed(4)}`);
      images.push({
        sceneId: scene.sceneId,
        imagePath: sceneImagePath,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        usedReference: refs.length > 0,
      });
    } catch (err) {
      log("Image", `    FAILED: ${err}`);
      images.push({
        sceneId: scene.sceneId,
        imagePath: "",
        costUsd: 0,
        latencyMs: 0,
        usedReference: refs.length > 0,
      });
    }
  }

  return { images, totalCostUsd, refImagePath };
}

// === Stage 4: Narration (Kokoro TTS) ===

interface KokoroInstance {
  generate: (text: string, opts: { voice: string }) => Promise<{ save: (path: string) => void }>;
}

async function generateNarration(
  plan: StoryPlan,
  outDir: string,
  skipExisting: boolean,
): Promise<{ segments: NarrationSegment[]; totalDurationSec: number; fullWavPath: string }> {
  const audioDir = join(outDir, "audio");
  await mkdir(audioDir, { recursive: true });

  const fullWavPath = join(audioDir, "narration-full.wav");
  if (skipExisting && await exists(fullWavPath)) {
    log("Narration", "Reusing existing narration audio");
    const totalDurationSec = await probeDuration(fullWavPath);
    // Rebuild segment list from existing files
    const segments: NarrationSegment[] = [];
    for (const scene of plan.scenes) {
      const segPath = join(audioDir, `narration-${scene.sceneId}.wav`);
      if (scene.narration && await exists(segPath)) {
        const dur = await probeDuration(segPath);
        segments.push({ sceneId: scene.sceneId, text: scene.narration, wavPath: segPath, durationSec: dur });
      } else {
        segments.push({ sceneId: scene.sceneId, text: scene.narration, wavPath: "", durationSec: 0 });
      }
    }
    return { segments, totalDurationSec, fullWavPath };
  }

  log("Narration", `Loading Kokoro model (${KOKORO_MODEL})...`);
  const mod = await import("kokoro-js");
  const KokoroTTS = mod.KokoroTTS as unknown as {
    from_pretrained: (
      model: string,
      opts: { dtype: string; device: string },
    ) => Promise<KokoroInstance>;
  };
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
    dtype: "q8",
    device: "cpu",
  });
  log("Narration", "Kokoro model loaded.");

  const segments: NarrationSegment[] = [];
  const pauseSec = 0.5;

  for (const scene of plan.scenes) {
    if (!scene.narration) {
      log("Narration", `  ${scene.sceneId}: (no narration — skipping)`);
      segments.push({ sceneId: scene.sceneId, text: "", wavPath: "", durationSec: 0 });
      continue;
    }

    const segPath = join(audioDir, `narration-${scene.sceneId}.wav`);
    log("Narration", `  ${scene.sceneId}: "${scene.narration.substring(0, 50)}..."`);

    const audio = await tts.generate(scene.narration, { voice: KOKORO_VOICE });
    audio.save(segPath);

    const durationSec = await probeDuration(segPath);
    log("Narration", `    → ${durationSec.toFixed(1)}s`);
    segments.push({ sceneId: scene.sceneId, text: scene.narration, wavPath: segPath, durationSec });
  }

  // Concatenate segments with pauses
  log("Narration", "Concatenating segments with pauses...");
  const segmentsWithAudio = segments.filter((s) => s.durationSec > 0);

  const inputs: string[] = [];
  const silenceInputs: string[] = [];
  const silenceFilterParts: string[] = [];
  const concatInputs: string[] = [];
  let silenceIdx = segmentsWithAudio.length;

  segmentsWithAudio.forEach((seg, i) => {
    inputs.push(`-i "${seg.wavPath}"`);
    concatInputs.push(`[${i}:a]`);
    if (i < segmentsWithAudio.length - 1) {
      silenceInputs.push(`-f lavfi -i anullsrc=channel_layout=mono:sample_rate=24000`);
      silenceFilterParts.push(`[${silenceIdx}:a]atrim=0:${pauseSec}[sil${i}]`);
      concatInputs.push(`[sil${i}]`);
      silenceIdx++;
    }
  });

  const filter = `${silenceFilterParts.join(";")};${concatInputs.join("")}concat=n=${concatInputs.length}:v=0:a=1[out]`;
  const allInputs = [...inputs, ...silenceInputs].join(" ");

  await execAsync(
    `ffmpeg -y ${allInputs} -filter_complex "${filter}" -map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${fullWavPath}"`,
  );

  const totalDurationSec = await probeDuration(fullWavPath);
  log("Narration", `Full narration: ${totalDurationSec.toFixed(1)}s`);

  return { segments, totalDurationSec, fullWavPath };
}

// === Stage 5: Music mix (narration + background music) ===

async function mixMusic(
  narrationWav: string,
  narrationDuration: number,
  outDir: string,
): Promise<string> {
  const mixedPath = join(outDir, "audio", "mixed-audio.wav");
  const musicLevel = 0.12; // background music at 12% volume (ducked under narration)

  // Mix narration with background music:
  // - Loop background music to match narration duration
  // - Apply volume reduction to music
  // - Add fade in/out on music
  // - Normalize final output
  await execAsync(
    `ffmpeg -y -i "${narrationWav}" -stream_loop -1 -i "${BACKGROUND_MUSIC}" ` +
    `-filter_complex "` +
    `[1:a]volume=${musicLevel},afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, narrationDuration - 2).toFixed(1)}:d=2[bg];` +
    `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=1.5[out]" ` +
    `-map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
  );

  log("MusicMix", `Mixed audio: ${mixedPath}`);
  return mixedPath;
}

// === Stage 6: Video assembly (FFmpeg) ===

async function assembleVideo(
  plan: StoryPlan,
  images: SceneImageResult[],
  narrationSegments: NarrationSegment[],
  mixedAudio: string,
  outDir: string,
): Promise<{ videoPath: string; durationSec: number; sizeBytes: number }> {
  const clipsDir = join(outDir, "clips");
  await mkdir(clipsDir, { recursive: true });
  const videoPath = join(outDir, "milo-and-the-little-star.mp4");

  // Build per-scene image clips timed to narration duration
  const pauseSec = 0.5;
  const clipPaths: string[] = [];
  let currentTime = 0;

  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i]!;
    const imgResult = images.find((im) => im.sceneId === scene.sceneId);
    const seg = narrationSegments.find((s) => s.sceneId === scene.sceneId);

    // Duration: narration duration + pause, or fallback to plan duration
    let clipDuration: number;
    if (seg && seg.durationSec > 0) {
      clipDuration = seg.durationSec + pauseSec;
    } else {
      clipDuration = scene.durationSec;
    }

    const clipPath = join(clipsDir, `${scene.sceneId}.mp4`);

    if (imgResult?.imagePath && await exists(imgResult.imagePath)) {
      // Create a video clip from the image with a gentle Ken Burns zoom effect
      // Scale image to fit 1080x1920, apply slow zoom over the clip duration
      const zoomDuration = clipDuration.toFixed(2);
      await execAsync(
        `ffmpeg -y -loop 1 -i "${imgResult.imagePath}" ` +
        `-t ${clipDuration} ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `zoompan=z='min(zoom+0.0008,1.15)':d=${Math.round(30 * clipDuration)}:s=1080x1920:fps=30" ` +
        `-c:v libx264 -pix_fmt yuv420p -r 30 -preset fast -crf 20 ` +
        `"${clipPath}"`,
      );
    } else {
      // Fallback: solid color clip
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=goldenrod:s=1080x1920:d=${clipDuration}:r=30 ` +
        `-c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "${clipPath}"`,
      );
    }

    clipPaths.push(clipPath);
    currentTime += clipDuration;
    log("Video", `  ${scene.sceneId}: ${clipDuration.toFixed(1)}s clip`);
  }

  // Concatenate all clips
  log("Video", "Concatenating scene clips...");
  const concatListPath = join(clipsDir, "concat-list.txt");
  const concatContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatListPath, concatContent);

  const silentVideoPath = join(clipsDir, "silent-full.mp4");
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" ` +
    `-c:v libx264 -pix_fmt yuv420p -r 30 -preset fast -crf 20 "${silentVideoPath}"`,
  );

  // Mux video with mixed audio
  log("Video", "Muxing video with mixed audio...");
  await execAsync(
    `ffmpeg -y -i "${silentVideoPath}" -i "${mixedAudio}" ` +
    `-c:v copy -c:a aac -b:a 192k -shortest "${videoPath}"`,
  );

  const durationSec = await probeDuration(videoPath);
  const stat = await execAsync(`stat -c %s "${videoPath}"`);
  const sizeBytes = parseInt(stat.stdout.trim());

  return { videoPath, durationSec, sizeBytes };
}

// === Main run ===

export async function run(): Promise<SpikeResult> {
  await loadEnv();

  const args = process.argv.slice(2);
  const skipImages = args.includes("--skip-images");
  const skipNarration = args.includes("--skip-narration");

  const apiKey = process.env.RUNWARE_API_KEY ?? "";

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  S23 — Kids Story Video with Runware FLUX.2 [klein] 9B");
  console.log(`  Image model: ${RUNWARE_MODEL} (FLUX.2 [klein] 9B)`);
  console.log(`  TTS: Kokoro ${KOKORO_VOICE}`);
  console.log(`  Runware API key: ${apiKey ? "SET" : "MISSING"}`);
  console.log(`  Skip images: ${skipImages ? "YES" : "NO"}`);
  console.log(`  Skip narration: ${skipNarration ? "YES" : "NO"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (!apiKey) {
    return {
      id: SPIKE_ID,
      name: "Kids Story Video with Runware FLUX.2 [klein] 9B",
      goal: "Generate a complete kids storytelling video using Runware for images with reference-based character consistency.",
      result: "fail",
      measurements: { runwareApiKey: false },
      notes: "RUNWARE_API_KEY not set in .env. Add it and re-run.",
      artifactPaths: [],
    };
  }

  const outDir = await spikeDir(SPIKE_ID);

  // ─── Stage 1: Load story plan ────────────────────────────────────────────
  console.log("▸ Stage 1: Load story plan...\n");
  const plan = await loadStoryPlan();
  log("Story", `"${plan.title}" — ${plan.scenes.length} scenes, ~${plan.totalDurationSec}s`);
  await writeArtifact(SPIKE_ID, "01-story-plan.json", JSON.stringify(plan, null, 2));
  console.log();

  // ─── Stage 2 & 3: Image generation (Runware) ─────────────────────────────
  console.log("▸ Stage 2 & 3: Image generation (Runware FLUX.2 [klein] 9B)...\n");
  const imageResult = await generateAllImages(plan, outDir, apiKey, skipImages);
  const succeeded = imageResult.images.filter((i) => i.imagePath).length;
  const failed = imageResult.images.length - succeeded;
  log("Images", `${succeeded}/${imageResult.images.length} images generated, ${failed} failed — $${imageResult.totalCostUsd.toFixed(4)}`);
  await writeArtifact(SPIKE_ID, "02-images.json", JSON.stringify({
    refImagePath: imageResult.refImagePath,
    model: RUNWARE_MODEL,
    totalCostUsd: imageResult.totalCostUsd,
    images: imageResult.images,
  }, null, 2));
  console.log();

  // ─── Stage 4: Narration (Kokoro TTS) ─────────────────────────────────────
  console.log("▸ Stage 4: Narration (Kokoro TTS, af_heart)...\n");
  const narrationResult = await generateNarration(plan, outDir, skipNarration);
  log("Narration", `Full narration: ${narrationResult.totalDurationSec.toFixed(1)}s`);
  await writeArtifact(SPIKE_ID, "03-narration.json", JSON.stringify({
    voice: KOKORO_VOICE,
    model: KOKORO_MODEL,
    totalDurationSec: narrationResult.totalDurationSec,
    segments: narrationResult.segments.map((s) => ({
      sceneId: s.sceneId,
      text: s.text,
      durationSec: s.durationSec,
    })),
  }, null, 2));
  console.log();

  // ─── Stage 5: Music mix ──────────────────────────────────────────────────
  console.log("▸ Stage 5: Music mix (narration + background music)...\n");
  const mixedAudio = await mixMusic(
    narrationResult.fullWavPath,
    narrationResult.totalDurationSec,
    outDir,
  );
  log("MusicMix", `Mixed audio: ${mixedAudio}`);
  console.log();

  // ─── Stage 6: Video assembly ─────────────────────────────────────────────
  console.log("▸ Stage 6: Video assembly (FFmpeg)...\n");
  const video = await assembleVideo(
    plan,
    imageResult.images,
    narrationResult.segments,
    mixedAudio,
    outDir,
  );
  log("Video", `${video.videoPath} (${video.durationSec.toFixed(1)}s, ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SPIKE SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Story:       "${plan.title}"`);
  console.log(`  Scenes:      ${plan.scenes.length}`);
  console.log(`  Images:      ${succeeded}/${imageResult.images.length} (Runware FLUX.2 [klein] 9B)`);
  console.log(`  Narration:   ${narrationResult.totalDurationSec.toFixed(1)}s (Kokoro af_heart)`);
  console.log(`  Video:       ${video.durationSec.toFixed(1)}s, ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Image cost:  $${imageResult.totalCostUsd.toFixed(4)}`);
  console.log(`  Output:      ${video.videoPath}`);
  console.log(`  Artifacts:   ${outDir}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  return {
    id: SPIKE_ID,
    name: "Kids Story Video with Runware FLUX.2 [klein] 9B",
    goal: "Generate a complete kids storytelling video using Runware FLUX.2 [klein] 9B for images with reference-based character consistency, Kokoro TTS for narration, and FFmpeg for video assembly.",
    result: succeeded > 0 && video.durationSec > 0 ? "pass" : "partial",
    measurements: {
      storyTitle: plan.title,
      scenes: plan.scenes.length,
      imagesGenerated: succeeded,
      imagesFailed: failed,
      imageModel: RUNWARE_MODEL,
      imageCostUsd: imageResult.totalCostUsd.toFixed(4),
      narrationDurationSec: narrationResult.totalDurationSec.toFixed(1),
      ttsVoice: KOKORO_VOICE,
      videoDurationSec: video.durationSec.toFixed(1),
      videoSizeMB: (video.sizeBytes / 1024 / 1024).toFixed(1),
    },
    notes: `Generated "${plan.title}" — a ${plan.scenes.length}-scene kids story video using Runware FLUX.2 [klein] 9B (model ${RUNWARE_MODEL}). A character reference image for Milo was generated first, then used as a reference image for all subsequent character scenes to maintain visual consistency. Narration via Kokoro af_heart TTS. Final video: ${video.durationSec.toFixed(1)}s, ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB.`,
    artifactPaths: [
      video.videoPath,
      join(outDir, "01-story-plan.json"),
      join(outDir, "02-images.json"),
      join(outDir, "03-narration.json"),
      imageResult.refImagePath,
    ],
  };
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  run()
    .then((result) => {
      console.log(`\nResult: ${result.result}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Spike failed:", err);
      process.exit(1);
    });
}
