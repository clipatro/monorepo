/**
 * Provider pricing catalog.
 *
 * All rates are in USD per 1 million tokens unless otherwise noted.
 * Image pricing is per image at a given resolution tier.
 *
 * Prices verified Aug 21, 2026 against:
 *   - Gemini: https://ai.google.dev/gemini-api/docs/pricing
 *   - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *   - fal.ai: https://fal.ai/models/fal-ai/flux-2/klein/9b/edit
 *   - BFL (FLUX.2): https://help.bfl.ai/articles/7986977817
 *
 * DeepSeek uses off-peak rates as the default (pipeline runs asynchronously).
 * Peak rates (2x off-peak) are noted in each model's notes field.
 *
 * IMPORTANT: Update this catalog when providers change pricing or when
 * new adapters are added. The cost tracker reads from this catalog only.
 * Re-verify prices quarterly or when a provider announces a price change.
 */

export type PricingUnit = "per_1m_tokens" | "per_image" | "per_1k_search_queries" | "per_megapixel" | "per_second" | "per_video" | "free";

export interface ModelPricing {
  provider: string;
  model: string;
  /** How this model is priced. */
  unit: PricingUnit;
  /** Input price per 1M tokens (text/image input). */
  inputPer1mTokens?: number;
  /** Output price per 1M tokens (text/thinking output). */
  outputPer1mTokens?: number;
  /** Output price per 1M tokens (image output). */
  imageOutputPer1mTokens?: number;
  /** Flat cost per image at a resolution tier. */
  costPerImage?: {
    "0.5k": number;
    "1k": number;
    "2k": number;
    "4k": number;
  };
  /** Cost per input megapixel (fal.ai per-MP pricing). */
  inputPerMegapixel?: number;
  /** Cost per output megapixel (fal.ai per-MP pricing). */
  outputPerMegapixel?: number;
  /** Flat cost per megapixel (input + output combined, e.g. FLUX.2 4B). */
  perMegapixel?: number;
  /** Cost per 1,000 Google Search grounding queries. */
  groundingPer1kQueries?: number;
  /** Free monthly allowance for grounding searches. */
  groundingFreeMonthly?: number;
  /** Cost per second of generated video (fal.ai per-second video pricing). */
  costPerSecond?: number;
  /** Flat cost per generated video (fal.ai per-video pricing). */
  costPerVideo?: number;
  /** Whether this model is free (local, no API cost). */
  isFree?: boolean;
  /** Notes about pricing (e.g. promotional rates, expiration). */
  notes?: string;
}

