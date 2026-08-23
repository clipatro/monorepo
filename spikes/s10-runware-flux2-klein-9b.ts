/**
 * S10 — fal.ai FLUX.2 [klein] 9B character consistency test.
 *
 * Goal: Test whether FLUX.2 [klein] 9B can maintain NoahVale's character
 * identity when given the 4 reference images + the same strict realistic
 * prompt used in S09 (Gemini). This is a cost-comparison spike:
 *
 *   S09 (Gemini 3.1 Flash Image):  $0.067/img, 4 refs, ~10-20s latency
 *   S10 (FLUX.2 klein 9B fal.ai):  ~$0.05/img, 4 refs, ~2-5s latency
 *
 * fal.ai gives $20 free credits on signup — enough for ~400 test images.
 *
 * FLUX.2 [klein] 9B edit endpoint supports up to 4 reference images via
 * the `image_urls` field (Data URIs or hosted URLs).
 *
 * fal.ai REST API:
 *   POST https://fal.run/fal-ai/flux-2/klein/9b/edit
 *   Authorization: Key <FAL_KEY>
 *   Content-Type: application/json
 *
 * Model: fal-ai/flux-2/klein/9b/edit
 * Pricing: $0.011/input megapixel + $0.006/output megapixel
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const FAL_KEY = process.env.FAL_KEY;
const ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/9b/edit";
const CHAR_DIR = join(process.cwd(), "characters", "NoahVale");

interface RefImage {
  filename: string;
  role: string;
  buf: Buffer;
  checksum: string;
  width: number;
  height: number;
  dataUri: string;
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
  const ext = filename.endsWith(".png") ? "png" : "jpeg";
  const dataUri = `data:image/${ext};base64,${buf.toString("base64")}`;
  return { filename, role, buf, checksum, width: dims.width, height: dims.height, dataUri };
}

export async function run(): Promise<SpikeResult> {
  if (!FAL_KEY) {
    return {
      id: "s10",
      name: "fal.ai FLUX.2 [klein] 9B character consistency",
      goal: "Test FLUX.2 [klein] 9B on fal.ai with NoahVale reference images for character consistency at lower cost than Gemini.",
      result: "fail",
      measurements: { "falKey": false },
      notes: "FAL_KEY not set. Sign up at https://fal.ai, get $20 free credits, create a key at https://fal.ai/dashboard/keys, add FAL_KEY to .env, and re-run.",
      artifactPaths: [],
    };
  }

  const dir = await spikeDir("s10");
  const artifacts: string[] = [];

  // Load all 4 NoahVale reference images.
  const refs: RefImage[] = [];
  const refFiles = [
    { filename: "portrait.jpeg", role: "front_portrait" },
    { filename: "three-quarter.jpeg", role: "three_quarter" },
    { filename: "side-profile.jpeg", role: "side_profile" },
    { filename: "expressions.jpeg", role: "expression_sheet" },
  ];

  for (const r of refFiles) {
    try {
      const ref = await loadRef(r.filename, r.role);
      refs.push(ref);
    } catch (e) {
      return {
        id: "s10",
        name: "fal.ai FLUX.2 [klein] 9B character consistency",
        goal: "Test FLUX.2 [klein] 9B on fal.ai with NoahVale reference images for character consistency at lower cost than Gemini.",
        result: "fail",
        measurements: { "missingRef": r.filename, "error": String(e) },
        notes: `Could not load reference image: ${r.filename}`,
        artifactPaths: [],
      };
    }
  }

  // The same strict realistic character reference instructions from S09.
  const characterInstructions = `Use the provided reference images as the strict character reference for a man named NoahVale.
Preserve his exact established facial identity, apparent age, facial proportions, natural asymmetry, skin tone and texture, hazel-green eyes, chestnut-brown hairstyle, subtle stubble, body proportions, and canonical wardrobe.

Treat NoahVale as a real actor being photographed in a new environment, not as a character being redesigned. Change only the expression, pose, camera position, and environment explicitly requested.

The result must resemble an authentic unstaged photograph captured with a real camera. Preserve natural pores, individual hair strands, realistic eyes, physically correct anatomy, natural fabric texture, environmental reflections, and believable light interaction. Avoid plastic skin, beauty retouching, artificial symmetry, CGI appearance, illustration, excessive bokeh, HDR, cinematic glow, and synthetic-looking facial details.`;

  // The same desk/laptop/night scene from S09 for direct comparison.
  const scenePrompt = `${characterInstructions}

SCENE: NoahVale sits at a cluttered wooden desk in a dimly lit room late at night. He leans forward with one hand on his forehead, staring at an open laptop screen that casts a cool blue glow on his face. The expression is conflicted — he knows he should work but can't start. A half-empty coffee mug sits beside the laptop. The background is softly out of focus, showing bookshelves in warm shadow.

CAMERA: Eye-level, slightly off-center, shot on a 35mm lens at f/2.8. Shallow but natural depth of field. Vertical 9:16 composition.

LIGHTING: Mixed — warm amber from a desk lamp on the right, cool blue from the laptop screen on the left. Natural, unmotivated lighting. No studio beauty lighting.

OUTPUT: Photorealistic vertical 9:16 image. No text, no watermark, no border.`;

  // 9:16 vertical — fal.ai accepts custom width/height via image_size object.
  // Use 1088x1920 (close to 1080x1920, ~2MP).
  const requestBody = {
    prompt: scenePrompt,
    image_urls: refs.map((r) => r.dataUri),
    image_size: { width: 1088, height: 1920 },
    num_inference_steps: 4,
    num_images: 1,
    output_format: "jpeg",
    enable_safety_checker: false,
    sync_mode: false, // return URL, not data URI
  };

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${FAL_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const artifact = await writeArtifact("s10", "fetch-error.json", JSON.stringify({ error: String(err) }, null, 2));
    return {
      id: "s10",
      name: "fal.ai FLUX.2 [klein] 9B character consistency",
      goal: "Test FLUX.2 [klein] 9B on fal.ai with NoahVale reference images for character consistency at lower cost than Gemini.",
      result: "fail",
      measurements: { "fetchError": String(err).slice(0, 200) },
      notes: "Fetch to fal.ai API failed (network error).",
      artifactPaths: [artifact],
    };
  }
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

  // Save the raw response for audit.
  const rawArtifact = await writeArtifact("s10", "raw-response.json", JSON.stringify({
    model: "fal-ai/flux-2/klein/9b/edit",
    latencyMs,
    httpStatus: res.status,
    refCount: refs.length,
    requestBody: { ...requestBody, image_urls: `[${refs.length} data URIs omitted]` },
    response: raw,
  }, null, 2));
  artifacts.push(rawArtifact);

  if (!res.ok) {
    return {
      id: "s10",
      name: "fal.ai FLUX.2 [klein] 9B character consistency",
      goal: "Test FLUX.2 [klein] 9B on fal.ai with NoahVale reference images for character consistency at lower cost than Gemini.",
      result: "fail",
      measurements: {
        "httpStatus": res.status,
        "latencyMs": latencyMs,
        "refCount": refs.length,
        "errorMessage": raw.detail ?? raw.error ?? `HTTP ${res.status}`,
      },
      notes: "fal.ai API rejected the request.",
      artifactPaths: artifacts,
    };
  }

  const imageResult = raw.images?.[0];
  const imageURL = imageResult?.url;
  const seed = raw.seed ?? 0;
  const inferenceTime = raw.timings?.inference ?? 0;

  const measurements: Record<string, string | number | boolean> = {
    "httpStatus": res.status,
    "latencyMs": latencyMs,
    "model": "fal-ai/flux-2/klein/9b/edit",
    "modelName": "FLUX.2 [klein] 9B",
    "refCount": refs.length,
    "hasOutputImage": !!imageURL,
    "seed": seed,
    "inferenceTimeSec": inferenceTime,
    "nsfwFlagged": raw.has_nsfw_concepts?.[0] ?? false,
  };

  // Record reference checksums for audit (match S09 for comparison).
  for (const ref of refs) {
    measurements[`ref.${ref.role}.checksum`] = ref.checksum.slice(0, 16) + "...";
    measurements[`ref.${ref.role}.dims`] = `${ref.width}x${ref.height}`;
  }

  let outputDims: { width: number; height: number } | null = null;
  if (imageURL) {
    // Download the generated image.
    try {
      const imgRes = await fetch(imageURL);
      if (imgRes.ok) {
        const outBuf = Buffer.from(await imgRes.arrayBuffer());
        const outPath = join(dir, "noahvale-scene-desk.jpg");
        await writeBinaryArtifact("s10", "noahvale-scene-desk.jpg", outBuf);
        artifacts.push(outPath);
        outputDims = imageDimensions(outBuf);
        const outChecksum = await fileChecksum(outPath);
        measurements["outputWidth"] = outputDims.width;
        measurements["outputHeight"] = outputDims.height;
        measurements["outputMimeType"] = imageResult?.content_type ?? "image/jpeg";
        measurements["outputSizeBytes"] = outBuf.length;
        measurements["outputChecksum"] = outChecksum.slice(0, 16) + "...";
        measurements["outputImageUrl"] = imageURL.slice(0, 80) + "...";
      } else {
        measurements["downloadError"] = `HTTP ${imgRes.status}`;
      }
    } catch (err) {
      measurements["downloadError"] = String(err).slice(0, 200);
    }
  } else {
    measurements["outputError"] = "No image URL in response";
  }

  // Save the full prompt for audit (matches S09 for comparison).
  const promptArtifact = await writeArtifact("s10", "prompt.txt", scenePrompt);
  artifacts.push(promptArtifact);

  // Cost estimate: $0.011/input MP + $0.006/output MP
  // Input: 4 refs ~1MP each = ~4MP; Output: 1088x1920 = ~2MP
  const inputMP = refs.reduce((sum, r) => sum + (r.width * r.height) / 1_000_000, 0);
  const outputMP = (1088 * 1920) / 1_000_000;
  const estimatedCost = inputMP * 0.011 + outputMP * 0.006;
  const geminiCost = 0.067; // S09 Gemini 3.1 Flash Image 1K
  const savings = ((geminiCost - estimatedCost) / geminiCost * 100).toFixed(1);
  measurements["costEstimate.inputMP"] = inputMP.toFixed(2);
  measurements["costEstimate.outputMP"] = outputMP.toFixed(2);
  measurements["costEstimate.estimatedCostUsd"] = estimatedCost.toFixed(4);
  measurements["costComparison.geminiS09"] = geminiCost;
  measurements["costComparison.flux2Klein9b"] = estimatedCost.toFixed(4);
  measurements["costComparison.savingsPercent"] = savings;

  const pass = !!imageURL && outputDims !== null;
  return {
    id: "s10",
    name: "fal.ai FLUX.2 [klein] 9B character consistency",
    goal: "Test FLUX.2 [klein] 9B on fal.ai with NoahVale reference images for character consistency at lower cost than Gemini.",
    result: pass ? "pass" : "fail",
    measurements,
    notes: pass
      ? `Generated a NoahVale scene (desk/laptop/night) using FLUX.2 [klein] 9B with 4 reference images. Output: ${outputDims!.width}x${outputDims!.height}. Est. cost: $${estimatedCost.toFixed(4)} (vs $0.067 for Gemini = ${savings}% savings). Latency: ${latencyMs}ms (inference: ${inferenceTime}s). VISUAL IDENTITY CONSISTENCY REQUIRES MANUAL REVIEW — compare spikes/output/s10/noahvale-scene-desk.jpg against spikes/output/s09/noahvale-scene-desk.* and the original references in characters/NoahVale/.`
      : "fal.ai did not return an image URL.",
    artifactPaths: artifacts,
  };
}
