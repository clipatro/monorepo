// === Chatterbox TTS Adapter (self-hosted, OpenAI-compatible, free) ===

/**
 * Chatterbox TTS is a self-hosted, OpenAI-compatible TTS API.
 * It runs as a separate service (e.g. https://github.com/travisvn/chatterbox-tts-api)
 * and exposes POST /audio/speech with the same interface as OpenAI's TTS API.
 *
 * This adapter calls that API and saves the resulting audio to outputPath.
 * No API key is needed for a local instance, but an optional bearer token
 * can be set via CHATTERBOX_API_KEY.
 *
 * The base URL is configurable via CHATTERBOX_API_BASE (default: http://localhost:4123).
 */

import { writeFile } from "node:fs/promises";
import { CHATTERBOX_MODEL, CHATTERBOX_VOICE } from "../constants";

/** Generate a single segment audio file using Chatterbox TTS. */
async function generateWithChatterbox(
	text: string,
	outputPath: string,
	voiceId: string = CHATTERBOX_VOICE,
): Promise<void> {
	const baseUrl = process.env.CHATTERBOX_API_BASE ?? "http://localhost:4123";
	const apiKey = process.env.CHATTERBOX_API_KEY;
	const model = process.env.CHATTERBOX_MODEL ?? CHATTERBOX_MODEL;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`;
	}

	const body = {
		model,
		input: text,
		voice: voiceId,
		response_format: "wav",
	};

	const res = await fetch(`${baseUrl}/audio/speech`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const errText = await res.text().catch(() => "");
		throw new Error(
			`Chatterbox TTS failed: HTTP ${res.status} — ${errText.slice(0, 200)}`,
		);
	}

	const audioBuffer = Buffer.from(await res.arrayBuffer());
	await writeFile(outputPath, audioBuffer);
}

export { generateWithChatterbox };
