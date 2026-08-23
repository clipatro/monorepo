/**
 * Cost calculator — converts provider usage metadata into USD costs.
 *
 * Uses the pricing catalog to compute the actual cost of a provider call
 * based on token counts, image resolution, and search queries.
 */

import { getPricing, isFreeModel, type ModelPricing } from "./pricing.ts";

export interface UsageInput {
  model: string;
  /** Input token count. */
  inputTokens?: number;
  /** Output token count (text/thinking). */
  outputTokens?: number;
  /** Image output token count (if billed separately from text output). */
  imageOutputTokens?: number;
  /** Number of images generated. */
  imageCount?: number;
  /** Image resolution tier, if billing per image. */
  imageResolution?: "0.5k" | "1k" | "2k" | "4k";
  /** Input megapixels (fal.ai per-MP pricing). */
  inputMegapixels?: number;
  /** Output megapixels (fal.ai per-MP pricing). */
  outputMegapixels?: number;
  /** Total megapixels (input + output, for flat per-MP models like FLUX.2 4B). */
  totalMegapixels?: number;
  /** Number of Google Search grounding queries. */
  groundingQueries?: number;
  /** Seconds of generated video (fal.ai per-second video pricing). */
  videoSeconds?: number;
  /** Number of videos generated (fal.ai per-video pricing). */
  videoCount?: number;
}

export interface CostBreakdown {
  model: string;
  provider: string;
  inputCost: number;
  outputCost: number;
  imageCost: number;
  groundingCost: number;
  totalCost: number;
  isFree: boolean;
  /** The pricing entry used, for audit. */
  pricing: ModelPricing;
}

/** Calculate the cost of a provider call from usage data. */
export function calculateCost(usage: UsageInput): CostBreakdown {
  const pricing = getPricing(usage.model);
  const isFree = isFreeModel(usage.model);

  if (isFree) {
    return {
      model: usage.model,
      provider: pricing.provider,
      inputCost: 0,
      outputCost: 0,
      imageCost: 0,
      groundingCost: 0,
      totalCost: 0,
      isFree: true,
      pricing,
    };
  }

  // Input cost (per 1M tokens)
  const inputCost = pricing.inputPer1mTokens && usage.inputTokens
    ? (usage.inputTokens / 1_000_000) * pricing.inputPer1mTokens
    : 0;

  // Output cost (text/thinking, per 1M tokens)
  const outputCost = pricing.outputPer1mTokens && usage.outputTokens
    ? (usage.outputTokens / 1_000_000) * pricing.outputPer1mTokens
    : 0;

  // Image cost — either per image at a resolution tier, per 1M image output tokens,
  // or per megapixel (fal.ai models)
  let imageCost = 0;
  if (usage.imageCount && usage.imageResolution && pricing.costPerImage) {
    const perImage = pricing.costPerImage[usage.imageResolution] ?? 0;
    imageCost = perImage * usage.imageCount;
  } else if (pricing.imageOutputPer1mTokens && usage.imageOutputTokens) {
    imageCost = (usage.imageOutputTokens / 1_000_000) * pricing.imageOutputPer1mTokens;
  } else if (pricing.unit === "per_megapixel") {
    // fal.ai per-megapixel pricing
    if (pricing.perMegapixel && usage.totalMegapixels) {
      // Flat per-MP rate (input + output combined, e.g. FLUX.2 4B)
      imageCost = usage.totalMegapixels * pricing.perMegapixel;
    } else if (pricing.inputPerMegapixel || pricing.outputPerMegapixel) {
      // Split input/output rates (e.g. FLUX.2 9B)
      const inMP = usage.inputMegapixels ?? 0;
      const outMP = usage.outputMegapixels ?? 0;
      imageCost = inMP * (pricing.inputPerMegapixel ?? 0) + outMP * (pricing.outputPerMegapixel ?? 0);
    }
  }

  // Grounding cost — first N queries free per month, then $14/1k
  let groundingCost = 0;
  if (usage.groundingQueries && pricing.groundingPer1kQueries) {
    const freeAllowance = pricing.groundingFreeMonthly ?? 0;
    // Note: the free allowance is shared across all Gemini 3.x models per month.
    // The cost tracker handles the monthly accumulator; here we compute the
    // marginal cost assuming the allowance is already consumed.
    // The ledger will adjust for the free allowance.
    groundingCost = (usage.groundingQueries / 1000) * pricing.groundingPer1kQueries;
  }

  // Video cost — per second or per video (fal.ai video generation, D017)
  let videoCost = 0;
  if (pricing.costPerSecond && usage.videoSeconds) {
    videoCost = usage.videoSeconds * pricing.costPerSecond;
  } else if (pricing.costPerVideo && usage.videoCount) {
    videoCost = pricing.costPerVideo * usage.videoCount;
  }

  return {
    model: usage.model,
    provider: pricing.provider,
    inputCost: roundCents(inputCost),
    outputCost: roundCents(outputCost),
    imageCost: roundCents(imageCost),
    groundingCost: roundCents(groundingCost),
    totalCost: roundCents(inputCost + outputCost + imageCost + groundingCost + videoCost),
    isFree: false,
    pricing,
  };
}

/** Round to 6 decimal places (micro-cent precision). */
function roundCents(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Estimate image resolution tier from pixel dimensions. */
export function resolutionTier(width: number, height: number): "0.5k" | "1k" | "2k" | "4k" {
  const maxDim = Math.max(width, height);
  if (maxDim <= 512) return "0.5k";
  if (maxDim <= 1024) return "1k";
  if (maxDim <= 2048) return "2k";
  return "4k";
}
