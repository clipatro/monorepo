/**
 * S23 kids video — image sourcing stage.
 *
 * For each mapped scene that needs an image, source a suitable bright,
 * child-friendly image:
 *   1. Search Wikipedia/Wikimedia for real images matching the scene's
 *      imageQuery (reuse the S22 pattern: Wikipedia API pageimages + generator).
 *   2. Download via curl with a browser User-Agent (Wikimedia blocks non-browser UAs).
 *   3. If no real image is found, fall back to Gemini Flash Lite Image
 *      generation with a kid-friendly prompt.
 *   4. In dry-run mode, copy the existing placeholder image from
 *      media/dry-run/placeholder-image.png.
 *
 * All downloads are persisted to spikes/output/s23-kids/images/<scene-id>.jpg
 * (or .png for placeholders) and recorded in the images artifact JSON.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDryRun } from "@automation/contracts";
import { checkBudget, calculateCost, recordCost } from "@automation/cost-tracker";
import type { MappedKidsScene } from "./mapping.ts";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const DRY_RUN_PLACEHOLDER = join(PROJECT_ROOT, "media", "dry-run", "placeholder-image.png");
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_GEN_MODEL = "gemini-3.1-flash-lite-image";

// === Output types ===

export interface SourcedImage {
  sceneOrder: number;
  /** Relative path from the spike output dir, e.g. "images/scene-1.jpg" */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Where the image came from. */
  source: "downloaded" | "generated" | "placeholder";
  /** Original URL if downloaded. */
  url?: string;
  width: number;
  height: number;
  costUsd: number;
}

export interface ImageStageOutput {
  images: SourcedImage[];
  totalCostUsd: number;
}

// === Helpers ===

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search Wikipedia for real images related to a topic.
 * Reuses the S22 pattern: Wikipedia API pageimages + generator=images.
 */
async function searchWikipediaImages(
  query: string,
): Promise<Array<{ url: string; description: string }>> {
  const results: Array<{ url: string; description: string }> = [];
  const headers = {
    "User-Agent": "ClipatroKidsSpike/1.0 (educational; contact@example.com)",
  };

  try {
    // Step 1: Search Wikipedia for the article
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) return results;
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const searchResults = searchData?.query?.search ?? [];
    if (searchResults.length === 0) return results;

    // Step 2: For each article, get its images via the API
    for (const article of searchResults.slice(0, 2)) {
      const title = article.title;

      // Get page main image (pageimages)
      const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&pilicense=any&format=json`;
      const imgRes = await fetch(imagesUrl, { headers });
      if (imgRes.ok) {
        const imgData = (await imgRes.json()) as {
          query?: { pages?: Record<string, { original?: { source: string; width: number; height: number } }> };
        };
        const pages = imgData?.query?.pages ?? {};
        for (const page of Object.values(pages)) {
          if (page?.original?.source) {
            results.push({
              url: page.original.source,
              description: `Wikipedia: ${title} — main image`,
            });
          }
        }
      }

      // Also get all images via generator
      const allImagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&generator=images&gimlimit=5&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json`;
      const allImgRes = await fetch(allImagesUrl, { headers });
      if (allImgRes.ok) {
        const allImgData = (await allImgRes.json()) as {
          query?: {
            pages?: Record<string, {
              ns?: number;
              title?: string;
              imageinfo?: Array<{ mime?: string; thumburl?: string; url?: string }>;
            }>;
          };
        };
        const imgPages = allImgData?.query?.pages ?? {};
        for (const imgPage of Object.values(imgPages)) {
          const info = imgPage?.imageinfo?.[0];
          if (!info) continue;
          const mime = info.mime ?? "";
          if (!mime.startsWith("image/") || mime.includes("svg") || mime.includes("gif")) continue;
          const url = info.thumburl ?? info.url;
          const titleLower = (imgPage?.title ?? "").toLowerCase();
          if (
            titleLower.includes("logo") ||
            titleLower.includes("icon") ||
            titleLower.includes("commons-logo") ||
            titleLower.includes("ambox")
          ) {
            continue;
          }
          if (url && url.includes("upload.wikimedia.org")) {
            results.push({
              url,
              description: `Wikipedia: ${title} — ${imgPage?.title?.replace(/^File:/, "") ?? "image"}`,
            });
          }
        }
      }
    }
  } catch {
    // Network errors are non-fatal — fall back to generation
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

/**
 * Download an image via curl with a browser User-Agent.
 * Reuses the S22 pattern. Returns dimensions via ffprobe.
 */
async function downloadImage(
  url: string,
  destPath: string,
): Promise<{ success: boolean; width: number; height: number; error?: string }> {
  const cleanUrl = url.replace(/\?.*$/, "");
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
      const { stdout } = await execAsync(
        `curl -sL -o "${destPath}" ` +
          `-H "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0" ` +
          `-H "Accept: image/webp,image/png,image/jpeg,*/*;q=0.8" ` +
          `--max-time 30 ` +
          `-w "\\n%{http_code} %{content_type} %{size_download}" ` +
          `"${cleanUrl}"`,
        { maxBuffer: 20 * 1024 * 1024 },
      );
      const lines = stdout.trim().split("\n");
      const lastLine = lines[lines.length - 1] ?? "";
      const parts = lastLine.trim().split(/\s+/);
      const httpCode = parts[0] ?? "";
      const sizeDownload = parseInt(parts[2] ?? "0");

      if (httpCode === "429" || httpCode === "403") {
        if (attempt < maxRetries) continue;
        return { success: false, width: 0, height: 0, error: `HTTP ${httpCode}` };
      }
      if (httpCode !== "200") return { success: false, width: 0, height: 0, error: `HTTP ${httpCode}` };
      if (sizeDownload < 1000) return { success: false, width: 0, height: 0, error: "Image too small" };

      try {
        const { stdout: probeOut } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${destPath}" 2>/dev/null`,
        );
        const probe = JSON.parse(probeOut) as {
          streams?: Array<{ width?: number; height?: number }>;
        };
        const stream = probe.streams?.[0];
        return {
          success: true,
          width: stream?.width ?? 0,
          height: stream?.height ?? 0,
        };
      } catch {
        return { success: true, width: 0, height: 0 };
      }
    } catch (err) {
      if (attempt < maxRetries) continue;
      return { success: false, width: 0, height: 0, error: String(err) };
    }
  }
  return { success: false, width: 0, height: 0, error: "Max retries exceeded" };
}

