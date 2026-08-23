/**
 * Pre-cache the Kokoro TTS model during Docker build.
 *
 * Downloads the model files into the @huggingface/transformers cache directory
 * so the voice-service doesn't need to download them at runtime. This prevents
 * runtime download failures from triggering the paid Gemini TTS fallback.
 *
 * Run during `docker build` via the Dockerfile.services pre-cache stage.
 */
import { KOKORO_MODEL } from "../src/constants.ts";

console.log(`[precache] Downloading Kokoro model: ${KOKORO_MODEL}...`);

const mod = await import("kokoro-js");
const KokoroTTS = mod.KokoroTTS as unknown as {
	from_pretrained: (
		model: string,
		opts: { dtype: string; device: string },
	) => Promise<unknown>;
};

await KokoroTTS.from_pretrained(KOKORO_MODEL, {
	dtype: "q8",
	device: "cpu",
});

console.log(`[precache] Kokoro model cached successfully.`);
