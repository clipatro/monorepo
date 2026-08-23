/**
 * S05 — Gemini TTS (Algenib / gemini-3.1-flash-tts-preview) fallback.
 *
 * Goal: Verify Gemini TTS can synthesize speech from text, return audio,
 * and that we can decode it to a WAV and probe its duration. This is the
 * fallback if Kokoro (S04) fails under Bun.
 *
 * Gemini TTS uses prebuilt voices. "Algenib" is the user's requested voice.
 * The API takes text + a speechConfig with voiceName.
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(exec);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.1-flash-tts-preview";
const API = "https://generativelanguage.googleapis.com/v1beta";

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
  );
  return parseFloat(stdout.trim());
}

export async function run(): Promise<SpikeResult> {
  if (!GEMINI_KEY) {
    return {
      id: "s05",
      name: "Gemini TTS (Algenib) fallback",
      goal: "Verify Gemini TTS synthesizes speech and decodes to a probeable WAV.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  const dir = await spikeDir("s05");
  const artifacts: string[] = [];
  const narration = "Have you ever wondered why we procrastinate, even when we know it will hurt us later? It's not laziness. It's your brain choosing instant comfort over future reward.";

  // Gemini TTS: text goes in the parts, voice config in generationConfig.
  const body = {
    contents: [{ role: "user", parts: [{ text: narration }] }],
    generationConfig: {
      temperature: 1,
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Algenib" },
        },
      },
    },
  };

  const t0 = performance.now();
  const res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          text?: string;
        }>;
      };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    const artifact = await writeArtifact("s05", "error.json", JSON.stringify(raw, null, 2));
    return {
      id: "s05",
      name: "Gemini TTS (Algenib) fallback",
      goal: "Verify Gemini TTS synthesizes speech and decodes to a probeable WAV.",
      result: "fail",
      measurements: { "httpStatus": res.status, "latencyMs": latencyMs, "errorMessage": raw.error?.message ?? "unknown" },
      notes: "Gemini TTS API returned an error.",
      artifactPaths: [artifact],
    };
  }

  const parts = raw.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  const usage = raw.usageMetadata ?? {};

  if (!audioPart?.inlineData?.data) {
    const artifact = await writeArtifact("s05", "response.json", JSON.stringify(raw, null, 2));
    return {
      id: "s05",
      name: "Gemini TTS (Algenib) fallback",
      goal: "Verify Gemini TTS synthesizes speech and decodes to a probeable WAV.",
      result: "fail",
      measurements: { "httpStatus": res.status, "latencyMs": latencyMs, "hasAudio": false },
      notes: "No audio inlineData returned.",
      artifactPaths: [artifact],
    };
  }

  const mimeType = audioPart.inlineData.mimeType ?? "audio/l16";
  const rawBuf = Buffer.from(audioPart.inlineData.data, "base64");

  // Gemini TTS returns raw L16 PCM (linear 16-bit) by default, not a container.
  // We need to wrap it into WAV using ffmpeg. Gemini TTS PCM is 24000 Hz, mono, s16le.
  const rawPcmPath = join(dir, "narration.pcm");
  await writeBinaryArtifact("s05", "narration.pcm", rawBuf);
  artifacts.push(rawPcmPath);

  const wavPath = join(dir, "narration.wav");
  // Wrap raw PCM s16le @ 24000Hz mono into WAV.
  await execAsync(
    `ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${rawPcmPath}" -c:a pcm_s16le "${wavPath}"`,
  );
  artifacts.push(wavPath);

  const duration = await probeDuration(wavPath);
  const checksum = await fileChecksum(wavPath);

  const metaArtifact = await writeArtifact(
    "s05",
    "meta.json",
    JSON.stringify({
      narration,
      voice: "Algenib",
      model: MODEL,
      mimeType,
      latencyMs,
      durationSec: duration,
      usage,
    }, null, 2),
  );
  artifacts.push(metaArtifact);

  // Word count for words-per-minute estimate
  const wordCount = narration.split(/\s+/).length;
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;

  return {
    id: "s05",
    name: "Gemini TTS (Algenib) fallback",
    goal: "Verify Gemini TTS synthesizes speech and decodes to a probeable WAV.",
    result: duration > 0 ? "pass" : "fail",
    measurements: {
      "httpStatus": res.status,
      "latencyMs": latencyMs,
      "mimeType": mimeType,
      "hasAudio": true,
      "durationSec": duration.toFixed(2),
      "wordCount": wordCount,
      "wpm": wpm,
      "wavSizeBytes": rawBuf.length,
      "checksum": checksum.slice(0, 16) + "...",
      "promptTokens": usage.promptTokenCount ?? 0,
      "outputTokens": usage.candidatesTokenCount ?? 0,
    },
    notes: duration > 0
      ? `Gemini TTS (Algenib) synthesized ${wordCount} words in ${duration.toFixed(2)}s (${wpm} WPM). Raw L16 PCM wrapped to WAV via ffmpeg. Quality assessment pending manual listening.`
      : "FFprobe could not read the WAV duration.",
    artifactPaths: artifacts,
  };
}
