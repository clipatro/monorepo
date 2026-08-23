import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkBudget, calculateCost, recordCost, resolutionTier } from "@automation/cost-tracker";
import { isDryRun, getDryRunMediaPath } from "@automation/contracts";
import { API_BASE } from "../constants";
import { imageDimensions, sha256 } from "../utils";
import type { ImageGenResult } from "../types";

// === Dummy image generation (dry-run mode) ===

/**
 * Generate a minimal valid PNG buffer of the given dimensions.
 * Creates a solid gray image so the pipeline can save it, compute
 * dimensions, and validate it without calling the real Gemini API.
 */
function generateDummyPng(width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk("IHDR", ihdrData);

  // IDAT chunk — simple gray image
  // Each row: filter byte (0) + RGB pixels (gray = 128, 128, 128)
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      // Slight gradient so it's not entirely flat (easier to distinguish from corrupt files)
      const shade = 100 + Math.floor((x / width) * 55);
      rawData[px] = shade;     // R
      rawData[px + 1] = shade; // G
      rawData[px + 2] = shade; // B
    }
  }
  const compressed = zlibDeflateSync(rawData);
  const idat = makeChunk("IDAT", compressed);

  // IEND chunk
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

// Minimal zlib deflate (use Node.js zlib)
function zlibDeflateSync(data: Buffer): Buffer {
  return deflateSync(data);
}

// CRC32 for PNG chunks
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

// === Image Generation Adapters ===

/**
 * GeminiFlashImageAdapter — generates an image using Gemini Flash Image (standard)
 * with multi-reference input for character consistency.
 *
 * In dry-run mode, returns a dummy gray PNG image instead of calling the API.
 */
async function generateWithGeminiFlashImage(
  apiKey: string,
  model: string,
  prompt: string,
  references: Array<{ buffer: Buffer; mimeType: string }>,
  temperature: number,
  runId?: string,
  stepId?: string,
  aspectRatio: string = "9:16",
): Promise<ImageGenResult> {
  // === Dry-run mode: return a placeholder image ===
  if (isDryRun()) {
    // Try to load the placeholder image from the dry-run media directory.
    // Fall back to generating a dummy PNG if the file doesn't exist.
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
      // Fallback: generate a dummy PNG
      const [aw, ah] = aspectRatio.split(":").map(Number);
      const baseHeight = 1366;
      width = aw && ah ? Math.round((baseHeight * aw) / ah) : 768;
      height = baseHeight;
      imageBuffer = generateDummyPng(width, height);
    }
    const mimeType = "image/png";
    const checksum = sha256(imageBuffer);
    const tier = resolutionTier(width, height);

    const cost = calculateCost({
      model,
      inputTokens: 0,
      outputTokens: 0,
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
      notes: `DRY-RUN placeholder image ${width}x${height}`,
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
  const estimatedCost = 0.15; // conservative estimate for one image
  checkBudget(estimatedCost, { runId });

  // Build request parts: reference images first, then text prompt
  const parts: Array<Record<string, unknown>> = [];
  for (const ref of references) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.buffer.toString("base64"),
      },
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature },
  };

  const t0 = performance.now();
  const res = await fetch(
    `${API_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    const msg = raw.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini image generation failed: ${msg}`);
  }

  const imagePart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image in response");
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  const { width, height } = imageDimensions(imageBuffer);
  const checksum = sha256(imageBuffer);

  // Calculate cost
  const tier = resolutionTier(width, height);
  const usage = raw.usageMetadata ?? {};
  const cost = calculateCost({
    model,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    imageCount: 1,
    imageResolution: tier,
  });

  recordCost(cost, {
    runId,
    stepId,
    capability: "image.generate",
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    notes: `latency=${latencyMs}ms, ${width}x${height}, tier=${tier}`,
  });

  const remoteRequestId = res.headers.get("x-goog-request-id") ?? null;

  return {
    imageBuffer,
    mimeType,
    width,
    height,
    checksum,
    costUsd: cost.totalCost,
    remoteRequestId,
  };
}

export { generateWithGeminiFlashImage };
