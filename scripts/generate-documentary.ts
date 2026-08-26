/**
 * Documentary Video Generation Script.
 *
 * Turns a topic into a complete documentary short video using the
 * @automation/remotion-templates DOCUMENTARY namespace components (28 components:
 * charts, narrative, facts, evidence, context, media), Gemini research with
 * grounding, REAL image downloading (Wikipedia, Wikimedia), Gemini TTS narration,
 * and background music mixing.
 *
 * Gated pipeline (each stage persists artifacts to spikes/output/s23/):
 *   1. Research    — Gemini grounding gathers evidence + real image URLs
 *   2. Script      — LLM writes a documentary script using documentary component catalog
 *   3. Scene Plan  — Map script beats to documentary components + compute timings
 *   4. Images      — Download real images from URLs found in research
 *                    (fall back to Gemini generation only if no real image)
 *   5. Narration   — Gemini TTS (Algenib) voiceover → WAV
 *   6. Music Sync  — Mix narration WAV with background.mp3 via FFmpeg
 *   7. Composition — Generate Remotion composition using documentary namespace
 *   8. Render      — Render the final MP4 via Remotion CLI
 *
 * Usage:
 *   bun run scripts/generate-documentary.ts "The Fall of the Berlin Wall"
 *   DRY_RUN=true bun run scripts/generate-documentary.ts "The 2008 Financial Crisis"
 *
 * This script is also callable by the video-service's /render-documentary endpoint
 * when the export directory contains a pre-generated render.tsx.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, access, copyFile, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Provider + cost tracking ────────────────────────────────────────────────
import { GeminiClient } from "@automation/gemini-client";
import { checkBudget, calculateCost, recordCost } from "@automation/cost-tracker";
import { isDryRun } from "@automation/contracts";

// ─── Documentary namespace imports ───────────────────────────────────────────
import {
  getLlmComponentCatalog,
  recommendComponents,
  archiveTheme,
  type ComponentCapability,
} from "@automation/remotion-templates";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

// ─── Models ──────────────────────────────────────────────────────────────────
const RESEARCH_MODEL = "gemini-3.7-flash";
const SCRIPT_MODEL = "gemini-3.6-flash";
const IMAGE_GEN_MODEL = "gemini-3.1-flash-lite-image";
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DocumentaryResearchArtifact {
  topic: string;
  sources: Array<{ id: string; title: string; url?: string; excerpt: string }>;
  claims: Array<{ id: string; claim: string; sourceIds: string[]; confidence: "high" | "medium" | "low" }>;
  allowedFacts: string[];
  uncertainties: string[];
  warnings: string[];
  realImages: Array<{
    url: string;
    description: string;
    sceneId?: string;
    downloaded?: boolean;
    localPath?: string;
  }>;
  costUsd: number;
}

export interface DocumentaryScriptScene {
  id: string;
  componentSlug: string;
  narrationSegment: string;
  title: string;
  data: Record<string, unknown>;
  needsImage: boolean;
  realImageUrl?: string;
  realImageDescription?: string;
  imagePrompt?: string;
  imageTreatment?: string;
  narrativeRole: string;
}

export interface DocumentaryScriptArtifact {
  topic: string;
  title: string;
  subtitle: string;
  narration: string;
  scenes: DocumentaryScriptScene[];
  costUsd: number;
}

export interface DocumentaryScenePlan {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  titleCard: { title: string; subtitle: string; startFrame: number; endFrame: number };
  scenes: Array<{
    id: string;
    componentSlug: string;
    startFrame: number;
    endFrame: number;
    durationFrames: number;
    data: Record<string, unknown>;
    imageUrl?: string;
    imageTreatment?: string;
  }>;
  endCard: { startFrame: number; endFrame: number };
}

export interface DocumentaryImageArtifact {
  images: Array<{
    sceneId: string;
    source: "downloaded" | "generated" | "placeholder";
    localPath: string;
    width: number;
    height: number;
    url?: string;
  }>;
  costUsd: number;
}

export interface DocumentaryNarrationArtifact {
  wavPath: string;
  durationSec: number;
  costUsd: number;
}

export interface DocumentaryMusicSyncArtifact {
  mixedAudioPath: string;
  durationSec: number;
  costUsd: number;
}

export interface DocumentaryCompositionArtifact {
  renderEntryPath: string;
  compositionId: string;
  configPath: string;
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface DocumentaryRenderArtifact {
  videoPath: string;
  durationSec: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(stage: string, msg: string): void {
  console.log(`  [${stage}] ${msg}`);
}

function costSummary(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ─── Image download (adapted from s22) ───────────────────────────────────────

async function downloadImage(
  url: string,
  destPath: string,
): Promise<{ success: boolean; width: number; height: number; error?: string }> {
  const cleanUrl = url.replace(/\?.*$/, "");
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const { stdout } = await execAsync(
        `curl -sL -o "${destPath}" ` +
          `-H "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0" ` +
          `-H "Accept: image/webp,image/png,image/jpeg,*/*;q=0.8" ` +
          `-H "Accept-Language: en-US,en;q=0.5" ` +
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
        return { success: false, width: 0, height: 0, error: `HTTP ${httpCode} (after retries)` };
      }
      if (httpCode !== "200") return { success: false, width: 0, height: 0, error: `HTTP ${httpCode}` };
      if (sizeDownload < 1000) return { success: false, width: 0, height: 0, error: "Image too small" };

      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${destPath}" 2>/dev/null`,
        );
        const probe = JSON.parse(stdout);
        const stream = probe.streams?.[0];
        return { success: true, width: stream?.width ?? 0, height: stream?.height ?? 0 };
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

