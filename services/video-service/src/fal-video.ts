/**
 * FalVideoAdapter — generates video clips using fal.ai text-to-video models.
 *
 * Default model: fal-ai/ltx-video ($0.02/video, cheapest text-to-video on fal).
 * Alternative: fal-ai/ltx-video-13b-distilled ($0.04/video, higher quality).
 *
 * Uses the same budget-check + cost-tracking pattern as FalImageAdapter.
 * In dry-run mode, generates a minimal valid MP4 placeholder instead of
 * calling the API.
 *
 * D017 — Video templates system.
 */

import { checkBudget, calculateCost, getPricing } from "@automation/cost-tracker";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

import { isDryRun, getDryRunMediaPath } from "@automation/contracts";



export interface VideoClipGenResult {
  /** Path to the generated MP4 clip. */
  clipPath: string;
  /** Duration in seconds. */
  durationSec: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** File size in bytes. */
  sizeBytes: number;
  /** Cost in USD. */
  costUsd: number;
  /** Remote request id (for audit). */
  remoteRequestId: string | null;
  /** Model used. */
  model: string;
}

export interface VideoClipGenInput {
  /** Text prompt describing the desired clip. */
  prompt: string;
  /** Output directory for the clip file. */
  outputDir: string;
  /** Output filename (e.g. "clip-01.mp4"). */
  outputFilename: string;
  /** fal.ai API key. */
  apiKey: string;
  /** Model id (e.g. "fal-ai/ltx-video"). */
  model: string;
  /** Aspect ratio string (e.g. "9:16"). */
  aspectRatio?: string;
  /** Duration in seconds (if the model supports it). */
  durationSec?: number;
  /** Run id (for cost tracking). */
  runId?: string;
  /** Step id (for cost tracking). */
  stepId?: string;
  /** Scene index (for logging). */
  sceneIndex?: number;
  /**
   * Optional image URL for image-to-video generation.
   * When provided, the model endpoint is switched to the image-to-video
   * variant (e.g. fal-ai/ltx-video/image-to-video) to animate the image.
   * Used for character scenes to maintain visual consistency.
   */
  imageUrl?: string;
}

/**
 * Generate a video clip using fal.ai text-to-video or image-to-video.
 *
 * When `imageUrl` is provided, uses the image-to-video variant of the model
 * to animate the provided image (used for character scenes).
 * Otherwise, uses text-to-video.
 *
 * Calls the fal.ai endpoint, downloads the resulting video, and saves it
 * to the output directory. Returns metadata about the generated clip.
 */
