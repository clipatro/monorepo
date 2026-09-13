/**
 * S23 kids video — TTS narration stage.
 *
 * Generates a child-friendly voice-over for the full narration using Gemini
 * TTS. Uses a warm, energetic, engaging delivery style appropriate for
 * children's content. In dry-run mode, generates a silent dummy WAV.
 *
 * Reuses the voice-service Gemini TTS adapter pattern (PCM → WAV via FFmpeg,
 * cost tracking via @automation/cost-tracker).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDryRun } from "@automation/contracts";
import { checkBudget, calculateCost, recordCost } from "@automation/cost-tracker";

const execAsync = promisify(exec);
const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = "Algenib"; // Warm, clear voice — works well for kids
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// === Output types ===

export interface TtsStageOutput {
  wavPath: string;
  durationSec: number;
  costUsd: number;
}

// === Dummy WAV generator (dry-run) ===

function generateDummyWav(durationSec: number): Buffer {
  const sampleRate = 24000;
  const numSamples = Math.ceil(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

// === Kid-friendly TTS prompt ===

function buildKidsTtsPrompt(text: string): string {
  return `Perform the narration inside <script> exactly as written. Do not add, remove, or reorder any word.

VOICE DIRECTION:
- Natural, warm, friendly en-US pronunciation — like a cheerful teacher or storyteller talking to children.
- Energetic and engaging tone — sound excited about the topic, like you're sharing something amazing.
- Bright, clear, and expressive — vary your tone to match the story's emotions.
- Speak at a measured pace — clear enough for young listeners to follow, but not slow.
- Emphasize key words and fun moments — make the facts feel surprising and delightful.
- Sound like you're having fun telling this story, not reading a script.
- Keep it positive and encouraging throughout.

<script>
${text}
</script>`;
}

// === Main TTS function ===

export async function generateNarration(
  narration: string,
  outDir: string,
  apiKey: string,
): Promise<TtsStageOutput> {
  const wavPath = join(outDir, "narration.wav");
  let costUsd = 0;
  let durationSec = 10;

  if (isDryRun()) {
    durationSec = Math.max(10, Math.ceil(narration.length / 15));
    const dummyWav = generateDummyWav(durationSec);
    await writeFile(wavPath, dummyWav);
    return { wavPath, durationSec, costUsd };
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set for Gemini TTS");
  }

  const estimatedCost = 0.05;
  checkBudget(estimatedCost, {});

  const ttsPrompt = buildKidsTtsPrompt(narration);
  const body = {
    contents: [{ role: "user", parts: [{ text: ttsPrompt }] }],
    generationConfig: {
      temperature: 1,
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE },
        },
      },
    },
  };

  const t0 = performance.now();
  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const latencyMs = Math.round(performance.now() - t0);
  const raw = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    throw new Error(`Gemini TTS failed: ${raw.error?.message ?? `HTTP ${res.status}`}`);
  }

  const audioPart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!audioPart?.inlineData?.data) {
    throw new Error("Gemini TTS returned no audio");
  }

  const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const pcmPath = join(outDir, "narration.pcm");
  await writeFile(pcmPath, pcmBuffer);

  // PCM → WAV via ffmpeg. Apply atempo=1.05 (slight speed-up keeps kids engaged).
  await execAsync(
    `ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -filter:a "atempo=1.05" -c:a pcm_s16le "${wavPath}"`,
  );

  // Probe duration
  const { stdout: probeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${wavPath}"`,
  );
  const probe = JSON.parse(probeOut) as { format?: { duration?: string } };
  durationSec = parseFloat(probe.format?.duration ?? "10");

  const usage = raw.usageMetadata ?? {};
  const cost = calculateCost({
    model: GEMINI_TTS_MODEL,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  });
  recordCost(cost, {
    capability: "voice.synthesize",
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    notes: `latency=${latencyMs}ms, voice=${GEMINI_TTS_VOICE}, kids-video, duration=${durationSec.toFixed(1)}s`,
  });
  costUsd = cost.totalCost;

  return { wavPath, durationSec, costUsd };
}