async function searchWikipediaImages(
  topic: string,
): Promise<Array<{ url: string; description: string }>> {
  const results: Array<{ url: string; description: string }> = [];
  const headers = { "User-Agent": "ClipatroDocumentary/1.0 (research; contact@example.com)" };

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) return results;
    const searchData = (await searchRes.json()) as any;
    const searchResults = searchData?.query?.search ?? [];
    if (searchResults.length === 0) return results;

    log("Research", `  Wikipedia search found ${searchResults.length} articles`);

    for (const article of searchResults.slice(0, 2)) {
      const title = article.title;
      log("Research", `  Fetching images from: ${title}`);

      const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&pilicense=any&format=json`;
      const imgRes = await fetch(imagesUrl, { headers });
      if (!imgRes.ok) continue;
      const imgData = (await imgRes.json()) as any;
      const pages = imgData?.query?.pages ?? {};
      for (const page of Object.values(pages) as any[]) {
        const original = page?.original;
        if (original?.source) {
          results.push({
            url: original.source,
            description: `Wikipedia: ${title} — main image (${original.width}x${original.height})`,
          });
        }
      }

      const allImagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&generator=images&gimlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json`;
      const allImgRes = await fetch(allImagesUrl, { headers });
      if (allImgRes.ok) {
        const allImgData = (await allImgRes.json()) as any;
        const imgPages = allImgData?.query?.pages ?? {};
        for (const imgPage of Object.values(imgPages) as any[]) {
          const info = imgPage?.imageinfo?.[0];
          if (!info) continue;
          const mime = info.mime ?? "";
          if (!mime.startsWith("image/") || mime.includes("svg") || mime.includes("gif")) continue;
          const url = info.thumburl ?? info.url;
          if (url && url.includes("upload.wikimedia.org")) {
            const titleLower = (imgPage?.title ?? "").toLowerCase();
            if (
              titleLower.includes("logo") ||
              titleLower.includes("icon") ||
              titleLower.includes("commons-logo") ||
              titleLower.includes("semi-protect") ||
              titleLower.includes("edit-clear") ||
              titleLower.includes("ambox")
            )
              continue;
            results.push({
              url,
              description: `Wikipedia: ${title} — ${imgPage?.title?.replace(/^File:/, "") ?? "image"}`,
            });
          }
        }
      }
    }
  } catch (err) {
    log("Research", `  Wikipedia image search error: ${String(err).slice(0, 100)}`);
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ─── Stage 1: Research ───────────────────────────────────────────────────────

async function runResearch(
  client: GeminiClient,
  topic: string,
  outDir: string,
): Promise<DocumentaryResearchArtifact> {
  console.log("\n▸ Stage 1: Research (Gemini grounding + real image discovery)...\n");

  if (isDryRun()) {
    const artifact: DocumentaryResearchArtifact = {
      topic,
      sources: [
        { id: "s1", title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Test", excerpt: "Sample source" },
      ],
      claims: [{ id: "c1", claim: "Sample claim", sourceIds: ["s1"], confidence: "high" }],
      allowedFacts: ["Sample fact 1", "Sample fact 2"],
      uncertainties: ["What remains unknown"],
      warnings: [],
      realImages: [{ url: "https://example.com/image.jpg", description: "Sample image" }],
      costUsd: 0,
    };
    await writeFile(join(outDir, "01-research.json"), JSON.stringify(artifact, null, 2));
    log("Research", `DRY-RUN: ${artifact.sources.length} sources, ${artifact.realImages.length} images`);
    return artifact;
  }

  // Phase 1: Gemini grounding for facts
  const result = await client.call({
    model: RESEARCH_MODEL,
    prompt: `Research the documentary topic: "${topic}".

Use search to find real facts. Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "sources": [{ "id": "s1", "title": "Source title", "url": "https://...", "excerpt": "Brief excerpt" }],
  "claims": [{ "id": "c1", "claim": "A verified claim", "sourceIds": ["s1"], "confidence": "high" }],
  "allowedFacts": ["concise verified fact 1", "concise verified fact 2"],
  "uncertainties": ["what remains unknown"],
  "warnings": ["any caveats about sources or accuracy"]
}

Focus on: key events, dates, statistics, named people, causes and consequences. Include at least 3 sources.`,
    useGrounding: true,
    systemInstruction:
      "You are an evidence-first documentary researcher. Find verifiable facts from reliable sources. Cite sources. Flag uncertainties. Never fabricate.",
    capability: "research.grounding",
  });

  const researchData = JSON.parse(result.text);
  let costUsd = result.cost?.totalCost ?? 0;

  // Phase 2: Wikipedia image search
  const wikiImages = await searchWikipediaImages(topic);
  log("Research", `Found ${wikiImages.length} real images from Wikipedia`);

  const artifact: DocumentaryResearchArtifact = {
    topic,
    sources: researchData.sources ?? [],
    claims: researchData.claims ?? [],
    allowedFacts: researchData.allowedFacts ?? [],
    uncertainties: researchData.uncertainties ?? [],
    warnings: researchData.warnings ?? [],
    realImages: wikiImages,
    costUsd,
  };

  await writeFile(join(outDir, "01-research.json"), JSON.stringify(artifact, null, 2));
  log("Research", `${artifact.sources.length} sources, ${artifact.claims.length} claims, ${artifact.realImages.length} images — ${costSummary(costUsd)}`);
  return artifact;
}

// ─── Stage 2: Script ─────────────────────────────────────────────────────────

async function runScript(
  client: GeminiClient,
  topic: string,
  research: DocumentaryResearchArtifact,
  outDir: string,
): Promise<DocumentaryScriptArtifact> {
  console.log("\n▸ Stage 2: Script (documentary component selection)...\n");

  const catalog = getLlmComponentCatalog();
  const catalogCompact = catalog.components.map((c) => ({
    slug: c.slug,
    name: c.name,
    purpose: c.purpose,
    narrativeRoles: c.narrativeRoles,
    informationShapes: c.informationShapes,
    tones: c.tones,
    media: c.media,
    inputs: c.inputs,
    textBudget: c.textBudget,
    selectionHint: c.selectionHint,
  }));

  const realImagesInfo = research.realImages.map((img, i) => ({
    index: i,
    url: img.url,
    description: img.description,
  }));

  if (isDryRun()) {
    const artifact: DocumentaryScriptArtifact = {
      topic,
      title: "Sample Documentary",
      subtitle: "A short documentary",
      narration: "This is a sample narration for testing.",
      scenes: [
        {
          id: "scene-1",
          componentSlug: "title-card",
          narrationSegment: "This is a sample documentary.",
          title: "Sample Documentary",
          data: { title: "Sample Documentary", subtitle: "A short documentary" },
          needsImage: false,
          narrativeRole: "intro",
        },
      ],
      costUsd: 0,
    };
    await writeFile(join(outDir, "02-script.json"), JSON.stringify(artifact, null, 2));
    log("Script", `DRY-RUN: ${artifact.scenes.length} scenes`);
    return artifact;
  }

  const prompt = `Create a short-form documentary script for the topic: "${topic}".

RESEARCH EVIDENCE (use only these verified facts):
${JSON.stringify(research.allowedFacts, null, 2)}

SOURCES:
${JSON.stringify(research.sources.map((s) => ({ title: s.title, url: s.url })), null, 2)}

REAL IMAGES AVAILABLE (assign these to scenes when they fit):
${JSON.stringify(realImagesInfo, null, 2)}

DOCUMENTARY COMPONENT CATALOG (choose components for each scene):
${JSON.stringify(catalogCompact, null, 2)}

DESIGN RULES:
- 60-90 seconds total (vertical 9:16, ${FPS}fps)
- 6-10 scenes
- Scene 1 MUST use "title-card" with title and subtitle
- Last scene MUST use "end-card"
- Second-to-last scene MUST use "conclusion-card"
- Use a variety of components — mix narrative, facts, evidence, and media
- Assign real images from the list above when they fit a scene
- Set realImageUrl and realImageDescription when a real image fits
- Only set imagePrompt if NO real image fits (fallback to AI generation)
- Set imageTreatment: "documentary" | "archive" | "monochrome" | "clean" based on content
- Each scene's data must match the component's required inputs
- Narration should be evidence-first, authoritative, engaging

Return ONLY valid JSON (no markdown) in this format:
{
  "title": "Documentary title",
  "subtitle": "One-line subtitle",
  "narration": "Full narration script (all segments joined)",
  "scenes": [
    {
      "id": "scene-1",
      "componentSlug": "title-card",
      "narrationSegment": "Narration for this scene only",
      "title": "Scene title for logging",
      "data": { ... component-specific data ... },
      "needsImage": true/false,
      "realImageUrl": "https://..." (if a real image fits),
      "realImageDescription": "description" (if realImageUrl set),
      "imagePrompt": "prompt" (ONLY if no real image),
      "imageTreatment": "documentary|archive|monochrome|clean",
      "narrativeRole": "hook|intro|fact|evidence|..."
    }
  ]
}`;

  const result = await client.call({
    model: SCRIPT_MODEL,
    prompt,
    responseJson: true,
    systemInstruction:
      "You are a master scriptwriter for viral short-form documentary videos. You use evidence, cite sources, and select the right visual component for each beat. Your scripts are tight, engaging, and factually grounded.",
    temperature: 0.7,
    maxOutputTokens: 8192,
    capability: "script.generate",
  });

  const scriptData = JSON.parse(result.text);
  const costUsd = result.cost?.totalCost ?? 0;

  const artifact: DocumentaryScriptArtifact = {
    topic,
    title: scriptData.title ?? topic,
    subtitle: scriptData.subtitle ?? "",
    narration: scriptData.narration ?? "",
    scenes: scriptData.scenes ?? [],
    costUsd,
  };

  await writeFile(join(outDir, "02-script.json"), JSON.stringify(artifact, null, 2));
  log("Script", `${artifact.scenes.length} scenes, narration ${artifact.narration.length} chars — ${costSummary(costUsd)}`);
  return artifact;
}

// ─── Stage 3: Scene Plan ─────────────────────────────────────────────────────

async function runScenePlan(
  script: DocumentaryScriptArtifact,
  narrationDurationSec: number,
  outDir: string,
): Promise<DocumentaryScenePlan> {
  console.log("\n▸ Stage 3: Scene plan (timing + component mapping)...\n");

  const titleCardFrames = 90; // 3s at 30fps
  const endCardFrames = 90;
  const contentScenes = script.scenes.filter(
    (s) => s.componentSlug !== "title-card" && s.componentSlug !== "end-card",
  );

  // Distribute narration time across content scenes proportionally
  const contentDurationSec = narrationDurationSec - (titleCardFrames + endCardFrames) / FPS;
  const totalSegmentChars = contentScenes.reduce((sum, s) => sum + s.narrationSegment.length, 0) || 1;

  let currentFrame = 0;
  const scenes = contentScenes.map((s) => {
    const proportion = s.narrationSegment.length / totalSegmentChars;
    const durationSec = Math.max(3, contentDurationSec * proportion);
    const durationFrames = Math.round(durationSec * FPS);
    const startFrame = currentFrame;
    currentFrame += durationFrames;
    return {
      id: s.id,
      componentSlug: s.componentSlug,
      startFrame: titleCardFrames + startFrame,
      endFrame: titleCardFrames + currentFrame,
      durationFrames,
      data: s.data,
      imageUrl: undefined as string | undefined,
      imageTreatment: s.imageTreatment,
    };
  });

  const totalFrames = titleCardFrames + currentFrame + endCardFrames;

  const plan: DocumentaryScenePlan = {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalFrames,
    titleCard: {
      title: script.title,
      subtitle: script.subtitle,
      startFrame: 0,
      endFrame: titleCardFrames,
    },
    scenes,
    endCard: {
      startFrame: titleCardFrames + currentFrame,
      endFrame: totalFrames,
    },
  };

  await writeFile(join(outDir, "03-scene-plan.json"), JSON.stringify(plan, null, 2));
  log("ScenePlan", `${contentScenes.length} content scenes, ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);
  return plan;
}

// ─── Stage 4: Image Acquisition ──────────────────────────────────────────────

async function runImageAcquisition(
  script: DocumentaryScriptArtifact,
  research: DocumentaryResearchArtifact,
  apiKey: string,
  outDir: string,
): Promise<DocumentaryImageArtifact> {
  console.log("\n▸ Stage 4: Image acquisition (download real + fallback generate)...\n");

  const imagesDir = join(outDir, "images");
  await mkdir(imagesDir, { recursive: true });

  const images: DocumentaryImageArtifact["images"] = [];
  let costUsd = 0;

  for (const scene of script.scenes) {
    if (!scene.needsImage) continue;

    const destPath = join(imagesDir, `${scene.id}.jpg`);
    let source: "downloaded" | "generated" | "placeholder" = "placeholder";
    let url: string | undefined;
    let width = 0;
    let height = 0;

    // Try real image first
    if (scene.realImageUrl) {
      log("Images", `  ${scene.id}: downloading real image...`);
      const result = await downloadImage(scene.realImageUrl, destPath);
      if (result.success) {
        source = "downloaded";
        url = scene.realImageUrl;
        width = result.width;
        height = result.height;
        log("Images", `  ${scene.id}: downloaded ${width}x${height}`);
      } else {
        log("Images", `  ${scene.id}: download failed (${result.error}) — trying fallback`);
      }
    }

    // Fallback: generate with Gemini
    if (source === "placeholder" && scene.imagePrompt && !isDryRun()) {
      log("Images", `  ${scene.id}: generating fallback image...`);
      const genResult = await generateImage(scene.imagePrompt, destPath, apiKey);
      if (genResult.success) {
        source = "generated";
        costUsd += genResult.costUsd;
      }
    }

    // Dry-run placeholder
    if (source === "placeholder" && isDryRun()) {
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=1 -frames:v 1 "${destPath}" 2>/dev/null`,
      );
      width = 1080;
      height = 1920;
    }

    if (await exists(destPath)) {
      images.push({ sceneId: scene.id, source, localPath: destPath, width, height, url });
    }
  }

  const artifact: DocumentaryImageArtifact = { images, costUsd };
  await writeFile(join(outDir, "04-images.json"), JSON.stringify(artifact, null, 2));
  log("Images", `${images.length} images (${images.filter((i) => i.source === "downloaded").length} downloaded, ${images.filter((i) => i.source === "generated").length} generated) — ${costSummary(costUsd)}`);
  return artifact;
}

