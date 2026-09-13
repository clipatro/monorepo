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
	voiceoverSpeed: number = 1.0,
): Promise<void> {
	const tts = await getKokoro();
	// Kokoro supports a speed option natively (1.0 = normal, 1.1 = 10% faster)
	const audio = await tts.generate(text, {
		voice: voiceId,
		...(Math.abs(voiceoverSpeed - 1.0) >= 0.01 ? { speed: voiceoverSpeed } : {}),
	});
	audio.save(outputPath);
}

export { getKokoro, generateWithKokoro };
