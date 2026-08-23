/**
 * Voice synthesis facade types.
 *
 * The facade is provider-agnostic. Adapters (Kokoro, Gemini TTS, GCTS,
 * ElevenLabs) implement VoiceSynthesizer against this contract.
 */

/** A narration segment with a stable scene id. */
export interface NarrationSegment {
  /** Stable scene id. */
  sceneId: string;
  /** Order in the narration. */
  order: number;
  /** Narration text for this segment. */
  text: string;
}

/** Input to the voice synthesizer facade. */
export interface VoiceSynthesisInput {
  /** Full narration text, or per-scene segments. */
  segments: NarrationSegment[];
  /** Voice id, provider-specific, e.g. "af_heart" (Kokoro) or "Algenib" (Gemini TTS). */
  voiceId: string;
  /** Sample rate in Hz. */
  sampleRate?: number;
  /** Optional configurable pause between segments, in milliseconds. */
  interSegmentPauseMs?: number;
  /** Whether to request word-level alignment / timestamps. */
  requestWordTimings?: boolean;
}

/** Timing for a single segment within the master audio. */
export interface SegmentTiming {
  sceneId: string;
  /** Start time in the master audio, in milliseconds. */
  startMs: number;
  /** End time in the master audio, in milliseconds. */
  endMs: number;
  /** Path to the per-segment audio clip, when produced. */
  segmentFile?: string;
  /** Optional word-level timings, when available. */
  wordTimings?: WordTiming[];
}

/** A single word's timing within the audio. */
export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

/** Output of the voice synthesizer facade. */
export interface VoiceSynthesisOutput {
  /** Path to the master concatenated voice-over audio. */
  masterPath: string;
  /** MIME type, e.g. "audio/wav". */
  mimeType: string;
  /** Actual duration of the master audio, in milliseconds. */
  durationMs: number;
  /** Per-segment timing within the master audio. */
  timings: SegmentTiming[];
  /** Sample rate in Hz. */
  sampleRate: number;
}