async function generateImage(
  prompt: string,
  destPath: string,
  apiKey: string,
): Promise<{ success: boolean; costUsd: number; error?: string }> {
  try {
    const body = {
      contents: [{ role: "user", parts: [{ text: `${prompt}\n\nVertical 9:16 composition, cinematic, documentary style. No text in the image.` }] }],
      generationConfig: { temperature: 0.8 },
    };

    const res = await fetch(
      `${GEMINI_API_BASE}/models/${IMAGE_GEN_MODEL}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const raw = (await res.json()) as any;
    if (!res.ok) return { success: false, costUsd: 0, error: raw.error?.message ?? String(res.status) };

    const imagePart = raw.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) return { success: false, costUsd: 0, error: "No image in response" };

    await writeFile(destPath, Buffer.from(imagePart.inlineData.data, "base64"));
    return { success: true, costUsd: 0.04 };
  } catch (err) {
    return { success: false, costUsd: 0, error: String(err) };
  }
}

// ─── Stage 5: Narration ──────────────────────────────────────────────────────

async function runNarration(
  narration: string,
  apiKey: string,
  outDir: string,
): Promise<DocumentaryNarrationArtifact> {
  console.log("\n▸ Stage 5: Narration (Gemini TTS)...\n");

  const wavPath = join(outDir, "narration.wav");
  let costUsd = 0;
  let durationSec = 10;

  if (isDryRun()) {
    durationSec = Math.max(10, Math.ceil(narration.length / 15));
    // Generate a minimal silent WAV
    await execAsync(
      `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${durationSec} -c:a pcm_s16le "${wavPath}" 2>/dev/null`,
    );
    log("Narration", `DRY-RUN: dummy WAV ${durationSec}s`);
  } else {
    const ttsPrompt = `Perform the narration inside <script> exactly as written. Do not add, remove, or reorder any word.

VOICE DIRECTION:
- Natural en-US pronunciation.
- Authoritative, engaging tone — like a documentary narrator.
- Clear and measured pace with energy and intent.
- Use subtle emotional shifts — quieter for questions, more intense for reveals.
- Sound credible and evidence-first.

<script>
${narration}
</script>`;

    const body = {
      contents: [{ role: "user", parts: [{ text: ttsPrompt }] }],
      generationConfig: {
        temperature: 1,
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
      },
    };

    const t0 = performance.now();
    const res = await fetch(
      `${GEMINI_API_BASE}/models/${TTS_MODEL}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const latencyMs = Math.round(performance.now() - t0);
    const raw = (await res.json()) as any;

    if (!res.ok) throw new Error(`Gemini TTS failed: ${raw.error?.message ?? res.status}`);

    const audioPart = raw.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!audioPart?.inlineData?.data) throw new Error("Gemini TTS returned no audio");

    const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
    const pcmPath = join(outDir, "narration.pcm");
    await writeFile(pcmPath, pcmBuffer);
    await execAsync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a pcm_s16le "${wavPath}"`);

    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${wavPath}"`,
    );
    const probe = JSON.parse(probeOut);
    durationSec = parseFloat(probe.format.duration);

    const usage = raw.usageMetadata ?? {};
    const cost = calculateCost({
      model: TTS_MODEL,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    });
    recordCost(cost, {
      capability: "voice.synthesize",
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      notes: `latency=${latencyMs}ms, voice=${TTS_VOICE}, duration=${durationSec.toFixed(1)}s`,
    });
    costUsd = cost.totalCost;
    log("Narration", `WAV ${durationSec.toFixed(1)}s — ${costSummary(costUsd)}`);
  }

  const artifact: DocumentaryNarrationArtifact = { wavPath, durationSec, costUsd };
  await writeFile(join(outDir, "05-narration.json"), JSON.stringify(artifact, null, 2));
  return artifact;
}