/**
 * Generate a kid-friendly image via Gemini Flash Lite Image.
 * Reuses the S22 generation pattern with a kid-friendly prompt suffix.
 */
async function generateImage(
  prompt: string,
  destPath: string,
  apiKey: string,
): Promise<{ success: boolean; costUsd: number; error?: string }> {
  try {
    const estimatedCost = 0.1;
    checkBudget(estimatedCost, {});

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${prompt}\n\nBright, colorful, kid-friendly illustration style. Vertical 9:16 composition. No text in the image. Cheerful and warm.`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.8 },
    };

    const t0 = performance.now();
    const res = await fetch(
      `${GEMINI_API_BASE}/models/${IMAGE_GEN_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const latencyMs = Math.round(performance.now() - t0);
    const raw = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
      error?: { message?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    if (!res.ok) return { success: false, costUsd: 0, error: raw.error?.message ?? `HTTP ${res.status}` };

    const imagePart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) return { success: false, costUsd: 0, error: "No image returned" };

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    await writeFile(destPath, imageBuffer);

    const usage = raw.usageMetadata ?? {};
    const cost = calculateCost({
      model: IMAGE_GEN_MODEL,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      imageCount: 1,
      imageResolution: "1k" as const,
    });
    recordCost(cost, {
      capability: "image.generate",
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      notes: `latency=${latencyMs}ms, kids-video`,
    });
    return { success: true, costUsd: cost.totalCost };
  } catch (err) {
    return { success: false, costUsd: 0, error: String(err) };
  }
}

// === Main image sourcing function ===

/**
 * Source images for all mapped scenes that need them.
 * In dry-run mode, copies the placeholder image. In real mode, tries
 * Wikipedia first, then falls back to Gemini generation.
 */
export async function sourceImages(
  mapped: MappedKidsScene[],
  outDir: string,
  apiKey: string,
): Promise<ImageStageOutput> {
  const imagesDir = join(outDir, "images");
  await mkdir(imagesDir, { recursive: true });

  const images: SourcedImage[] = [];
  const scenesNeedingImages = mapped.filter((s) => s.needsImage);

  if (scenesNeedingImages.length === 0) {
    return { images, totalCostUsd: 0 };
  }

  for (const scene of scenesNeedingImages) {
    const sceneId = `scene-${scene.order}`;
    let imgPath = join(imagesDir, `${sceneId}.jpg`);
    let costUsd = 0;
    let source: "downloaded" | "generated" | "placeholder" = "placeholder";
    let url: string | undefined;
    let width = 720;
    let height = 1280;

    if (isDryRun()) {
      // Dry-run: copy the placeholder image
      const placeholderPng = join(imagesDir, `${sceneId}.png`);
      if (await exists(DRY_RUN_PLACEHOLDER)) {
        await copyFile(DRY_RUN_PLACEHOLDER, placeholderPng);
        imgPath = placeholderPng;
      } else {
        // Fallback: write a minimal 1x1 PNG if the placeholder is missing
        await writeFile(placeholderPng, Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
          0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
          0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
          0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
          0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
          0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]));
        imgPath = placeholderPng;
      }
      source = "placeholder";
    } else if (scene.imageQuery) {
      // Real mode: search Wikipedia first
      const wikiResults = await searchWikipediaImages(scene.imageQuery);
      if (wikiResults.length > 0) {
        const result = wikiResults[0]!;
        url = result.url;
        const downloadResult = await downloadImage(url, imgPath);
        if (downloadResult.success) {
          source = "downloaded";
          width = downloadResult.width || width;
          height = downloadResult.height || height;
        } else {
          // Fall back to generation
          const genResult = await generateImage(scene.imageQuery, imgPath, apiKey);
          if (genResult.success) {
            source = "generated";
            costUsd = genResult.costUsd;
          }
        }
      } else {
        // No Wikipedia results — generate
        const genResult = await generateImage(scene.imageQuery, imgPath, apiKey);
        if (genResult.success) {
          source = "generated";
          costUsd = genResult.costUsd;
        }
      }
    }

    images.push({
      sceneOrder: scene.order,
      relativePath: `images/${sceneId}${imgPath.endsWith(".png") ? ".png" : ".jpg"}`,
      absolutePath: imgPath,
      source,
      url,
      width,
      height,
      costUsd,
    });
  }

  const totalCostUsd = images.reduce((sum, img) => sum + img.costUsd, 0);
  return { images, totalCostUsd };
}
