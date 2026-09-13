import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { checkBudget, calculateCost, recordCost, resolutionTier } from "@automation/cost-tracker";
import { isDryRun, getDryRunMediaPath } from "@automation/contracts";
import { imageDimensions, sha256 } from "../utils";
import type { ImageGenResult } from "../types";

// === Dummy image generation (dry-run mode) ===

/**
 * Generate a minimal valid PNG buffer of the given dimensions.
 * Reused from FalImageAdapter for dry-run parity.
 */
function generateDummyPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk("IHDR", ihdrData);
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0;
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      const shade = 100 + Math.floor((x / width) * 55);
      rawData[px] = shade;
      rawData[px + 1] = shade;
      rawData[px + 2] = shade;
    }
  }
  const compressed = deflateSync(rawData);
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
  width = Math.round(width / 16) * 16;
  height = Math.round(height / 16) * 16;
  return { width, height };
}

// === Runware Image Generation Adapter ===

/**
 * RunwareImageAdapter — generates an image using the Runware API.
 *
 * Uses pure text-to-image with a fixed seed for character consistency
 * (per AGENTS.md D024 — no reference/seed images, the character description
 * is repeated verbatim in every scene prompt).
 *
 * Currently used for:
 *   - runware:108@1 (Qwen-Image, Alibaba) — default for kids video pipeline
 *
 * In dry-run mode, returns a dummy gray PNG image instead of calling the API.
 */
async function generateWithRunware(
  apiKey: string,
  model: string,
  prompt: string,
  _references: Array<{ buffer: Buffer; mimeType: string }>,
  temperature: number,
  runId?: string,
  stepId?: string,
  aspectRatio: string = "9:16",
  opts?: {
    /** Kids template: negative prompt (text-free + text-safe region hints). */
    negativePrompt?: string;
    /** Kids template: explicit output dimensions (1024x1536 portrait). */
    width?: number;
    height?: number;
    /** Kids template: JPEG output quality (95 in the s23 spike). */
    outputQuality?: number;
  },
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

    cost.totalCost = 0;
    cost.imageCost = 0;

    recordCost(cost, {
      runId,
      stepId,
      capability: "image.generate",
      inputTokens: 0,
      outputTokens: 0,
      notes: `DRY-RUN placeholder image ${width}x${height} via Runware ${model}`,
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

  // Check budget before the call
  const estimatedCost = 0.01;
  checkBudget(estimatedCost, { runId });

  // Compute output dimensions from aspect ratio, or use the explicit
  // override (kids template uses 1024x1536 like the s23 spike).
  const { width: defaultW, height: defaultH } = aspectRatioToDimensions(aspectRatio);
  const outWidth = opts?.width ?? defaultW;
  const outHeight = opts?.height ?? defaultH;

  // Build the Runware request body.
  // Runware uses a JSON array of tasks. We send a single imageInference task.
  // Character consistency is achieved via the prompt (locked character description)
  // + a fixed seed (42) — no reference images are used.
  const taskUUID = randomUUID();
  const requestBody = [
    {
      taskType: "imageInference",
      taskUUID,
      model,
      positivePrompt: prompt,
      ...(opts?.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      width: outWidth,
      height: outHeight,
      numberResults: 1,
      steps: 28,
      CFGScale: 6,
      seed: 42, // Fixed seed for character consistency
      outputFormat: "JPEG",
      ...(opts?.outputQuality ? { outputQuality: opts.outputQuality } : {}),
      outputType: "URL",
      checkNSFW: true,
      includeCost: true, // required by Runware API to return the cost field
    },
  ];

  const t0 = performance.now();
  const res = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    data?: Array<{
      imageURL: string;
      cost?: number;
      imageBase64Data?: string;
      taskUUID?: string;
      seed?: number;
    }>;
    errors?: Array<{ code: string; message: string }>;
  };

  if (!res.ok) {
    const errMsg = raw.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Runware image generation failed (${model}): ${errMsg}`);
  }

  const imageResult = raw.data?.[0];
  const imageURL = imageResult?.imageURL;
  if (!imageURL) {
    throw new Error(`Runware returned no image in response (${model})`);
  }

  // Download the generated image
  const imgRes = await fetch(imageURL);
  if (!imgRes.ok) {
    throw new Error(`Runware: failed to download generated image (HTTP ${imgRes.status})`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  const mimeType = "image/jpeg";
  const { width, height } = imageDimensions(imageBuffer);
  const checksum = sha256(imageBuffer);
  const tier = resolutionTier(width, height);

  // Use the cost returned by Runware if available, otherwise calculate from pricing catalog
  const runwareCost = imageResult?.cost;
  const pricing = calculateCost({
    model,
    imageCount: 1,
    imageResolution: tier,
  });
  if (typeof runwareCost === "number" && runwareCost > 0) {
    // Runware's cost field is already USD (per the s23 spike — ~$0.0058/image
    // at 1024x1536 for runware:108@1).
    const costUsd = runwareCost;
    pricing.totalCost = costUsd;
    pricing.imageCost = costUsd;
  }

  recordCost(pricing, {
    runId,
    stepId,
    capability: "image.generate",
    inputTokens: 0,
    outputTokens: 0,
    notes: `latency=${latencyMs}ms, ${width}x${height}, seed=42, refs=0 (pure text-to-image)`,
  });

  const remoteRequestId = imageResult?.taskUUID ?? `runware-${taskUUID}`;

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

export { generateWithRunware, aspectRatioToDimensions };