// ─── Stage 6: Music Sync ─────────────────────────────────────────────────────

async function runMusicSync(
  narrationPath: string,
  narrationDurationSec: number,
  outDir: string,
): Promise<DocumentaryMusicSyncArtifact> {
  console.log("\n▸ Stage 6: Music sync (narration + background music)...\n");

  const mixedPath = join(outDir, "mixed-audio.wav");

  if (!(await exists(BACKGROUND_MUSIC))) {
    log("MusicSync", `Background music not found — using narration only`);
    await copyFile(narrationPath, mixedPath);
    const artifact: DocumentaryMusicSyncArtifact = { mixedAudioPath: mixedPath, durationSec: narrationDurationSec, costUsd: 0 };
    await writeFile(join(outDir, "06-music-sync.json"), JSON.stringify(artifact, null, 2));
    return artifact;
  }

  const totalDuration = narrationDurationSec + 3;
  await execAsync(
    `ffmpeg -y -i "${narrationPath}" -i "${BACKGROUND_MUSIC}" ` +
      `-filter_complex "[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[voice];[1:a]volume=0.10,afade=t=in:st=0:d=1.5,afade=t=out:st=${(totalDuration - 2).toFixed(1)}:d=2[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=0:weights=1 0.3" ` +
      `-t ${totalDuration.toFixed(1)} -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
  );

  const { stdout: probeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${mixedPath}"`,
  );
  const probe = JSON.parse(probeOut);
  const durationSec = parseFloat(probe.format.duration);

  log("MusicSync", `Mixed audio ${durationSec.toFixed(1)}s (narration at -14 LUFS, music at 10%)`);
  const artifact: DocumentaryMusicSyncArtifact = { mixedAudioPath: mixedPath, durationSec, costUsd: 0 };
  await writeFile(join(outDir, "06-music-sync.json"), JSON.stringify(artifact, null, 2));
  return artifact;
}

