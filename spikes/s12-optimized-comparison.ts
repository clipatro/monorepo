/**
 * S12 — Optimized input comparison: FLUX.2 klein 4B vs 9B vs Gemini Lite.
 *
 * Goal: Test all three models with ffmpeg-optimized 512x512 reference images
 * and 720x720 1:1 output to compare quality and cost at production scale.
 *
 * Models tested:
 *   1. FLUX.2 [klein] 4B (fal.ai) — $0.01/MP flat
 *   2. FLUX.2 [klein] 9B (fal.ai) — $0.011/MP input + $0.006/MP output
 *   3. Gemini 3.1 Flash Lite Image (direct API) — $0.034/image flat
 *
 * Optimized inputs: 4 × 512x512 = 1.05 MP total (vs 4.2 MP original)
 * Output: 720x720 = 0.518 MP
 *
 * Cost estimates per image:
 *   FLUX.2 4B:  (1.05 + 0.518) × $0.01 = $0.0157 (77% savings vs Gemini $0.067)
 *   FLUX.2 9B:  1.05 × $0.011 + 0.518 × $0.006 = $0.0147 (78% savings)
 *   Gemini Lite: $0.034 flat (49% savings vs Gemini Standard $0.067)
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const FAL_KEY = process.env.FAL_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_LITE_MODEL = "gemini-3.1-flash-lite-image";
const FLUX_4B_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b/edit";
const FLUX_9B_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/9b/edit";
const CHAR_DIR = join(process.cwd(), "characters", "NoahVale", "optimized-512");
const OUTPUT_SIZE = 720;

interface RefImage {
  filename: string;
  role: string;
  buf: Buffer;
  checksum: string;
  width: number;
  height: number;
  dataUri: string;
  base64: string;
}

function imageDimensions(buf: Buffer): { width: number; height: number } {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  }
  return { width: 0, height: 0 };
}

async function loadRef(filename: string, role: string): Promise<RefImage> {
  const path = join(CHAR_DIR, filename);
  const buf = await readFile(path);
  const dims = imageDimensions(buf);
  const checksum = createHash("sha256").update(buf).digest("hex");
  const base64 = buf.toString("base64");
  const dataUri = `data:image/jpeg;base64,${base64}`;
  return { filename, role, buf, checksum, width: dims.width, height: dims.height, dataUri, base64 };
}

interface ModelResult {
  modelId: string;
  modelName: string;
  provider: string;
  success: boolean;
  costUsd: number;
  latencyMs: number;
  inferenceTimeSec: number;
  outputWidth: number;
  outputHeight: number;
  outputSizeBytes: number;
  outputChecksum: string;
  outputPath: string;
  error?: string;
}

async function runFluxModel(
  endpoint: string,
  modelId: string,
  modelName: string,
  prompt: string,
  refs: RefImage[],
  dir: string,
  outputFilename: string,
): Promise<ModelResult> {
  const requestBody = {
    prompt,
    image_urls: refs.map((r) => r.dataUri),
    image_size: { width: OUTPUT_SIZE, height: OUTPUT_SIZE },
    num_inference_steps: 4,
    num_images: 1,
    output_format: "jpeg",
    enable_safety_checker: false,
    sync_mode: false,
  };

  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${FAL_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    images?: Array<{ url?: string; content_type?: string }>;
    seed?: number;
    timings?: { inference?: number };
    detail?: string;
  };

  if (!res.ok) {
    return {
      modelId, modelName, provider: "fal.ai",
      success: false, costUsd: 0, latencyMs, inferenceTimeSec: 0,
      outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "",
      outputPath: "", error: raw.detail ?? `HTTP ${res.status}`,
    };
  }

  const imageURL = raw.images?.[0]?.url;
  const inferenceTimeSec = raw.timings?.inference ?? 0;

  if (!imageURL) {
    return {
      modelId, modelName, provider: "fal.ai",
      success: false, costUsd: 0, latencyMs, inferenceTimeSec,
      outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "",
      outputPath: "", error: "No image URL in response",
    };
  }

  const imgRes = await fetch(imageURL);
  const outBuf = Buffer.from(await imgRes.arrayBuffer());
  const outPath = join(dir, outputFilename);
  await writeBinaryArtifact("s12", outputFilename, outBuf);
  const dims = imageDimensions(outBuf);
  const checksum = await fileChecksum(outPath);

  // Cost calculation
  const inputMP = refs.reduce((sum, r) => sum + (r.width * r.height) / 1_000_000, 0);
  const outputMP = (dims.width * dims.height) / 1_000_000;
  let costUsd: number;
  if (modelId.includes("4b")) {
    costUsd = (inputMP + outputMP) * 0.01;
  } else {
    costUsd = inputMP * 0.011 + outputMP * 0.006;
  }

  return {
    modelId, modelName, provider: "fal.ai",
    success: true, costUsd, latencyMs, inferenceTimeSec,
    outputWidth: dims.width, outputHeight: dims.height,
    outputSizeBytes: outBuf.length, outputChecksum: checksum.slice(0, 16) + "...",
    outputPath: outPath,
  };
}

async function runGeminiLite(
  prompt: string,
  refs: RefImage[],
  dir: string,
  outputFilename: string,
): Promise<ModelResult> {
  // Build Gemini request with reference images + text prompt
  const parts: Array<Record<string, unknown>> = [];
  for (const ref of refs) {
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: ref.base64 },
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.85 },
  };

  const t0 = performance.now();
  const res = await fetch(
    `${GEMINI_API}/models/${GEMINI_LITE_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    return {
      modelId: GEMINI_LITE_MODEL, modelName: "Gemini 3.1 Flash Lite Image", provider: "gemini-direct",
      success: false, costUsd: 0, latencyMs, inferenceTimeSec: 0,
      outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "",
      outputPath: "", error: raw.error?.message ?? `HTTP ${res.status}`,
    };
  }

  const imagePart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    return {
      modelId: GEMINI_LITE_MODEL, modelName: "Gemini 3.1 Flash Lite Image", provider: "gemini-direct",
      success: false, costUsd: 0, latencyMs, inferenceTimeSec: 0,
      outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "",
      outputPath: "", error: "No image in response",
    };
  }

  const outBuf = Buffer.from(imagePart.inlineData.data, "base64");
  const outPath = join(dir, outputFilename);
  await writeBinaryArtifact("s12", outputFilename, outBuf);
  const dims = imageDimensions(outBuf);
  const checksum = await fileChecksum(outPath);

  // Gemini Lite: $0.034/image at 1K (flat per image, not per MP)
  const costUsd = 0.034;

  return {
    modelId: GEMINI_LITE_MODEL, modelName: "Gemini 3.1 Flash Lite Image", provider: "gemini-direct",
    success: true, costUsd, latencyMs, inferenceTimeSec: latencyMs / 1000,
    outputWidth: dims.width, outputHeight: dims.height,
    outputSizeBytes: outBuf.length, outputChecksum: checksum.slice(0, 16) + "...",
    outputPath: outPath,
  };
}

export async function run(): Promise<SpikeResult> {
  const dir = await spikeDir("s12");
  const artifacts: string[] = [];
  const measurements: Record<string, string | number | boolean> = {};
  const errors: string[] = [];

  // Check keys
  if (!FAL_KEY) errors.push("FAL_KEY not set");
  if (!GEMINI_KEY) errors.push("GEMINI_API_KEY not set");
  if (errors.length > 0) {
    return {
      id: "s12",
      name: "Optimized input comparison (4B vs 9B vs Gemini Lite)",
      goal: "Compare FLUX.2 klein 4B, 9B, and Gemini Lite with 512x512 optimized inputs and 720x720 output.",
      result: "fail",
      measurements: { errors: errors.join("; ") },
      notes: "Missing API keys.",
      artifactPaths: [],
    };
  }

  // Load optimized 512x512 reference images
  const refs: RefImage[] = [];
  const refFiles = [
    { filename: "portrait.jpg", role: "front_portrait" },
    { filename: "three-quarter.jpg", role: "three_quarter" },
    { filename: "side-profile.jpg", role: "side_profile" },
    { filename: "expressions.jpg", role: "expression_sheet" },
  ];

  for (const r of refFiles) {
    try {
      refs.push(await loadRef(r.filename, r.role));
    } catch (e) {
      return {
        id: "s12",
        name: "Optimized input comparison (4B vs 9B vs Gemini Lite)",
        goal: "Compare FLUX.2 klein 4B, 9B, and Gemini Lite with 512x512 optimized inputs and 720x720 output.",
        result: "fail",
        measurements: { missingRef: r.filename, error: String(e) },
        notes: `Could not load optimized reference: ${r.filename}. Run ffmpeg first.`,
        artifactPaths: [],
      };
    }
  }

  // Record input info
  const inputMP = refs.reduce((sum, r) => sum + (r.width * r.height) / 1_000_000, 0);
  measurements["input.count"] = refs.length;
  measurements["input.totalMP"] = inputMP.toFixed(3);
  measurements["input.resolution"] = "512x512";
  measurements["output.targetSize"] = `${OUTPUT_SIZE}x${OUTPUT_SIZE}`;
  for (const ref of refs) {
    measurements[`ref.${ref.role}.size`] = `${ref.width}x${ref.height}`;
    measurements[`ref.${ref.role}.bytes`] = ref.buf.length;
  }

  // Same prompt as S09/S10/S11 but adjusted for 1:1 output
  const characterInstructions = `Use the provided reference images as the strict character reference for a man named NoahVale.
Preserve his exact established facial identity, apparent age, facial proportions, natural asymmetry, skin tone and texture, hazel-green eyes, chestnut-brown hairstyle, subtle stubble, body proportions, and canonical wardrobe.

Treat NoahVale as a real actor being photographed in a new environment, not as a character being redesigned. Change only the expression, pose, camera position, and environment explicitly requested.

The result must resemble an authentic unstaged photograph captured with a real camera. Preserve natural pores, individual hair strands, realistic eyes, physically correct anatomy, natural fabric texture, environmental reflections, and believable light interaction. Avoid plastic skin, beauty retouching, artificial symmetry, CGI appearance, illustration, excessive bokeh, HDR, cinematic glow, and synthetic-looking facial details.`;

  const scenePrompt = `${characterInstructions}

SCENE: NoahVale sits at a cluttered wooden desk in a dimly lit room late at night. He leans forward with one hand on his forehead, staring at an open laptop screen that casts a cool blue glow on his face. The expression is conflicted — he knows he should work but can't start. A half-empty coffee mug sits beside the laptop. The background is softly out of focus, showing bookshelves in warm shadow.

CAMERA: Eye-level, slightly off-center, shot on a 35mm lens at f/2.8. Shallow but natural depth of field. Square 1:1 composition.

LIGHTING: Mixed — warm amber from a desk lamp on the right, cool blue from the laptop screen on the left. Natural, unmotivated lighting. No studio beauty lighting.

OUTPUT: Photorealistic square 1:1 image. No text, no watermark, no border.`;

  // Save prompt
  const promptArtifact = await writeArtifact("s12", "prompt.txt", scenePrompt);
  artifacts.push(promptArtifact);

  // Run all three models
  const results: ModelResult[] = [];

  // 1. FLUX.2 klein 4B
  console.log("  [s12] Running FLUX.2 klein 4B...");
  try {
    const r4b = await runFluxModel(FLUX_4B_ENDPOINT, "fal-ai/flux-2/klein/4b/edit", "FLUX.2 [klein] 4B", scenePrompt, refs, dir, "flux2-4b.jpg");
    results.push(r4b);
    if (r4b.success) artifacts.push(r4b.outputPath);
  } catch (err) {
    results.push({ modelId: "fal-ai/flux-2/klein/4b/edit", modelName: "FLUX.2 [klein] 4B", provider: "fal.ai", success: false, costUsd: 0, latencyMs: 0, inferenceTimeSec: 0, outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "", outputPath: "", error: String(err) });
  }

  // 2. FLUX.2 klein 9B
  console.log("  [s12] Running FLUX.2 klein 9B...");
  try {
    const r9b = await runFluxModel(FLUX_9B_ENDPOINT, "fal-ai/flux-2/klein/9b/edit", "FLUX.2 [klein] 9B", scenePrompt, refs, dir, "flux2-9b.jpg");
    results.push(r9b);
    if (r9b.success) artifacts.push(r9b.outputPath);
  } catch (err) {
    results.push({ modelId: "fal-ai/flux-2/klein/9b/edit", modelName: "FLUX.2 [klein] 9B", provider: "fal.ai", success: false, costUsd: 0, latencyMs: 0, inferenceTimeSec: 0, outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "", outputPath: "", error: String(err) });
  }

  // 3. Gemini 3.1 Flash Lite Image (direct API)
  console.log("  [s12] Running Gemini 3.1 Flash Lite Image...");
  try {
    const rGemini = await runGeminiLite(scenePrompt, refs, dir, "gemini-lite.jpg");
    results.push(rGemini);
    if (rGemini.success) artifacts.push(rGemini.outputPath);
  } catch (err) {
    results.push({ modelId: GEMINI_LITE_MODEL, modelName: "Gemini 3.1 Flash Lite Image", provider: "gemini-direct", success: false, costUsd: 0, latencyMs: 0, inferenceTimeSec: 0, outputWidth: 0, outputHeight: 0, outputSizeBytes: 0, outputChecksum: "", outputPath: "", error: String(err) });
  }

  // Record results
  const geminiStandardCost = 0.067; // S09 baseline
  for (const r of results) {
    const prefix = r.modelName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    measurements[`${prefix}.success`] = r.success;
    measurements[`${prefix}.costUsd`] = r.costUsd.toFixed(4);
    measurements[`${prefix}.latencyMs`] = r.latencyMs;
    measurements[`${prefix}.inferenceSec`] = r.inferenceTimeSec.toFixed(2);
    measurements[`${prefix}.outputDims`] = r.success ? `${r.outputWidth}x${r.outputHeight}` : "N/A";
    measurements[`${prefix}.outputBytes`] = r.outputSizeBytes;
    measurements[`${prefix}.savingsVsGeminiStd`] = r.success ? `${((geminiStandardCost - r.costUsd) / geminiStandardCost * 100).toFixed(1)}%` : "N/A";
    if (r.error) measurements[`${prefix}.error`] = r.error.slice(0, 150);
  }

  // Save raw results
  const rawArtifact = await writeArtifact("s12", "results.json", JSON.stringify({
    inputOptimized: true,
    inputResolution: "512x512",
    inputCount: refs.length,
    inputTotalMP: inputMP,
    outputTarget: `${OUTPUT_SIZE}x${OUTPUT_SIZE}`,
    geminiStandardBaseline: geminiStandardCost,
    results: results.map((r) => ({
      ...r,
      outputChecksum: r.outputChecksum,
    })),
  }, null, 2));
  artifacts.push(rawArtifact);

  const successCount = results.filter((r) => r.success).length;
  const pass = successCount === results.length;

  const summary = results.map((r) =>
    `${r.modelName}: ${r.success ? "PASS" : "FAIL"} $${r.costUsd.toFixed(4)} ${r.success ? `${r.outputWidth}x${r.outputHeight}` : ""} ${r.latencyMs}ms`
  ).join(" | ");

  return {
    id: "s12",
    name: "Optimized input comparison (4B vs 9B vs Gemini Lite)",
    goal: "Compare FLUX.2 klein 4B, 9B, and Gemini Lite with 512x512 optimized inputs and 720x720 output.",
    result: pass ? "pass" : successCount > 0 ? "partial" : "fail",
    measurements,
    notes: `${summary}. Inputs: 4×512x512 (${inputMP.toFixed(2)}MP). Output: ${OUTPUT_SIZE}x${OUTPUT_SIZE}. Compare: spikes/output/s12/flux2-4b.jpg, flux2-9b.jpg, gemini-lite.jpg against characters/NoahVale/ references.`,
    artifactPaths: artifacts,
  };
}
