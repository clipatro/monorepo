// === Gemini TTS Adapter (fallback, paid) ===

import { writeFile } from "node:fs/promises";
import {
	checkBudget,
	calculateCost,
	recordCost,
} from "@automation/cost-tracker";
import { runCmd } from "../utils";
import {
	GEMINI_TTS_MODEL,
	GEMINI_TTS_VOICE,
	GEMINI_API_BASE,
} from "../constants";

// === Dry-run flag ===

import { isDryRun } from "@automation/contracts";

// === Dummy WAV generation (dry-run mode) ===

/**
 * Generate a minimal valid WAV file (silence) of the given duration.
 * The pipeline needs a real WAV file to process with FFmpeg.
 */
function generateDummyWav(durationSec: number): Buffer {
	const sampleRate = 24000; // 24kHz mono — matches Gemini TTS output
	const numSamples = Math.ceil(sampleRate * durationSec);
	const dataSize = numSamples * 2; // 16-bit samples
	const buffer = Buffer.alloc(44 + dataSize);

	// RIFF header
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write("WAVE", 8);

	// fmt chunk
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16); // chunk size
	buffer.writeUInt16LE(1, 20); // PCM format
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
	buffer.writeUInt16LE(2, 32); // block align
	buffer.writeUInt16LE(16, 34); // bits per sample

	// data chunk
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataSize, 40);
	// Samples are already zero (silence)

	return buffer;
}

function buildGeminiTtsPrompt(
	text: string,
	locale: string = "en-US",
	deliveryStyle: string = "direct, conversational, and emotionally restrained",
): string {
	return `Perform the short-form narration inside <script> exactly as written. Do not add, remove, paraphrase, repeat, or reorder any word. Do not speak these directions or the tags.

VOICE DIRECTION:
- Natural ${locale} pronunciation.
- ${deliveryStyle}.
- Sound like one thoughtful person speaking to one listener, never an announcer, advertisement, synthetic assistant, or exaggerated trailer voice.
- The voice must start immediately on the first word with no pre-roll sound or verbal introduction.
- Speak at a brisk, purposeful pace — lean slightly fast, not leisurely. Keep momentum through every sentence.
- Give the opening line crisp intent, then vary pace subtly with the meaning.
- Use restrained, believable emotion; preserve natural breaths and sentence-final pauses.
- Use no announcer voice, sing-song cadence, melodrama, vocal fry added for effect, or artificial emphasis on every sentence.

<script>
${text}
</script>`;
}

/** Generate a single segment WAV using Gemini TTS. Returns cost info. */
async function generateWithGeminiTts(
	apiKey: string,
	text: string,
	outputPath: string,
	voiceId: string = GEMINI_TTS_VOICE,
	runId?: string,
	stepId?: string,
	delivery?: { locale?: string; style?: string },
): Promise<{ costUsd: number }> {
	// === Dry-run mode: generate a silent dummy WAV ===
	if (isDryRun()) {
		// Estimate duration: ~15 chars per second of speech
		const durationSec = Math.max(1, Math.ceil(text.length / 15));
		const wavBuffer = generateDummyWav(durationSec);
		await writeFile(outputPath, wavBuffer);

		const cost = calculateCost({
			model: GEMINI_TTS_MODEL,
			inputTokens: 0,
			outputTokens: 0,
		});
		cost.totalCost = 0;

		recordCost(cost, {
			runId,
			stepId,
			capability: "voice.synthesize",
			inputTokens: 0,
			outputTokens: 0,
			notes: `DRY-RUN dummy audio ${durationSec}s (no API call)`,
		});

		console.log(
			`[voice-service] DRY-RUN: generated dummy WAV ${durationSec}s (no API call)`,
		);
		return { costUsd: 0 };
	}

	if (!apiKey)
		throw new Error("GEMINI_API_KEY not set for Gemini TTS fallback");

	// Check budget before the call
	const estimatedCost = 0.01;
	checkBudget(estimatedCost, { runId });

	const ttsPrompt = buildGeminiTtsPrompt(
		text,
		delivery?.locale,
		delivery?.style,
	);
	const body = {
		contents: [{ role: "user", parts: [{ text: ttsPrompt }] }],
		generationConfig: {
			temperature: 1,
			responseModalities: ["AUDIO"],
			speechConfig: {
				voiceConfig: {
					prebuiltVoiceConfig: { voiceName: voiceId },
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
			content?: {
				parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
			};
		}>;
		error?: { message?: string };
		usageMetadata?: {
			promptTokenCount?: number;
			candidatesTokenCount?: number;
		};
	};

	if (!res.ok) {
		throw new Error(
			`Gemini TTS failed: ${raw.error?.message ?? `HTTP ${res.status}`}`,
		);
	}

	const audioPart = raw.candidates?.[0]?.content?.parts?.find(
		(p) => p.inlineData?.data,
	);
	if (!audioPart?.inlineData?.data) {
		throw new Error("Gemini TTS returned no audio data");
	}

	// Gemini TTS returns raw L16 PCM @ 24kHz mono — wrap to WAV via ffmpeg.
	// Apply atempo=1.1 to speed up the narration by 30% without changing
	// pitch — Gemini TTS tends to speak slowly for short-form content.
	const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
	const pcmPath = outputPath.replace(/\.wav$/, ".pcm");
	await writeFile(pcmPath, pcmBuffer);

	await runCmd(
		`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -filter:a "atempo=1.1" -c:a pcm_s16le "${outputPath}"`,
	);

	// Calculate and record cost
	const usage = raw.usageMetadata ?? {};
	const cost = calculateCost({
		model: GEMINI_TTS_MODEL,
		inputTokens: usage.promptTokenCount ?? 0,
		outputTokens: usage.candidatesTokenCount ?? 0,
	});

	recordCost(cost, {
		runId,
		stepId,
		capability: "voice.synthesize",
		inputTokens: usage.promptTokenCount ?? 0,
		outputTokens: usage.candidatesTokenCount ?? 0,
		notes: `latency=${latencyMs}ms, voice=${voiceId}`,
	});

	return { costUsd: cost.totalCost };
}

export { buildGeminiTtsPrompt, generateWithGeminiTts };