// ─── Stage 7: Composition Generation ─────────────────────────────────────────

function generateDocumentaryRenderEntry(
  config: DocumentaryScenePlan & { titleCardImageUrl?: string; endCardImageUrl?: string },
  script: DocumentaryScriptArtifact,
): string {
  const scenes = config.scenes;

  const titleCardScene = script.scenes.find((s) => s.componentSlug === "title-card");
  const endCardScene = script.scenes.find((s) => s.componentSlug === "end-card");

  const titleCardData = titleCardScene?.data ?? { title: config.titleCard.title, subtitle: config.titleCard.subtitle };
  const endCardData = endCardScene?.data ?? {};

  const sceneRenders = scenes
    .map((s) => {
      const dataStr = JSON.stringify(s.data);
      const imageProp = s.imageUrl ? `imageUrl={staticFile("${s.imageUrl}")}` : "";
      const treatmentProp = s.imageTreatment ? `imageTreatment="${s.imageTreatment}"` : "";
      return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <DocumentarySceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={archiveTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
    })
    .join("\n");

  return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import {
  archiveTheme,
  TitleCard,
  EndCard,
  HookHeadline,
  ChapterCard,
  QuestionCard,
  QuoteCard,
  ConclusionCard,
  KeyFact,
  StatisticSpotlight,
  MythFact,
  ComparisonSplit,
  BeforeAfter,
  EvidenceCard,
  SourceCitation,
  DocumentReveal,
  Timeline,
  EventCountdown,
  PersonProfile,
  LocationCard,
  MapRoute,
  ProcessSteps,
  CauseEffect,
  HeroImageStory,
  ArchivalPhoto,
  PhotoStack,
  ImageComparison,
  ImageQuote,
  EvidenceZoom,
  ImageMosaic,
  CaptionedImage,
  BarChart,
  LineChart,
  PieChart,
  CircularProgress,
  AnimatedList,
} from "@automation/remotion-templates";

const DocumentarySceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment } : data;
  switch (slug) {
    case "hook-headline": return <HookHeadline data={fullData} theme={theme} />;
    case "chapter-card": return <ChapterCard data={fullData} theme={theme} />;
    case "question-card": return <QuestionCard data={fullData} theme={theme} />;
    case "quote-card": return <QuoteCard data={fullData} theme={theme} />;
    case "conclusion-card": return <ConclusionCard data={fullData} theme={theme} />;
    case "key-fact": return <KeyFact data={fullData} theme={theme} />;
    case "statistic-spotlight": return <StatisticSpotlight data={fullData} theme={theme} />;
    case "myth-fact": return <MythFact data={fullData} theme={theme} />;
    case "comparison-split": return <ComparisonSplit data={fullData} theme={theme} />;
    case "before-after": return <BeforeAfter data={fullData} theme={theme} />;
    case "evidence-card": return <EvidenceCard data={fullData} theme={theme} />;
    case "source-citation": return <SourceCitation data={fullData} theme={theme} />;
    case "document-reveal": return <DocumentReveal data={fullData} theme={theme} />;
    case "timeline": return <Timeline data={fullData} theme={theme} />;
    case "event-countdown": return <EventCountdown data={fullData} theme={theme} />;
    case "person-profile": return <PersonProfile data={fullData} theme={theme} />;
    case "location-card": return <LocationCard data={fullData} theme={theme} />;
    case "map-route": return <MapRoute data={fullData} theme={theme} />;
    case "process-steps": return <ProcessSteps data={fullData} theme={theme} />;
    case "cause-effect": return <CauseEffect data={fullData} theme={theme} />;
    case "hero-image-story": return <HeroImageStory data={fullData} theme={theme} />;
    case "archival-photo": return <ArchivalPhoto data={fullData} theme={theme} />;
    case "photo-stack": return <PhotoStack data={fullData} theme={theme} />;
    case "image-comparison": return <ImageComparison data={fullData} theme={theme} />;
    case "image-quote": return <ImageQuote data={fullData} theme={theme} />;
    case "evidence-zoom": return <EvidenceZoom data={fullData} theme={theme} />;
    case "image-mosaic": return <ImageMosaic data={fullData} theme={theme} />;
    case "captioned-image": return <CaptionedImage data={fullData} theme={theme} />;
    case "bar-chart": return <BarChart data={fullData} theme={theme} />;
    case "line-chart": return <LineChart data={fullData} theme={theme} />;
    case "pie-chart": return <PieChart data={fullData} theme={theme} />;
    case "circular-progress": return <CircularProgress data={fullData} theme={theme} />;
    case "animated-list": return <AnimatedList data={fullData} theme={theme} />;
    default: return <AbsoluteFill style={{ background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#e85d3f" }}><p>Unknown: {slug}</p></AbsoluteFill>;
  }
};

const DocumentaryVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      <Sequence from={${config.titleCard.startFrame}} durationInFrames={${config.titleCard.endFrame - config.titleCard.startFrame}}>
        <TitleCard title={${JSON.stringify(titleCardData.title ?? config.titleCard.title)}} subtitle={${JSON.stringify(titleCardData.subtitle ?? config.titleCard.subtitle)}} theme={archiveTheme} />
      </Sequence>
${sceneRenders}
      <Sequence from={${config.endCard.startFrame}} durationInFrames={${config.endCard.endFrame - config.endCard.startFrame}}>
        <EndCard theme={archiveTheme} />
      </Sequence>
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="DocumentaryVideo" component={DocumentaryVideo} durationInFrames={${config.totalFrames}} fps={${config.fps}} width={${config.width}} height={${config.height}} />
);

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
}

