/**
 * S04 — Kokoro TTS (af_heart) under Bun.
 *
 * Goal: Verify the kokoro-js library runs under Bun on the current machine
 * (NVIDIA T1200, 31 GiB RAM), generates speech with the af_heart voice,
 * and produces a valid WAV file we can probe with FFprobe.
 *
 * This is the primary TTS adapter. If it fails, Gemini TTS (S05) is the fallback.
 * Kokoro uses Transformers.js (ONNX runtime) under the hood.
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(exec);

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
  );
  return parseFloat(stdout.trim());
}

export async function run(): Promise<SpikeResult> {
  const measurements: Record<string, string | number | boolean> = {};
  const artifacts: string[] = [];
  const dir = await spikeDir("s04");

  const narration = "Have you ever wondered why we procrastinate, even when we know it will hurt us later? It's not laziness. It's your brain choosing instant comfort over future reward.";

  // Try to import kokoro-js; install if missing.
  let KokoroTTS: unknown;
  try {
    const mod = await import("kokoro-js");
    KokoroTTS = mod.KokoroTTS;
  } catch {
    measurements["importError"] = true;
    try {
      await execAsync("bun add kokoro-js", { cwd: process.cwd() });
      const mod = await import("kokoro-js");
      KokoroTTS = mod.KokoroTTS;
      measurements["installedDuringSpike"] = true;
    } catch (e) {
      return {
        id: "s04",
        name: "Kokoro TTS (af_heart) under Bun",
        goal: "Verify kokoro-js runs under Bun and generates a valid WAV.",
        result: "fail",
        measurements: { ...measurements, "installError": String(e) },
        notes: "Could not import or install kokoro-js. Gemini TTS (S05) is the fallback.",
        artifactPaths: [],
      };
    }
  }

  // Load the model. Use q8 quantization for speed, cpu device for Node.
  const t0 = performance.now();
  let tts: { generate: (text: string, opts: { voice: string; speed?: number }) => { save: (path: string) => void; toBuffer: () => Buffer } };
  try {
    tts = await (KokoroTTS as {
      from_pretrained: (model: string, opts: { dtype: string; device: string }) => Promise<typeof tts>;
    }).from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    }) as typeof tts;
  } catch (e) {
    return {
      id: "s04",
      name: "Kokoro TTS (af_heart) under Bun",
      goal: "Verify kokoro-js runs under Bun and generates a valid WAV.",
      result: "fail",
      measurements: { ...measurements, "modelLoadError": String(e) },
      notes: "Could not load Kokoro model. May be an ONNX runtime / Bun compatibility issue. Gemini TTS (S05) is the fallback.",
      artifactPaths: [],
    };
  }
  const modelLoadMs = Math.round(performance.now() - t0);
  measurements["modelLoadMs"] = modelLoadMs;

  // Generate speech.
  const t1 = performance.now();
  let audio: { save: (path: string) => void; toBuffer: () => Buffer };
  try {
    audio = await tts.generate(narration, { voice: "af_heart" });
  } catch (e) {
    return {
      id: "s04",
      name: "Kokoro TTS (af_heart) under Bun",
      goal: "Verify kokoro-js runs under Bun and generates a valid WAV.",
      result: "fail",
      measurements: { ...measurements, "generationError": String(e) },
      notes: "Model loaded but generation failed. Gemini TTS (S05) is the fallback.",
      artifactPaths: [],
    };
  }
  const generationMs = Math.round(performance.now() - t1);
  measurements["generationMs"] = generationMs;

  // Save the audio.
  const wavPath = join(dir, "narration.wav");
  audio.save(wavPath);
  artifacts.push(wavPath);

  // Probe duration.
  let duration = 0;
  try {
    duration = await probeDuration(wavPath);
  } catch (e) {
    measurements["probeError"] = String(e);
  }
  const checksum = await fileChecksum(wavPath);

  const wordCount = narration.split(/\s+/).length;
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;
  const realtimeFactor = generationMs > 0 && duration > 0 ? generationMs / 1000 / duration : 0;

  const metaArtifact = await writeArtifact(
    "s04",
    "meta.json",
    JSON.stringify({
      narration,
      voice: "af_heart",
      model: "onnx-community/Kokoro-82M-v1.0-ONNX",
      dtype: "q8",
      device: "cpu",
      timings: { modelLoadMs, generationMs },
      durationSec: duration,
      wpm,
      realtimeFactor,
      checksum,
    }, null, 2),
  );
  artifacts.push(metaArtifact);

  const pass = duration > 0;
  return {
    id: "s04",
    name: "Kokoro TTS (af_heart) under Bun",
    goal: "Verify kokoro-js runs under Bun and generates a valid WAV.",
    result: pass ? "pass" : "fail",
    measurements: {
      ...measurements,
      "durationSec": duration.toFixed(2),
      "wordCount": wordCount,
      "wpm": wpm,
      "realtimeFactor": realtimeFactor.toFixed(2),
      "checksum": checksum.slice(0, 16) + "...",
    },
    notes: pass
      ? `Kokoro (af_heart) generated ${wordCount} words in ${generationMs}ms (audio: ${duration.toFixed(2)}s, RTF: ${realtimeFactor.toFixed(2)}). Runs under Bun. Quality assessment pending manual listening.`
      : "Generation completed but FFprobe could not read the WAV. Check audio format.",
    artifactPaths: artifacts,
  };
}