/** The full pricing catalog. */
export const PRICING: Record<string, ModelPricing> = {
  // === Text generation models ===
  "gemini-3.6-flash": {
    provider: "gemini",
    model: "gemini-3.6-flash",
    unit: "per_1m_tokens",
    inputPer1mTokens: 1.50,
    outputPer1mTokens: 7.50,
    groundingPer1kQueries: 14,
    groundingFreeMonthly: 5000,
    notes: "Gemini 3.6 Flash. Source: https://ai.google.dev/gemini-api/docs/pricing (Aug 2026).",
  },
  "gemini-3.7-flash": {
    provider: "gemini",
    model: "gemini-3.7-flash",
    unit: "per_1m_tokens",
    inputPer1mTokens: 0.75,
    outputPer1mTokens: 3.75,
    groundingPer1kQueries: 14,
    groundingFreeMonthly: 5000,
    notes: "Promotional rate through Dec 31, 2026. Doubles starting Jan 1, 2027.",
  },
  "gemini-2.5-flash": {
    provider: "gemini",
    model: "gemini-2.5-flash",
    unit: "per_1m_tokens",
    inputPer1mTokens: 0.30,
    outputPer1mTokens: 2.10,
    notes: "Deprecated for new users. Use gemini-3.6-flash.",
  },

  // === DeepSeek text generation models ===
  "deepseek-v4-flash": {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    unit: "per_1m_tokens",
    inputPer1mTokens: 0.22,
    outputPer1mTokens: 0.66,
    notes: "DeepSeek V4 Flash. Off-peak rates (effective Aug 16, 2026). Peak: $0.44 in / $1.32 out. Cache hit: $0.007/1M off-peak, $0.014/1M peak. No grounding support. Source: https://api-docs.deepseek.com/quick_start/pricing",
  },
  "deepseek-v4-pro": {
    provider: "deepseek",
    model: "deepseek-v4-pro",
    unit: "per_1m_tokens",
    inputPer1mTokens: 0.66,
    outputPer1mTokens: 1.98,
    notes: "DeepSeek V4 Pro. Off-peak rates (effective Aug 16, 2026). Peak: $1.32 in / $3.96 out. Cache hit: $0.022/1M off-peak, $0.044/1M peak. No grounding support. Source: https://api-docs.deepseek.com/quick_start/pricing",
  },

  // === Image generation models ===
  "gemini-3.1-flash-image": {
    provider: "gemini",
    model: "gemini-3.1-flash-image",
    unit: "per_image",
    inputPer1mTokens: 0.50,
    outputPer1mTokens: 3.0,
    imageOutputPer1mTokens: 60.0,
    costPerImage: {
      "0.5k": 0.045,
      "1k": 0.067,
      "2k": 0.101,
      "4k": 0.151,
    },
    notes: "Nano Banana 2. Standard model for character scenes.",
  },
  "gemini-3.1-flash-lite-image": {
    provider: "gemini",
    model: "gemini-3.1-flash-lite-image",
    unit: "per_image",
    inputPer1mTokens: 0.25,
    outputPer1mTokens: 1.50,
    imageOutputPer1mTokens: 30.0,
    costPerImage: {
      "0.5k": 0.022,
      "1k": 0.034,
      "2k": 0.050,
      "4k": 0.076,
    },
    notes: "Nano Banana 2 Lite. For non-character scenes (backgrounds, environments).",
  },

  // === fal.ai image generation models (per-megapixel pricing) ===
  "fal-ai/flux-2/klein/9b/edit": {
    provider: "fal",
    model: "fal-ai/flux-2/klein/9b/edit",
    unit: "per_megapixel",
    inputPerMegapixel: 0.011,
    outputPerMegapixel: 0.011,
    notes: "FLUX.2 [klein] 9B edit endpoint on fal.ai. $0.011/MP for both input and output. Supports up to 4 reference images. Default character-scene model when IMAGE_PROVIDER=fal. Source: https://fal.ai/models/fal-ai/flux-2/klein/9b/edit",
  },
  "fal-ai/flux-2/klein/4b/edit": {
    provider: "fal",
    model: "fal-ai/flux-2/klein/4b/edit",
    unit: "per_megapixel",
    perMegapixel: 0.014,
    notes: "FLUX.2 [klein] 4B edit endpoint on fal.ai (distilled, 4-step). $0.014/MP flat for input + output combined. Supports up to 4 reference images. Source: https://help.bfl.ai/articles/7986977817",
  },
  "fal-ai/flux-2/klein/9b": {
    provider: "fal",
    model: "fal-ai/flux-2/klein/9b",
    unit: "per_megapixel",
    outputPerMegapixel: 0.006,
    notes: "FLUX.2 [klein] 9B text-to-image endpoint (no /edit). $0.006/MP output only. Used for non-character scenes with no reference images. Source: https://fal.ai/models/fal-ai/flux-2/klein/9b",
  },
  "fal-ai/flux-2/klein/4b": {
    provider: "fal",
    model: "fal-ai/flux-2/klein/4b",
    unit: "per_megapixel",
    perMegapixel: 0.005,
    notes: "FLUX.2 [klein] 4B text-to-image endpoint (no /edit, distilled). $0.005/MP flat. Used for non-character scenes with no reference images. Source: https://fal.ai/models/fal-ai/flux-2/klein/4b",
  },
  "fal-ai/nano-banana-2/edit": {
    provider: "fal",
    model: "fal-ai/nano-banana-2/edit",
    unit: "per_image",
    costPerImage: {
      "0.5k": 0.06,
      "1k": 0.08,
      "2k": 0.12,
      "4k": 0.16,
    },
    notes: "Nano Banana 2 (Gemini 3.1 Flash Image) via fal.ai. Up to 14 reference images. Use when IMAGE_PROVIDER=fal and IMAGE_MODEL=fal-ai/nano-banana-2/edit.",
  },

  // === TTS models ===
  "gemini-3.1-flash-tts-preview": {
    provider: "gemini",
    model: "gemini-3.1-flash-tts-preview",
    unit: "per_1m_tokens",
    inputPer1mTokens: 1.0,
    outputPer1mTokens: 20.0,
    notes: "Audio output priced at $20/1M tokens. Voice: Algenib.",
  },

  // === Embedding models ===
  "gemini-embedding-001": {
    provider: "gemini",
    model: "gemini-embedding-001",
    unit: "per_1m_tokens",
    inputPer1mTokens: 0.075,
    notes: "Hosted embedding model. Not used — we use local embeddings instead.",
  },

  // === Local models (free) ===
  "kokoro-82m": {
    provider: "kokoro",
    model: "kokoro-82m",
    unit: "free",
    isFree: true,
    notes: "Local TTS via kokoro-js. No API cost. CPU inference.",
  },
  "chatterbox-tts": {
    provider: "chatterbox",
    model: "chatterbox-tts",
    unit: "free",
    isFree: true,
    notes: "Local/self-hosted TTS via Chatterbox (OpenAI-compatible API). No API cost. GPU recommended.",
  },
  "all-minilm-l6-v2": {
    provider: "xenova",
    model: "all-MiniLM-L6-v2",
    unit: "free",
    isFree: true,
    notes: "Local embeddings via Transformers.js. No API cost.",
  },

  // === fal.ai video generation models (D017) ===
  "fal-ai/ltx-video": {
    provider: "fal",
    model: "fal-ai/ltx-video",
    unit: "per_video",
    costPerVideo: 0.02,
    notes: "LTX Video (preview) text-to-video on fal.ai. $0.02 per video. Cheapest option. 768x512 output. Source: https://fal.ai/models/fal-ai/ltx-video (Aug 2026).",
  },
  "fal-ai/ltx-video-13b-distilled": {
    provider: "fal",
    model: "fal-ai/ltx-video-13b-distilled",
    unit: "per_video",
    costPerVideo: 0.04,
    notes: "LTX Video 0.9.7 13B Distilled text-to-video on fal.ai. $0.04 per video. Higher quality than ltx-video preview. Source: https://fal.ai/models/fal-ai/ltx-video-13b-distilled (Aug 2026).",
  },
  "fal-ai/ltx-2/image-to-video/fast": {
    provider: "fal",
    model: "fal-ai/ltx-2/image-to-video/fast",
    unit: "per_second",
    costPerSecond: 0.04,
    notes: "LTX Video 2.0 Fast image-to-video on fal.ai. $0.04/sec at 1080p. 6-20s clips. Future use: first-frame from generated image. Source: https://fal.ai/models/fal-ai/ltx-2/image-to-video/fast (Aug 2026).",
  },
  "fal-ai/ltx-2.3/text-to-video/fast": {
    provider: "fal",
    model: "fal-ai/ltx-2.3/text-to-video/fast",
    unit: "per_second",
    costPerSecond: 0.04,
    notes: "LTX 2.3 Fast text-to-video on fal.ai. $0.04/sec at 1080p. New VAE for sharper details, 9:16 support, 6-20s clips. Cost-effective upgrade from ltx-video. Source: https://fal.ai/models/fal-ai/ltx-2.3/text-to-video/fast (Aug 2026).",
  },
  "fal-ai/ltx-2.3/text-to-video": {
    provider: "fal",
    model: "fal-ai/ltx-2.3/text-to-video",
    unit: "per_second",
    costPerSecond: 0.06,
    notes: "LTX 2.3 Pro text-to-video on fal.ai. $0.06/sec at 1080p. Full quality VAE, native audio, 6-20s clips, 24/48 FPS. Higher quality alternative. Source: https://fal.ai/models/fal-ai/ltx-2.3/text-to-video (Aug 2026).",
  },
  "fal-ai/wan/v2.7/text-to-video": {
    provider: "fal",
    model: "fal-ai/wan/v2.7/text-to-video",
    unit: "per_second",
    costPerSecond: 0.10,
    notes: "Wan 2.7 text-to-video on fal.ai (Alibaba). $0.10/sec at 720p, $0.15/sec at 1080p. Enhanced motion smoothness, 1080p, 5-15s clips. Premium option. Source: https://fal.ai/models/fal-ai/wan/v2.7/text-to-video (Aug 2026).",
  },
};

/** Get pricing for a model, throwing if unknown. */
export function getPricing(model: string): ModelPricing {
  const pricing = PRICING[model];
  if (!pricing) {
    throw new Error(`No pricing found for model "${model}". Add it to the pricing catalog.`);
  }
  return pricing;
}

/** Check if a model is free (local, no API cost). */
export function isFreeModel(model: string): boolean {
  return PRICING[model]?.isFree === true;
}