async function runComposition(
  script: DocumentaryScriptArtifact,
  scenePlan: DocumentaryScenePlan,
  images: DocumentaryImageArtifact,
  musicSync: DocumentaryMusicSyncArtifact,
  outDir: string,
): Promise<DocumentaryCompositionArtifact> {
  console.log("\n▸ Stage 7: Composition (Remotion entry generation)...\n");

  // Build image map
  const imageMap: Record<string, string> = {};
  for (const img of images.images) {
    imageMap[img.sceneId] = `images/${img.sceneId}.jpg`;
  }

  // Update scene plan with image paths
  const config = {
    ...scenePlan,
    scenes: scenePlan.scenes.map((s) => ({
      ...s,
      imageUrl: imageMap[s.id] ?? undefined,
    })),
  };

  // Generate render entry
  const renderEntryPath = join(outDir, "render.tsx");
  const componentCode = generateDocumentaryRenderEntry(config, script);
  await writeFile(renderEntryPath, componentCode);

  // Write config
  const configPath = join(outDir, "composition-config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));

  // Copy assets to public folder
  const publicDir = join(outDir, "public");
  await mkdir(publicDir, { recursive: true });
  await mkdir(join(publicDir, "images"), { recursive: true });

  // Copy mixed audio
  await copyFile(musicSync.mixedAudioPath, join(publicDir, "mixed-audio.wav"));

  // Copy images
  for (const img of images.images) {
    const destPath = join(publicDir, "images", `${img.sceneId}.jpg`);
    await copyFile(img.localPath, destPath);
  }

  const artifact: DocumentaryCompositionArtifact = {
    renderEntryPath,
    compositionId: "DocumentaryVideo",
    configPath,
    totalFrames: scenePlan.totalFrames,
    fps: scenePlan.fps,
    width: scenePlan.width,
    height: scenePlan.height,
  };

  await writeFile(join(outDir, "07-composition.json"), JSON.stringify(artifact, null, 2));
  log("Composition", `render.tsx + ${images.images.length} images + audio → public/`);
  return artifact;
}

// ─── Stage 8: Render ─────────────────────────────────────────────────────────

async function runRender(
  composition: DocumentaryCompositionArtifact,
  outDir: string,
): Promise<DocumentaryRenderArtifact> {
  console.log("\n▸ Stage 8: Render (Remotion CLI)...\n");

  const videoPath = join(outDir, "documentary-video.mp4");
  const publicDir = join(outDir, "public");

  const cmd = `npx remotion render "${composition.renderEntryPath}" "${composition.compositionId}" "${videoPath}" --public-dir="${publicDir}" --log=verbose`;

  log("Render", `Running: ${cmd.slice(0, 120)}...`);

  if (isDryRun()) {
    // Generate a placeholder video
    await execAsync(
      `ffmpeg -y -f lavfi -i color=c=0x0a0a0a:s=${WIDTH}x${HEIGHT}:d=${(composition.totalFrames / composition.fps).toFixed(1)} -c:v libx264 -t ${(composition.totalFrames / composition.fps).toFixed(1)} "${videoPath}" 2>/dev/null`,
    );
    log("Render", `DRY-RUN: placeholder video generated`);
  } else {
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 600000,
    });
    if (stderr && !stderr.includes("warn")) {
      log("Render", `stderr (first 300 chars): ${stderr.slice(0, 300)}`);
    }
  }

  // Probe output
  let durationSec = 0;
  let sizeBytes = 0;
  let width = 0;
  let height = 0;
  let fps = composition.fps;

  try {
    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
    );
    const probe = JSON.parse(probeOut);
    durationSec = parseFloat(probe.format?.duration ?? "0");
    sizeBytes = parseInt(probe.format?.size ?? "0");
    const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
    if (videoStream) {
      width = parseInt(videoStream.width ?? "0");
      height = parseInt(videoStream.height ?? "0");
    }
  } catch {
    // non-critical
  }

  const artifact: DocumentaryRenderArtifact = {
    videoPath,
    durationSec,
    sizeBytes,
    width,
    height,
    fps,
  };

  await writeFile(join(outDir, "08-render.json"), JSON.stringify(artifact, null, 2));
  log("Render", `${width}x${height}, ${durationSec.toFixed(1)}s, ${Math.round(sizeBytes / 1024 / 1024)} MB`);
  return artifact;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export async function generateDocumentaryVideo(
  topic: string,
  outDir?: string,
): Promise<{
  research: DocumentaryResearchArtifact;
  script: DocumentaryScriptArtifact;
  scenePlan: DocumentaryScenePlan;
  images: DocumentaryImageArtifact;
  narration: DocumentaryNarrationArtifact;
  musicSync: DocumentaryMusicSyncArtifact;
  composition: DocumentaryCompositionArtifact;
  render: DocumentaryRenderArtifact;
  totalCostUsd: number;
}> {
  const outputDir = outDir ?? join(PROJECT_ROOT, "spikes", "output", "s23");
  await mkdir(outputDir, { recursive: true });

  console.log(`\n========================================`);
  console.log(`  Documentary Video Generation`);
  console.log(`  Topic: ${topic}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Dry-run: ${isDryRun() ? "YES" : "NO"}`);
  console.log(`========================================\n`);

  // Load env
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey && !isDryRun()) {
    throw new Error("GEMINI_API_KEY is not set and dry-run mode is not enabled");
  }

  const client = new GeminiClient({ apiKey });

  // Stage 1: Research
  const research = await runResearch(client, topic, outputDir);

  // Stage 2: Script
  const script = await runScript(client, topic, research, outputDir);

  // Stage 3: Scene Plan (initial estimate from text length)
  const estimatedDuration = Math.max(30, Math.ceil(script.narration.length / 15));
  let scenePlan = await runScenePlan(script, estimatedDuration, outputDir);

  // Stage 4: Images
  const images = await runImageAcquisition(script, research, apiKey, outputDir);

  // Stage 5: Narration
  const narration = await runNarration(script.narration, apiKey, outputDir);

  // Stage 3b: Re-compute scene plan with actual narration duration
  scenePlan = await runScenePlan(script, narration.durationSec, outputDir);

  // Stage 6: Music Sync
  const musicSync = await runMusicSync(narration.wavPath, narration.durationSec, outputDir);

  // Stage 7: Composition
  const composition = await runComposition(script, scenePlan, images, musicSync, outputDir);

  // Stage 8: Render
  const render = await runRender(composition, outputDir);

  const totalCostUsd =
    research.costUsd + script.costUsd + images.costUsd + narration.costUsd + musicSync.costUsd;

  console.log(`\n========================================`);
  console.log(`  Complete! Total cost: ${costSummary(totalCostUsd)}`);
  console.log(`  Video: ${render.videoPath}`);
  console.log(`  Duration: ${render.durationSec.toFixed(1)}s`);
  console.log(`  Size: ${Math.round(render.sizeBytes / 1024 / 1024)} MB`);
  console.log(`========================================\n`);

  return {
    research,
    script,
    scenePlan,
    images,
    narration,
    musicSync,
    composition,
    render,
    totalCostUsd,
  };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const topic = process.argv[2] ?? "The Fall of the Berlin Wall";
  generateDocumentaryVideo(topic).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
