/**
 * Milo and the Little Star — Kokoro TTS narration generation.
 *
 * Generates per-scene narration using the "af_heart" voice (warm, expressive
 * female — perfect for children's storytelling). Creates individual segment
 * WAVs and a concatenated full narration WAV with timing data.
 *
 * Output: audio/narration-scene-*.wav, audio/narration-full.wav, timing.json
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, "audio");
const STORY_PLAN_PATH = join(__dirname, "story-plan.json");

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "af_heart";

interface KokoroInstance {
  generate: (text: string, opts: { voice: string }) => Promise<{ save: (path: string) => void }>;
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${path}"`,
  );
  const probe = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(probe.format?.duration ?? "0");
}

async function main() {
  await mkdir(AUDIO_DIR, { recursive: true });

  const storyPlan = JSON.parse(readFileSync(STORY_PLAN_PATH, "utf-8")) as {
    title: string;
    totalDurationSec: number;
    scenes: Array<{
      sceneId: string;
      narration: string;
      durationSec: number;
    }>;
  };

  console.log(`=== Milo and the Little Star — Kokoro TTS Narration ===\n`);
  console.log(`Voice: ${KOKORO_VOICE} (warm, expressive female)`);
  console.log(`Model: ${KOKORO_MODEL}\n`);

  // Load Kokoro
  console.log("Loading Kokoro model...");
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
  console.log("Kokoro model loaded.\n");

  const segmentResults: Array<{ sceneId: string; path: string; durationSec: number }> = [];

  for (const scene of storyPlan.scenes) {
    if (!scene.narration) {
      console.log(`[${scene.sceneId}] (no narration — skipping)`);
      segmentResults.push({ sceneId: scene.sceneId, path: "", durationSec: 0 });
      continue;
    }

    const segPath = join(AUDIO_DIR, `narration-${scene.sceneId}.wav`);
    console.log(`[${scene.sceneId}] Generating: "${scene.narration.substring(0, 60)}..."`);

    const audio = await tts.generate(scene.narration, { voice: KOKORO_VOICE });
    audio.save(segPath);

    const durationSec = await probeDuration(segPath);
    console.log(`  → ${durationSec.toFixed(1)}s`);

    segmentResults.push({ sceneId: scene.sceneId, path: segPath, durationSec });
  }

  // Concatenate with pauses
  console.log("\nConcatenating segments...");
  const segmentsWithAudio = segmentResults.filter((s) => s.durationSec > 0);
  const pauseSec = 0.5;

  // Build concat with silence
  const inputs: string[] = [];
  const filterParts: string[] = [];
  const silenceInputs: string[] = [];
  const silenceFilterParts: string[] = [];
  const concatInputs: string[] = [];
  let silenceIdx = segmentsWithAudio.length;

  segmentsWithAudio.forEach((seg, i) => {
    inputs.push(`-i "${seg.path}"`);
    filterParts.push(`[${i}:a]`);
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

  const combinedPath = join(AUDIO_DIR, "narration-full.wav");
  await execAsync(
    `ffmpeg -y ${allInputs} -filter_complex "${filter}" -map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${combinedPath}"`,
  );

  const totalDuration = await probeDuration(combinedPath);
  console.log(`Full narration: ${totalDuration.toFixed(1)}s`);

  // Write timing data
  let currentTime = 0;
  const timingData = {
    totalDurationSec: totalDuration,
    voice: KOKORO_VOICE,
    model: KOKORO_MODEL,
    scenes: storyPlan.scenes.map((scene) => {
      const result = segmentResults.find((r) => r.sceneId === scene.sceneId)!;
      const startSec = currentTime;
      currentTime += result.durationSec + (result.durationSec > 0 ? pauseSec : 0);
      return {
        sceneId: scene.sceneId,
        narration: scene.narration,
        durationSec: result.durationSec,
        startSec,
      };
    }),
  };

  const timingPath = join(__dirname, "timing.json");
  await writeFile(timingPath, JSON.stringify(timingData, null, 2));
  console.log(`\nTiming data written to: ${timingPath}`);
  console.log("\n=== Done! ===");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
