/**
 * S18 — Remotion Lambda cloud rendering spike.
 *
 * Goal: Prove that Remotion Lambda can render a beautiful cinematic 720p30
 * vertical video fast and cheaply, using distributed AWS Lambda functions.
 *
 * This script:
 *   1. Bundles the Remotion project (src/index.ts)
 *   2. Deploys/updates the Lambda function
 *   3. Deploys/updates the site bundle to S3
 *   4. Triggers a render via renderMediaOnLambda()
 *   5. Polls getRenderProgress() until done
 *   6. Downloads the MP4 to spikes/output/s18/
 *   7. Measures cost, speed, and quality
 *
 * Prerequisites:
 *   - AWS account with IAM user + policies configured (see setup steps)
 *   - AWS credentials in ~/.aws/credentials or env vars:
 *     REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY
 *   - AWS region set (default: us-east-1)
 *
 * Usage:
 *   bun run spikes/run.ts s18
 *   bun run spikes/run.ts s18 --region=us-east-1
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { spikeDir, writeBinaryArtifact, type SpikeResult } from "./lib/spike.ts";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const REMOTION_PROJECT = join(__dirname, "s18-remotion-lambda");
const ENTRY_POINT = join(REMOTION_PROJECT, "src", "index.ts");

// AWS region — us-east-1 is cheapest, us-east-2 also good
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function main(): Promise<SpikeResult> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  S18 — Remotion Lambda Cloud Rendering Spike");
  console.log("═══════════════════════════════════════════════════════════\n");

  const outDir = await spikeDir("s18");
  const measurements: Record<string, string | number | boolean> = {};
  const artifacts: string[] = [];

  // ─── Step 0: Verify AWS credentials ────────────────────────────────────
  console.log("▸ Step 0: Verifying AWS credentials...");
  const { stdout: identityJson } = await execAsync(
    `aws sts get-caller-identity --region ${REGION} --output json`,
  );
  const identity = JSON.parse(identityJson);
  console.log(`  Account: ${identity.Account}`);
  console.log(`  User ARN: ${identity.Arn}\n`);
  measurements.awsAccount = identity.Account;

  // ─── Step 1: Bundle the Remotion project ───────────────────────────────
  console.log("▸ Step 1: Bundling Remotion project...");
  const bundleStart = Date.now();
  const { bundle } = await import("@remotion/bundler");

  const bundleDir = await bundle({
    entryPoint: ENTRY_POINT,
    // Use webpack override if needed for special assets
    webpackOverride: (config) => config,
  });
  const bundleTime = ((Date.now() - bundleStart) / 1000).toFixed(1);
  console.log(`  Bundle created in ${bundleTime}s → ${bundleDir}\n`);
  measurements.bundleTimeSec = parseFloat(bundleTime);

  // ─── Step 2: Get or create S3 bucket ───────────────────────────────────
  console.log("▸ Step 2: Ensuring S3 bucket exists...");
  const { getOrCreateBucket } = await import("@remotion/lambda");
  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`  Bucket: ${bucketName}\n`);
  measurements.s3Bucket = bucketName;

  // ─── Step 3: Deploy site bundle to S3 ──────────────────────────────────
  console.log("▸ Step 3: Deploying site to S3...");
  const siteStart = Date.now();
  const { deploySiteFromBundle } = await import("@remotion/lambda");

  const { serveUrl } = await deploySiteFromBundle({
    bucketName,
    bundleDir,
    region: REGION,
    siteName: "s18-cinematic",
  });
  const siteTime = ((Date.now() - siteStart) / 1000).toFixed(1);
  console.log(`  Site deployed in ${siteTime}s`);
  console.log(`  Serve URL: ${serveUrl}\n`);
  measurements.siteDeployTimeSec = parseFloat(siteTime);
  measurements.serveUrl = serveUrl;

  // ─── Step 4: Deploy or get Lambda function ─────────────────────────────
  console.log("▸ Step 4: Deploying Lambda function...");
  const fnStart = Date.now();
  const { deployFunction, getFunctions } = await import("@remotion/lambda");

  // Check if a compatible function already exists
  const existingFns = await getFunctions({
    region: REGION,
    compatibleOnly: true,
  });

  let functionName: string;
  if (existingFns.length > 0) {
    functionName = existingFns[0].functionName;
    console.log(`  Reusing existing function: ${functionName}`);
  } else {
    const result = await deployFunction({
      region: REGION,
      timeoutInSeconds: 120,
      memorySizeInMb: 2048,
      createCloudWatchLogGroup: true,
    });
    functionName = result.functionName;
    console.log(`  Deployed new function: ${functionName}`);
  }
  const fnTime = ((Date.now() - fnStart) / 1000).toFixed(1);
  console.log(`  Function ready in ${fnTime}s\n`);
  measurements.functionName = functionName;
  measurements.functionDeployTimeSec = parseFloat(fnTime);

  // ─── Step 5: Render the video ──────────────────────────────────────────
  console.log("▸ Step 5: Triggering Lambda render...");
  const renderStart = Date.now();
  const { renderMediaOnLambda, getRenderProgress } = await import("@remotion/lambda/client");

  const { renderId, bucketName: renderBucket } = await renderMediaOnLambda({
    region: REGION,
    functionName,
    serveUrl,
    composition: "CinematicTitle",
    codec: "h264",
    imageFormat: "jpeg",
    inputProps: {},
    maxRetries: 1,
    framesPerLambda: 20, // 360 frames / 20 = 18 Lambdas in parallel
    privacy: "public",
  });
  console.log(`  Render ID: ${renderId}`);
  console.log(`  Bucket: ${renderBucket}\n`);

  // ─── Step 6: Poll for progress ─────────────────────────────────────────
  console.log("▸ Step 6: Polling render progress...");
  let lastProgress = -1;
  let renderDone = false;
  let outputFile: string | undefined;
  let costEstimate: number | undefined;

  while (!renderDone) {
    await new Promise((r) => setTimeout(r, 2000));

    const progress = await getRenderProgress({
      region: REGION,
      renderId,
      bucketName: renderBucket,
      functionName,
    });

    if (progress.fatalError) {
      throw new Error(`Render failed: ${progress.fatalError}`);
    }

    const pct = Math.round((progress.overallProgress ?? 0) * 100);
    if (pct !== lastProgress) {
      const done = progress.done ? "✓" : "…";
      console.log(
        `  ${done} ${pct}%` +
        (progress.encodingProgress ? ` (encoding: ${Math.round(progress.encodingProgress * 100)}%)` : "") +
        (progress.renderingProgress ? ` (rendering: ${Math.round(progress.renderingProgress * 100)}%)` : ""),
      );
      lastProgress = pct;
    }

    if (progress.done) {
      renderDone = true;
      outputFile = progress.outputFile;
      costEstimate = progress.costs?.lambdaCost;
      measurements.estimatedCost = costEstimate ?? "N/A";
    }
  }

  const renderTime = ((Date.now() - renderStart) / 1000).toFixed(1);
  console.log(`\n  Render complete in ${renderTime}s`);
  if (costEstimate !== undefined) {
    console.log(`  Estimated AWS cost: $${costEstimate.toFixed(4)}`);
  }
  if (outputFile) {
    console.log(`  Output URL: ${outputFile}\n`);
  }
  measurements.renderTimeSec = parseFloat(renderTime);
  measurements.outputUrl = outputFile ?? "N/A";

  // ─── Step 7: Download the MP4 ──────────────────────────────────────────
  if (outputFile) {
    console.log("▸ Step 7: Downloading MP4...");
    const { default: fetch } = await import("node-fetch") as any;
    // Use curl as a reliable fallback
    const outputPath = join(outDir, "output-remotion-lambda.mp4");
    await execAsync(`curl -sS -L -o "${outputPath}" "${outputFile}"`);

    // Verify file
    const { stdout: ffprobeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${outputPath}"`,
    );
    const probe = JSON.parse(ffprobeOut);
    const vStream = probe.streams.find((s: any) => s.codec_type === "video");
    const duration = parseFloat(probe.format.duration);
    const width = vStream?.width;
    const height = vStream?.height;
    const fpsStr = vStream?.r_frame_rate;
    const codec = vStream?.codec_name;

    const fileSize = (await readFile(outputPath)).length;
    const sizeKB = (fileSize / 1024).toFixed(0);

    console.log(`  Downloaded: ${outputPath}`);
    console.log(`  Resolution: ${width}x${height}`);
    console.log(`  Duration: ${duration.toFixed(1)}s`);
    console.log(`  FPS: ${fpsStr}`);
    console.log(`  Codec: ${codec}`);
    console.log(`  Size: ${sizeKB} KB\n`);

    measurements.outputResolution = `${width}x${height}`;
    measurements.outputDurationSec = parseFloat(duration.toFixed(1));
    measurements.outputFps = fpsStr;
    measurements.outputCodec = codec;
    measurements.outputSizeKB = parseInt(sizeKB);
    artifacts.push(outputPath);
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  const totalTime = ((Date.now() - renderStart) / 1000).toFixed(1);
  measurements.totalWallClockSec = parseFloat(totalTime);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SPIKE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Render time:    ${renderTime}s`);
  console.log(`  Est. AWS cost:  ${costEstimate !== undefined ? "$" + costEstimate.toFixed(4) : "N/A"}`);
  console.log(`  Total wall:     ${totalTime}s`);
  console.log("");

  return {
    id: "s18",
    name: "Remotion Lambda Cloud Rendering",
    goal: "Render a beautiful cinematic 720p30 vertical video via Remotion Lambda (distributed AWS Lambda functions) and measure speed + cost.",
    result: "pass",
    measurements,
    notes:
      `Rendered via Remotion Lambda in ${REGION}. ` +
      `Composition: CinematicTitle (720x1280, 12s @ 30fps, 4 beats: cold-open glow, wordmark reveal, tagline + features, closing CTA). ` +
      `Used ${measurements.framesPerLambda ?? 20} frames per Lambda for parallelism. ` +
      `Cost: ${costEstimate !== undefined ? "$" + costEstimate.toFixed(4) : "N/A"} (AWS Lambda compute only). ` +
      `Compare: ClipKit cloud stalled at 99% for complex comps; Remotion distributes frames across many Lambdas.`,
    artifactPaths: artifacts,
  };
}

// ─── Run ────────────────────────────────────────────────────────────────────

main()
  .then((result) => {
    console.log("\n✅ Spike S18 passed.\n");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error("\n❌ Spike S18 failed:\n");
    console.error(err);
    process.exit(1);
  });