export async function generateVideoClip(input: VideoClipGenInput): Promise<VideoClipGenResult> {
  const {
    prompt,
    outputDir,
    outputFilename,
    apiKey,
    model,
    aspectRatio = "9:16",
    durationSec,
    runId,
    stepId,
    sceneIndex,
    imageUrl,
  } = input;

  const outputPath = join(outputDir, outputFilename);
  await mkdir(outputDir, { recursive: true });

  // === Dry-run mode: copy placeholder clip or generate one ===
  if (isDryRun()) {
    const placeholderDur = durationSec ?? 5;
    const w = 1080;
    const h = 1920;

    // Try to copy the pre-made placeholder clip from the dry-run media directory.
    // Fall back to generating one with ffmpeg if the file doesn't exist.
    try {
      const placeholderPath = join(getDryRunMediaPath(), "placeholder-clip.mp4");
      await copyFile(placeholderPath, outputPath);
    } catch {
      // Fallback: generate a minimal test video with ffmpeg
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=0x1a1a2a:s=${w}x${h}:d=${placeholderDur}:r=30 ` +
          `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
          `-t ${placeholderDur} -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p ` +
          `-c:a aac -shortest "${outputPath}" 2>&1`,
        { timeout: 30000 },
      );
    }

    const cost = calculateCost({ model, videoCount: 1 });
    cost.totalCost = 0;

    // Dry-run cost is $0 — no need to record in the ledger
    console.log(`[video-service] DRY-RUN: using placeholder clip for scene ${sceneIndex ?? "?"} (${imageUrl ? "image-to-video" : "text-to-video"}, no API call)`);

    return {
      clipPath: outputPath,
      durationSec: placeholderDur,
      width: w,
      height: h,
      sizeBytes: 0,
      costUsd: 0,
      remoteRequestId: `dry-run-${Date.now()}`,
      model,
    };
  }

  // Check budget before the call — use the exact per-video price from the catalog
  const pricingInfo = getPricing(model);
  const estimatedCost = pricingInfo.costPerVideo ?? (pricingInfo.costPerSecond ? (durationSec ?? 5) * pricingInfo.costPerSecond : 0.05);
  checkBudget(estimatedCost, { runId });

  // Build the fal.ai request body.
  // When imageUrl is provided, switch to the image-to-video endpoint variant.
  // LTX 2.3+ models use a different API schema than the old LTX preview:
  //   - duration is an integer enum (6, 8, 10, 12, 14, 16, 18, 20), min 6s
  //   - resolution parameter (1080p, 1440p, 2160p)
  //   - no sync_mode parameter
  // Old LTX models use duration as a string and sync_mode: false.
  const isLtx23 = model.includes("ltx-2.3");
  const isLtxVideo = model.startsWith("fal-ai/ltx-video") || model.includes("ltx-video-");
  const useImageToVideo = !!imageUrl;

  // Determine the endpoint: image-to-video variant or text-to-video
  // fal.ai LTX endpoints follow the pattern:
  //   text-to-video:  fal-ai/ltx-2.3/text-to-video      or fal-ai/ltx-2.3/text-to-video/fast
  //   image-to-video: fal-ai/ltx-2.3/image-to-video     or fal-ai/ltx-2.3/image-to-video/fast
  // So we replace "text-to-video" with "image-to-video" in the model path.
  let endpointModel = model;
  if (useImageToVideo) {
    if (endpointModel.includes("/text-to-video")) {
      endpointModel = endpointModel.replace("/text-to-video", "/image-to-video");
    } else if (!endpointModel.includes("/image-to-video")) {
      // Fallback: append /image-to-video for models that don't follow the pattern
      endpointModel = `${endpointModel}/image-to-video`;
    }
  }

  const requestBody: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
  };

  // For image-to-video, download the image and convert to base64 data URI.
  // fal.ai's servers can't reach Docker-internal URLs (e.g. http://api-gateway:3000),
  // so we fetch the image locally and pass it as a data URI instead.
  // The imageUrl may be an "asset:<id>" reference — we resolve it to a real URL
  // using the video-service's own API_GATEWAY_URL (localhost:3000 on the host).
  if (useImageToVideo && imageUrl) {
    try {
      let fetchUrl = imageUrl;
      if (imageUrl.startsWith("asset:")) {
        const assetId = imageUrl.slice("asset:".length);
        const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
        fetchUrl = `${gatewayUrl}/api/assets/${assetId}/file`;
      }
      console.log(`[video-service] Downloading image for image-to-video: ${fetchUrl}`);
      const imgRes = await fetch(fetchUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to download image (HTTP ${imgRes.status})`);
      }
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const imgMime = imgRes.headers.get("content-type") ?? "image/jpeg";
      const base64 = imgBuffer.toString("base64");
      requestBody.image_url = `data:${imgMime};base64,${base64}`;
      console.log(`[video-service] Image converted to base64 data URI (${(imgBuffer.length / 1024).toFixed(0)}KB, ${imgMime})`);
    } catch (err) {
      throw new Error(`Failed to download image for image-to-video: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (isLtx23) {
    // LTX 2.3: duration must be an integer from the enum (6, 8, 10, 12, 14, 16, 18, 20)
    // Clamp to minimum 6 and round to nearest supported value
    const supportedDurations = [6, 8, 10, 12, 14, 16, 18, 20];
    const rawDur = durationSec ?? 6;
    const clampedDur = Math.max(6, supportedDurations.reduce((closest, val) =>
      Math.abs(val - rawDur) < Math.abs(closest - rawDur) ? val : closest, 6));
    requestBody.duration = clampedDur;
    requestBody.resolution = "1080p";
    // Don't generate audio — we add our own voiceover
    requestBody.generate_audio = false;
  } else if (isLtxVideo) {
    // Old LTX models: duration as string, sync_mode false
    requestBody.sync_mode = false;
    if (durationSec !== undefined) {
      requestBody.duration = String(durationSec);
    }
  } else {
    // Other fal.ai video models (Wan, Kling, etc.)
    requestBody.sync_mode = false;
    if (durationSec !== undefined) {
      requestBody.duration = String(durationSec);
    }
  }

  const endpoint = `https://fal.run/${endpointModel}`;
  console.log(`[video-service] ${useImageToVideo ? "image-to-video" : "text-to-video"} via ${endpointModel} for scene ${sceneIndex ?? "?"}`);
  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = (await res.json()) as {
    video?: { url?: string; file_name?: string; content_type?: string };
    videos?: Array<{ url?: string }>;
    seed?: number;
    detail?: string;
    error?: string;
  };

  if (!res.ok) {
    const detail = raw.detail ?? raw.error ?? `HTTP ${res.status}`;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`fal.ai video generation failed (${endpointModel}): ${msg}`);
  }

  // fal.ai video models return either { video: { url } } or { videos: [{ url }] }
  const videoUrl = raw.video?.url ?? raw.videos?.[0]?.url;
  if (!videoUrl) {
    throw new Error(`fal.ai returned no video in response (${model})`);
  }

  // Download the generated video
  const vidRes = await fetch(videoUrl);
  if (!vidRes.ok) {
    throw new Error(`fal.ai: failed to download generated video (HTTP ${vidRes.status})`);
  }
  const videoBuffer = Buffer.from(await vidRes.arrayBuffer());
  await writeFile(outputPath, videoBuffer);

  // Probe the output for metadata
  let probedDur = durationSec ?? 0;
  let width = 0;
  let height = 0;
  try {
    const { stdout: durOut } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
    );
    probedDur = parseFloat(durOut.trim()) || probedDur;
    const { stdout: wOut } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${outputPath}"`,
    );
    width = parseInt(wOut.trim(), 10);
    const { stdout: hOut } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "${outputPath}"`,
    );
    height = parseInt(hOut.trim(), 10);
  } catch {
    /* non-critical */
  }

  // Calculate cost — per-video or per-second pricing from the catalog
  const pricing = calculateCost({
    model,
    videoCount: 1,
    videoSeconds: probedDur,
  });

  const costOptions = {
    runId,
    stepId,
    capability: "video.clip_generate" as const,
    inputTokens: 0,
    outputTokens: 0,
    notes: `latency=${latencyMs}ms, ${width}x${height}, ${probedDur}s, scene=${sceneIndex ?? "?"}`,
  };

  // Report cost to the api-gateway so it lands in the shared PostgreSQL ledger.
  // The video-service runs on the host and shares the same database as Docker,
  // so we only record once via the api-gateway (not locally) to avoid duplicates.
  const apiGatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
  try {
    await fetch(`${apiGatewayUrl}/api/cost/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        breakdown: {
          model: pricing.model,
          provider: pricing.provider,
          inputCost: pricing.inputCost,
          outputCost: pricing.outputCost,
          imageCost: pricing.imageCost,
          groundingCost: pricing.groundingCost,
          totalCost: pricing.totalCost,
          isFree: pricing.isFree,
        },
        options: costOptions,
      }),
    });
  } catch (err) {
    // Non-critical — the cost won't be in the ledger but the clip was generated
    console.warn(`[video-service] Failed to report cost to api-gateway: ${err instanceof Error ? err.message : String(err)}`);
  }

  const remoteRequestId = raw.seed ? `fal-seed-${raw.seed}` : null;

  return {
    clipPath: outputPath,
    durationSec: probedDur,
    width,
    height,
    sizeBytes: videoBuffer.length,
    costUsd: pricing.totalCost,
    remoteRequestId,
    model,
  };
}
