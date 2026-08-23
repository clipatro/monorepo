// === Kokoro Adapter (primary, local, free) ===

import type { KokoroInstance } from "../types";
import { KOKORO_MODEL, KOKORO_VOICE } from "../constants";

let kokoroInstance: KokoroInstance | null = null;
let kokoroLoading: Promise<KokoroInstance> | null = null;

async function getKokoro(): Promise<KokoroInstance> {
	if (kokoroInstance) return kokoroInstance;
	if (kokoroLoading) return kokoroLoading;

	kokoroLoading = (async () => {
		console.log("[voice-service] Loading Kokoro model...");
		const mod = await import("kokoro-js");
		const KokoroTTS = mod.KokoroTTS as unknown as {
			from_pretrained: (
				model: string,
				opts: { dtype: string; device: string },
			) => Promise<KokoroInstance>;
		};
		const instance = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
			dtype: "q8",
			device: "cpu",
		});
		kokoroInstance = instance;
		console.log("[voice-service] Kokoro model loaded.");
		return instance;
	})();

	return kokoroLoading;
}

/** Generate a single segment WAV using Kokoro. */
async function generateWithKokoro(
	text: string,
	outputPath: string,
	voiceId: string = KOKORO_VOICE,
): Promise<void> {
	const tts = await getKokoro();
	const audio = await tts.generate(text, { voice: voiceId });
	audio.save(outputPath);
}

export { getKokoro, generateWithKokoro };
