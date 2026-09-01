/**
 * Milo and the Little Star — Cost-tracked image re-generation.
 *
 * Re-runs the exact same 10 image generation calls using the same prompts,
 * but this time properly tracks every cost through @automation/cost-tracker.
 * Captures actual token usage and image resolution from the Gemini API.
 *
 * Output: images-cost-report.json with per-image and total costs.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { calculateCost, recordCost, checkBudget, resolutionTier } from "@automation/cost-tracker";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, "images-cost-tracked");
const STORY_PLAN_PATH = join(__dirname, "story-plan.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const ART_STYLE_PREFIX = `STORYBOOK ILLUSTRATION STYLE — soft, warm, hand-painted children's book illustration with gentle lighting, rounded shapes, and a dreamy comforting atmosphere. Warm autumn color palette with golden tones. Consistent character designs across all images:

CHARACTER DESIGNS (use EXACTLY these descriptions in every image):
- MILO: A young boy aged 6-7 with curly brown hair, big expressive eyes, wearing a blue jacket and yellow boots. Kind and curious face.
- STAR: A small, round star character with a friendly face (two dot eyes and a smile). Glowing with warm golden-yellow light.
- RABBIT: A friendly, fluffy rabbit with soft brown fur, long ears, gentle expression. Small and cute.
- OWL: A wise, friendly owl with large round eyes, soft brown and white feathers, gentle knowing smile.
- DEER: A gentle, friendly deer with soft brown fur, large kind eyes, small antlers. Elegant and calm.

ART STYLE: Soft storybook illustration, warm golden lighting, rounded shapes, no harsh lines, gentle and inviting. Vertical composition (portrait orientation 9:16).

`;

interface ImageResult {
  sceneId: string;
  success: boolean;
  width: number;
  height: number;
  resolutionTier: string;
  promptTokens: number;
  outputTokens: number;
  imageOutputTokens: number;
  cost: {
    inputCost: number;
    outputCost: number;
    imageCost: number;
    totalCost: number;
  };
  error?: string;
}

async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  // JPEG: SOF0 marker (0xFFC0) contains dimensions
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i < buffer.length) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      const len = buffer.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  return { width: 0, height: 0 };
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  await mkdir(IMAGES_DIR, { recursive: true });

  const storyPlan = JSON.parse(readFileSync(STORY_PLAN_PATH, "utf-8")) as {
    scenes: Array<{ sceneId: string; imagePrompt: string }>;
  };

  console.log(`=== Milo — Cost-Tracked Image Re-Generation ===\n`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log(`Scenes: ${storyPlan.scenes.length}\n`);

  const results: ImageResult[] = [];
  let totalCost = 0;

  for (const scene of storyPlan.scenes) {
    const imagePath = join(IMAGES_DIR, `${scene.sceneId}.jpg`);
    console.log(`[${scene.sceneId}] Generating with cost tracking...`);

    const fullPrompt = ART_STYLE_PREFIX + scene.imagePrompt;
    const body = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.7 },
    };

    try {
      // Check budget before each call
      checkBudget(0.20, {});

      const t0 = performance.now();
      const res = await fetch(
        `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const latencyMs = Math.round(performance.now() - t0);

      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } };
        throw new Error(`Gemini API failed: ${err.error?.message ?? `HTTP ${res.status}`}`);
      }

      const raw = await res.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          promptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
          candidatesTokensDetails?: Array<{ modality: string; tokenCount: number }>;
        };
      };

      const imagePart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new Error("Gemini returned no image in response");
      }

      const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
      await writeFile(imagePath, imageBuffer);

      const { width, height } = await getImageDimensions(imageBuffer);
      const tier = resolutionTier(width, height);
      const usage = raw.usageMetadata ?? {};

      // Extract token counts — Gemini image API returns promptTokenCount and candidatesTokenCount
      const promptTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;

      // Calculate cost using the project's cost tracker
      const cost = calculateCost({
        model: GEMINI_MODEL,
        inputTokens: promptTokens,
        outputTokens: outputTokens,
        imageCount: 1,
        imageResolution: tier,
      });

      // Record the cost in the ledger
      recordCost(cost, {
        capability: "image.generate",
        inputTokens: promptTokens,
        outputTokens: outputTokens,
        notes: `milo-star-story ${scene.sceneId}, ${width}x${height}, latency=${latencyMs}ms`,
      });

      totalCost += cost.totalCost;

      const result: ImageResult = {
        sceneId: scene.sceneId,
        success: true,
        width,
        height,
        resolutionTier: tier,
        promptTokens,
        outputTokens,
        imageOutputTokens: 0,
        cost: {
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          imageCost: cost.imageCost,
          totalCost: cost.totalCost,
        },
      };

      results.push(result);
      console.log(`  → ${width}x${height} (${tier}), tokens: ${promptTokens}in/${outputTokens}out, cost: $${cost.totalCost.toFixed(6)}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  → FAILED: ${errorMsg}`);
      results.push({
        sceneId: scene.sceneId,
        success: false,
        width: 0,
        height: 0,
        resolutionTier: "unknown",
        promptTokens: 0,
        outputTokens: 0,
        imageOutputTokens: 0,
        cost: { inputCost: 0, outputCost: 0, imageCost: 0, totalCost: 0 },
        error: errorMsg,
      });
    }
  }

  // Write cost report
  const report = {
    model: GEMINI_MODEL,
    totalImages: results.filter((r) => r.success).length,
    totalCost: totalCost,
    averageCostPerImage: results.filter((r) => r.success).length > 0
      ? totalCost / results.filter((r) => r.success).length
      : 0,
    images: results,
  };

  const reportPath = join(__dirname, "images-cost-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n=== Image Generation Cost Summary ===`);
  console.log(`Successful images: ${report.totalImages}/${results.length}`);
  console.log(`Total image cost: $${totalCost.toFixed(6)}`);
  console.log(`Average per image: $${report.averageCostPerImage.toFixed(6)}`);
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
