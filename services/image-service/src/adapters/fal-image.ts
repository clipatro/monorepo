import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkBudget, calculateCost, recordCost, resolutionTier } from "@automation/cost-tracker";
import { isDryRun, getDryRunMediaPath } from "@automation/contracts";
import { imageDimensions, sha256, optimizeReferenceImage } from "../utils";
import type { ImageGenResult } from "../types";

// === Dummy image generation (dry-run mode) ===

/**
 * Generate a minimal valid PNG buffer of the given dimensions.
 * Reused from GeminiFlashImageAdapter for dry-run parity.
 */
function generateDummyPng(width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk("IHDR", ihdrData);

  // IDAT chunk — simple gray image
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      const shade = 100 + Math.floor((x / width) * 55);
      rawData[px] = shade;
      rawData[px + 1] = shade;
      rawData[px + 2] = shade;
    }
  }
  const compressed = zlibDeflateSync(rawData);
  const idat = makeChunk("IDAT", compressed);

  const iend = makeChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

import { deflateSync } from "node:zlib";
function zlibDeflateSync(data: Buffer): Buffer {
  return deflateSync(data);
}

const crcTable: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// === Aspect ratio → dimensions ===

/**
 * Convert an aspect ratio string ("9:16", "1:1", "16:9") to pixel dimensions.
 * fal.ai edit endpoints accept a custom { width, height } object.
 * Output is rounded to the nearest multiple of 16 (FLUX requirement).
 */
function aspectRatioToDimensions(
  aspectRatio: string,
  baseSize: number = 1024,
): { width: number; height: number } {
  const [aw, ah] = aspectRatio.split(":").map(Number);
  if (!aw || !ah) return { width: baseSize, height: baseSize };
  const ratio = aw / ah;
  let width: number, height: number;
  if (ratio >= 1) {
    width = baseSize;
    height = Math.round(baseSize / ratio);
  } else {
    height = baseSize;
    width = Math.round(baseSize * ratio);
  }
  // Round to multiple of 16
  width = Math.round(width / 16) * 16;
  height = Math.round(height / 16) * 16;
  return { width, height };
}

// === fal.ai Image Generation Adapter ===

/**
 * FalImageAdapter — generates an image using fal.ai's hosted models.
 *
 * Supports any fal.ai image-edit endpoint that accepts `image_urls` (up to 4
 * reference images as data URIs) and a `prompt`. Currently used for:
 *   - fal-ai/flux-2/klein/9b/edit (default, character scenes)
 *   - fal-ai/flux-2/klein/4b/edit (fastest, character scenes)
 *   - fal-ai/nano-banana-2/edit (Gemini via fal, future option)
 *
 * Reference images are downscaled to 512x512 via ffmpeg before upload to
 * minimize per-megapixel input cost (S12 confirmed this preserves identity).
 *
 * In dry-run mode, returns a dummy gray PNG image instead of calling the API.
 */
