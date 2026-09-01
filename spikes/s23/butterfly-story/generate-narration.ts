/**
 * Butterfly Story — TTS narration generation using Kokoro (local, free).
 *
 * Generates per-scene narration segments with the "af_heart" voice — a warm,
 * expressive female voice that's perfect for child-friendly storytelling.
 * Each segment is saved as a separate WAV file, and a combined narration WAV
 * is created for the final mix.
 *
 * Usage: bun run spikes/s23/butterfly-story/generate-narration.ts
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "audio");

// ─── Narration script — complete beginning/middle/ending story ──────────────
//
// Topic: "The Amazing Butterfly Journey" — how a caterpillar becomes a butterfly
// Target audience: ages 4-8
// Tone: warm, excited, wonder-filled, like a cheerful teacher sharing something amazing
// Total estimated duration: ~40-50 seconds at child-friendly pace

export interface NarrationSegment {
  sceneId: string;
  component: string;
  text: string;
  imageQuery: string;
}

export const narrationScript: NarrationSegment[] = [
  {
    sceneId: "title",
    component: "KidsTitleCard",
    text: "Have you ever wondered how a butterfly gets its wings? It's one of the most amazing journeys in all of nature!",
    imageQuery: "monarch butterfly on flower",
  },
  {
    sceneId: "egg-caterpillar",
    component: "KidsImageReveal",
    text: "It all starts with a tiny egg on a leaf. When it hatches, out comes a hungry little caterpillar!",
    imageQuery: "caterpillar on leaf",
  },
  {
    sceneId: "fun-fact",
    component: "KidsFunFact",
    text: "A caterpillar's only job is to EAT! It munches leaves all day long, growing one hundred times bigger than when it was born!",
    imageQuery: "caterpillar eating leaf",
  },
  {
    sceneId: "question",
    component: "KidsQuestion",
    text: "But what happens next? Something completely incredible!",
    imageQuery: "chrysalis",
  },
  {
    sceneId: "timeline",
    component: "KidsTimeline",
    text: "The caterpillar wraps itself inside a special case called a chrysalis. Inside, it completely transforms! Egg, caterpillar, chrysalis, butterfly — four amazing stages of metamorphosis!",
    imageQuery: "green chrysalis",
  },
  {
    sceneId: "number-stat",
    component: "KidsNumberStat",
    text: "After a few weeks, a beautiful butterfly emerges, drying its wings in the warm sun!",
    imageQuery: "butterfly emerging",
  },
  {
    sceneId: "ending",
    component: "KidsEnding",
    text: "It flies off to sip sweet nectar from flowers, and start the whole amazing journey all over again. Isn't nature wonderful?",
    imageQuery: "butterfly flying meadow",
  },
  {
    sceneId: "end-card",
    component: "KidsEndCard",
    text: "", // No narration — just music + CTA
    imageQuery: "butterfly garden",
  },
];

// ─── Kokoro TTS generation ──────────────────────────────────────────────────

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "af_heart"; // Warm, expressive female voice — perfect for kids

async function generateWithKokoro(text: string, outputPath: string): Promise<void> {
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
  const audio = await tts.generate(text, { voice: KOKORO_VOICE });
  audio.save(outputPath);
}

interface KokoroInstance {
  generate: (text: string, opts: { voice: string }) => Promise<{ save: (path: string) => void }>;
}

// ─── Audio utilities ────────────────────────────────────────────────────────

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${path}"`,
  );
  const probe = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(probe.format?.duration ?? "0");
}

async function concatAudioSegments(
  segments: Array<{ path: string; durationSec: number }>,
  outputPath: string,
): Promise<{ durationSec: number; segmentStartTimes: number[] }> {
  // Create a concat list with silence between segments
  const segmentStartTimes: number[] = [];
  let currentTime = 0;
  const pauseSec = 0.4; // 400ms pause between scenes

  // Build FFmpeg concat filter
  const inputs: string[] = [];
  const filterParts: string[] = [];
  segments.forEach((seg, i) => {
    if (seg.durationSec > 0) {
      inputs.push(`-i "${seg.path}"`);
      segmentStartTimes.push(currentTime);
      filterParts.push(`[${i}:a]`);
      currentTime += seg.durationSec + pauseSec;
    } else {
      segmentStartTimes.push(currentTime);
    }
  });

  // Add silence between segments
  const silenceInputs: string[] = [];
  const silenceFilterParts: string[] = [];
  let silenceIdx = segments.length;
  segments.forEach((seg, i) => {
    if (i < segments.length - 1 && seg.durationSec > 0) {
      silenceInputs.push(`-f lavfi -i anullsrc=channel_layout=mono:sample_rate=24000`);
      silenceFilterParts.push(`[${silenceIdx}:a]atrim=0:${pauseSec}[sil${i}]`);
      silenceIdx++;
    }
  });

  // Interleave segments with silence
  const concatInputs: string[] = [];
  segments.forEach((seg, i) => {
    if (seg.durationSec > 0) {
      concatInputs.push(`[${i}:a]`);
      if (i < segments.length - 1) {
        concatInputs.push(`[sil${i}]`);
      }
    }
  });

  const filter = `${silenceFilterParts.join(";")};${concatInputs.join("")}concat=n=${concatInputs.length}:v=0:a=1[out]`;
  const allInputs = [...inputs, ...silenceInputs].join(" ");

  await execAsync(
    `ffmpeg -y ${allInputs} -filter_complex "${filter}" -map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${outputPath}"`,
  );

  const durationSec = await probeDuration(outputPath);
  return { durationSec, segmentStartTimes };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("=== Butterfly Story — Kokoro TTS Narration Generation ===\n");
  console.log(`Voice: ${KOKORO_VOICE} (warm, expressive female)`);
  console.log(`Model: ${KOKORO_MODEL}\n`);

  const segmentResults: Array<{ sceneId: string; path: string; durationSec: number; text: string }> = [];

  // Load Kokoro once
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

  // Generate each segment
  for (const segment of narrationScript) {
    if (!segment.text) {
      console.log(`[${segment.sceneId}] (no narration — skipping)`);
      segmentResults.push({
        sceneId: segment.sceneId,
        path: "",
        durationSec: 0,
        text: segment.text,
      });
      continue;
    }

    const segPath = join(OUT_DIR, `narration-${segment.sceneId}.wav`);
    console.log(`[${segment.sceneId}] Generating: "${segment.text.substring(0, 60)}..."`);

    const audio = await tts.generate(segment.text, { voice: KOKORO_VOICE });
    audio.save(segPath);

    const durationSec = await probeDuration(segPath);
    console.log(`  → ${durationSec.toFixed(1)}s`);

    segmentResults.push({
      sceneId: segment.sceneId,
      path: segPath,
      durationSec,
      text: segment.text,
    });
  }

  // Concatenate all segments into one narration WAV
  console.log("\nConcatenating segments...");
  const segmentsWithAudio = segmentResults.filter((s) => s.durationSec > 0);
  const combinedPath = join(OUT_DIR, "narration-full.wav");
  const { durationSec: totalDuration, segmentStartTimes } = await concatAudioSegments(
    segmentsWithAudio.map((s) => ({ path: s.path, durationSec: s.durationSec })),
    combinedPath,
  );
  console.log(`Full narration: ${totalDuration.toFixed(1)}s`);

  // Write timing data for the Remotion composition
  const timingData = {
    totalDurationSec: totalDuration,
    voice: KOKORO_VOICE,
    model: KOKORO_MODEL,
    segments: narrationScript.map((seg, i) => {
      const result = segmentResults.find((r) => r.sceneId === seg.sceneId)!;
      const segIdx = segmentsWithAudio.findIndex((s) => s.sceneId === seg.sceneId);
      return {
        sceneId: seg.sceneId,
        component: seg.component,
        text: seg.text,
        durationSec: result.durationSec,
        startSec: segIdx >= 0 ? segmentStartTimes[segIdx] : totalDuration,
        imageQuery: seg.imageQuery,
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
