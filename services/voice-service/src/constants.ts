// === Constants ===

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "am_michael";
const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CHATTERBOX_MODEL = "chatterbox-tts";
const CHATTERBOX_VOICE = "default";
const NORMALIZED_LOUDNESS = "loudnorm=I=-16:TP=-1.5:LRA=11";
const DEFAULT_INTER_SEGMENT_PAUSE_MS = 300;

export {
	KOKORO_MODEL,
	KOKORO_VOICE,
	GEMINI_TTS_MODEL,
	GEMINI_TTS_VOICE,
	GEMINI_API_BASE,
	CHATTERBOX_MODEL,
	CHATTERBOX_VOICE,
	NORMALIZED_LOUDNESS,
	DEFAULT_INTER_SEGMENT_PAUSE_MS,
};