async function generateWithFal(
  apiKey: string,
  model: string,
  prompt: string,
  references: Array<{ buffer: Buffer; mimeType: string }>,
  temperature: number,
  runId?: string,
  stepId?: string,
  aspectRatio: string = "9:16",
  referenceSize: number = 512,
): Promise<ImageGenResult> {
  // === Dry-run mode: return a placeholder image ===
  if (isDryRun()) {
    let imageBuffer: Buffer;
    let width: number;
    let height: number;
    try {
      const placeholderPath = join(getDryRunMediaPath(), "placeholder-image.png");
      imageBuffer = await readFile(placeholderPath);
      const dims = imageDimensions(imageBuffer);
      width = dims.width;
      height = dims.height;
    } catch {
      const dims = aspectRatioToDimensions(aspectRatio);
      width = dims.width;
      height = dims.height;
      imageBuffer = generateDummyPng(width, height);
    }
    const mimeType = "image/png";
    const checksum = sha256(imageBuffer);
    const tier = resolutionTier(width, height);

    const cost = calculateCost({
      model,
      imageCount: 1,
      imageResolution: tier,
    });

    // Zero-cost in dry-run
    cost.totalCost = 0;
    cost.imageCost = 0;

    recordCost(cost, {
      runId,
      stepId,
      capability: "image.generate",
      inputTokens: 0,
      outputTokens: 0,
      notes: `DRY-RUN placeholder image ${width}x${height} via fal.ai ${model}`,
    });

    console.log(`[image-service] DRY-RUN: using placeholder image ${width}x${height} (no API call)`);

    return {
      imageBuffer,
      mimeType,
      width,
      height,
      checksum,
      costUsd: 0,
      remoteRequestId: `dry-run-${Date.now()}`,
    };
  }

  // Check budget before the call (conservative estimate)
  const estimatedCost = 0.05;
  checkBudget(estimatedCost, { runId });

  // Optimize reference images via ffmpeg (downscale to 512x512)
  // This reduces per-megapixel input cost by ~4x (S12 confirmed).
  const optimizedRefs: Array<{ buffer: Buffer; width: number; height: number }> = [];
  for (const ref of references) {
    const optimized = await optimizeReferenceImage(ref.buffer, referenceSize);
    optimizedRefs.push(optimized);
  }

  // Build data URIs for fal.ai (it accepts base64 data URIs in image_urls)
  const imageDataUris = optimizedRefs.map((ref) => {
    const base64 = ref.buffer.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  });

  // Compute output dimensions from aspect ratio
  const { width: outWidth, height: outHeight } = aspectRatioToDimensions(aspectRatio);

  // Build the fal.ai request body.
  // The edit endpoints require at least one reference image (image_urls).
  // When there are no references (non-character scenes), strip the "/edit"
  // suffix to use the generation endpoint instead, which doesn't need image_urls.
  const isEditEndpoint = model.endsWith("/edit");
  const hasReferences = imageDataUris.length > 0;
  const actualModel = isEditEndpoint && !hasReferences
    ? model.replace(/\/edit$/, "")
    : model;

  const requestBody: Record<string, unknown> = {
    prompt,
    image_size: { width: outWidth, height: outHeight },
    num_inference_steps: 4,
    num_images: 1,
    output_format: "jpeg",
    enable_safety_checker: true,
    sync_mode: false,
  };

  // Only include image_urls for edit endpoints with references
  if (hasReferences) {
    requestBody.image_urls = imageDataUris;
  }

  const endpoint = `https://fal.run/${actualModel}`;
  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    images?: Array<{
      url?: string;
      content_type?: string;
      file_name?: string;
      file_size?: number;
      width?: number;
      height?: number;
    }>;
    seed?: number;
    timings?: { inference?: number };
    has_nsfw_concepts?: boolean[];
    detail?: string;
    error?: string;
  };

  if (!res.ok) {
    const detail = raw.detail ?? raw.error ?? `HTTP ${res.status}`;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`fal.ai image generation failed (${actualModel}): ${msg}`);
  }

  const imageResult = raw.images?.[0];
  const imageURL = imageResult?.url;
  if (!imageURL) {
    throw new Error(`fal.ai returned no image in response (${model})`);
  }

  // Download the generated image
  const imgRes = await fetch(imageURL);
  if (!imgRes.ok) {
    throw new Error(`fal.ai: failed to download generated image (HTTP ${imgRes.status})`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  const mimeType = imageResult?.content_type ?? "image/jpeg";
  const { width, height } = imageDimensions(imageBuffer);
  const checksum = sha256(imageBuffer);

  // Calculate cost — per-megapixel pricing for FLUX.2, per-image for Nano Banana
  const inputMP = optimizedRefs.reduce((sum, r) => sum + (r.width * r.height) / 1_000_000, 0);
  const outputMP = (width * height) / 1_000_000;
  const tier = resolutionTier(width, height);

  const pricing = calculateCost({
    model: actualModel,
    inputMegapixels: inputMP,
    outputMegapixels: outputMP,
    totalMegapixels: inputMP + outputMP,
    imageCount: 1,
    imageResolution: tier,
  });

  recordCost(pricing, {
    runId,
    stepId,
    capability: "image.generate",
    inputTokens: 0,
    outputTokens: 0,
    notes: `latency=${latencyMs}ms, ${width}x${height}, inMP=${inputMP.toFixed(2)}, outMP=${outputMP.toFixed(2)}, refs=${optimizedRefs.length}`,
  });

  const remoteRequestId = raw.seed ? `fal-seed-${raw.seed}` : null;

  return {
    imageBuffer,
    mimeType,
    width,
    height,
    checksum,
    costUsd: pricing.totalCost,
    remoteRequestId,
  };
}

export { generateWithFal, aspectRatioToDimensions };
