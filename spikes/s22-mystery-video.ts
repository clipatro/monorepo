/**
 * S22 — Mystery Video Generation Spike.
 *
 * Turns a topic + theme into a complete mystery documentary video using
 * the @automation/remotion-templates MYSTERY namespace components, Gemini
 * research with grounding, REAL image downloading (Wikipedia, Wikimedia,
 * news sites), Gemini TTS narration, and background music mixing.
 *
 * Key difference from S21: images are DOWNLOADED from real sources found
 * during research, not AI-generated. Only if no real image is available
 * for a scene do we fall back to Gemini image generation.
 *
 * Gated pipeline (each stage persists artifacts to spikes/output/s22/):
 *   1. Research    — Gemini grounding gathers evidence + real image URLs
 *   2. Script      — LLM writes a mystery script using mystery component catalog
 *   3. Scene Plan  — Map script beats to mystery components + compute timings
 *   4. Images      — Download real images from URLs found in research
 *                    (fall back to Gemini generation only if no real image)
 *   5. Narration   — Gemini TTS (Algenib) voiceover → WAV
 *   6. Music Sync  — Mix narration WAV with background.mp3 via FFmpeg
 *   7. Composition — Generate Remotion composition using mystery namespace
 *   8. Render      — Render the final MP4 via Remotion CLI
 *
 * Usage:
 *   bun run spikes/s22-mystery-video.ts "The Flannan Isles Lighthouse Mystery"
 *   DRY_RUN=true bun run spikes/s22-mystery-video.ts "The Dyatlov Pass Incident"
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, access, copyFile, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, spikeDir, writeArtifact, type SpikeResult } from "./lib/spike.ts";

// ─── Provider + cost tracking ────────────────────────────────────────────────
import { GeminiClient } from "@automation/gemini-client";
import { checkBudget, calculateCost, recordCost } from "@automation/cost-tracker";
import { isDryRun } from "@automation/contracts";

// ─── Mystery namespace imports ───────────────────────────────────────────────
import {
  getMysteryLlmCatalog,
  recommendMysteryComponents,
  mysteryTheme,
  type MysteryComponentCapability,
} from "@automation/remotion-templates";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const FPS = 30;
const WIDTH = 720;
const HEIGHT = 1280;
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

// ─── Models ──────────────────────────────────────────────────────────────────
const RESEARCH_MODEL = "gemini-3.7-flash";
const SCRIPT_MODEL = "gemini-3.6-flash";
const IMAGE_GEN_MODEL = "gemini-3.1-flash-lite-image";
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MysteryResearchArtifact {
  topic: string;
  sources: Array<{
    id: string;
    title: string;
    url?: string;
    excerpt: string;
  }>;
  claims: Array<{
    id: string;
    claim: string;
    sourceIds: string[];
    confidence: "high" | "medium" | "low";
  }>;
  allowedFacts: string[];
  uncertainties: string[];
  warnings: string[];
  /** Real image URLs found during research — Wikipedia, Wikimedia, news sites */
  realImages: Array<{
    url: string;
    description: string;
    /** Which scene this image is best for (assigned during script generation) */
    sceneId?: string;
    /** Whether the download succeeded */
    downloaded?: boolean;
    localPath?: string;
  }>;
  costUsd: number;
}

export interface MysteryScriptScene {
  id: string;
  /** Mystery component slug, e.g. "mystery-title-card", "mystery-clue" */
  componentSlug: string;
  narrationSegment: string;
  title: string;
  data: Record<string, unknown>;
  /** Whether this scene needs an image */
  needsImage: boolean;
  /** Real image URL from research (if available) */
  realImageUrl?: string;
  /** Real image description from research */
  realImageDescription?: string;
  /** Image prompt for fallback generation (only if no real image) */
  imagePrompt?: string;
  /** Image treatment: dark | desaturated | noir | clean */
  imageTreatment?: string;
  narrativeRole: string;
}

export interface MysteryScriptArtifact {
  topic: string;
  title: string;
  subtitle: string;
  narration: string;
  scenes: MysteryScriptScene[];
  costUsd: number;
}

export interface MysteryScenePlanArtifact {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  titleCard: { startFrame: number; endFrame: number; title: string; subtitle: string };
  scenes: Array<{
    id: string;
    componentSlug: string;
    startFrame: number;
    endFrame: number;
    durationFrames: number;
    data: Record<string, unknown>;
    imageUrl?: string;
    imageTreatment?: string;
    narrativeRole: string;
  }>;
  endCard: { startFrame: number; endFrame: number };
  narrationDurationSec: number;
  costUsd: number;
}

export interface MysteryImageArtifact {
  images: Array<{
    sceneId: string;
    path: string;
    source: "downloaded" | "generated" | "placeholder";
    url?: string;
    width: number;
    height: number;
    costUsd: number;
  }>;
  totalCostUsd: number;
}

export interface MysteryNarrationArtifact {
  wavPath: string;
  durationSec: number;
  costUsd: number;
}

export interface MysteryMusicSyncArtifact {
  mixedAudioPath: string;
  durationSec: number;
  costUsd: number;
}

export interface MysteryCompositionArtifact {
  renderEntryPath: string;
  configPath: string;
  compositionId: string;
  costUsd: number;
}

export interface MysteryRenderArtifact {
  videoPath: string;
  durationSec: number;
  sizeBytes: number;
  costUsd: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function log(stage: string, msg: string): void {
  console.log(`  [${stage}] ${msg}`);
}

function costSummary(total: number): string {
  return `$${total.toFixed(4)}`;
}

/**
 * Download an image from a URL and save it locally.
 * Uses curl with a browser User-Agent (Wikimedia blocks custom UAs).
 * Retries on rate limiting with exponential backoff.
 */
async function downloadImage(url: string, destPath: string): Promise<{ success: boolean; width: number; height: number; error?: string }> {
  // Clean URL — strip ALL query parameters (Wikimedia tracking params cause issues)
  const cleanUrl = url.replace(/\?.*$/, "");

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Use curl with a browser User-Agent — Wikimedia blocks non-browser UAs
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

      // Parse curl output — last line is "http_code content_type size"
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

      // Get dimensions via ffprobe
      try {
        const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${destPath}" 2>/dev/null`);
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

/**
 * Extract the first real image URL from a Wikipedia/Wikimedia page.
 * Tries common patterns: Wikipedia article images, Wikimedia Commons files.
 */
async function extractImageFromPage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Try Wikipedia/Wikimedia patterns
    // Pattern 1: og:image meta tag (most reliable for any page)
    const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogMatch?.[1]) return ogMatch[1];

    // Pattern 2: Wikimedia upload URLs
    const wikiMatch = html.match(/https?:\/\/upload\.wikimedia\.org\/[^"'\s]+\.(?:jpg|jpeg|png)/i);
    if (wikiMatch?.[0]) return wikiMatch[0];

    // Pattern 3: Any large image in the page (Wikipedia infobox)
    const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png)[^"]*)"/i);
    if (imgMatch?.[1]) return imgMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Search Wikipedia for real images related to a topic.
 * Uses the Wikipedia API to find the article, then extracts images from it.
 * Returns array of { url, description } pairs with real Wikimedia image URLs.
 */
async function searchWikipediaImages(topic: string): Promise<Array<{ url: string; description: string }>> {
  const results: Array<{ url: string; description: string }> = [];
  const headers = { "User-Agent": "ClipatroMysterySpike/1.0 (research; contact@example.com)" };

  try {
    // Step 1: Search Wikipedia for the article
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) return results;
    const searchData = await searchRes.json() as any;
    const searchResults = searchData?.query?.search ?? [];
    if (searchResults.length === 0) return results;

    log("Research", `  Wikipedia search found ${searchResults.length} articles`);

    // Step 2: For each article, get its images via the API
    for (const article of searchResults.slice(0, 2)) {
      const title = article.title;
      log("Research", `  Fetching images from: ${title}`);

      // Get page images
      const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&pilicense=any&format=json`;
      const imgRes = await fetch(imagesUrl, { headers });
      if (!imgRes.ok) continue;
      const imgData = await imgRes.json() as any;
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

      // Also get all images from the article via generator
      const allImagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&generator=images&gimlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json`;
      const allImgRes = await fetch(allImagesUrl, { headers });
      if (allImgRes.ok) {
        const allImgData = await allImgRes.json() as any;
        const imgPages = allImgData?.query?.pages ?? {};
        for (const imgPage of Object.values(imgPages) as any[]) {
          const info = imgPage?.imageinfo?.[0];
          if (!info) continue;
          const mime = info.mime ?? "";
          if (!mime.startsWith("image/") || mime.includes("svg") || mime.includes("gif")) continue;
          const url = info.thumburl ?? info.url;
          if (url && url.includes("upload.wikimedia.org")) {
            // Skip icons, logos, and common UI elements
            const ns = imgPage?.ns ?? 0;
            const titleLower = (imgPage?.title ?? "").toLowerCase();
            if (titleLower.includes("logo") || titleLower.includes("icon") || titleLower.includes("commons-logo") || titleLower.includes("semi-protect") || titleLower.includes("edit-clear") || titleLower.includes("ambox")) continue;
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

  // Deduplicate by URL
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ─── Stage 1: Research (with real image URL discovery) ───────────────────────

async function runResearch(
  client: GeminiClient,
  topic: string,
  outDir: string,
): Promise<MysteryResearchArtifact> {
  console.log("\n▸ Stage 1: Research (Gemini grounding + real image discovery)...\n");

  if (isDryRun()) {
    const artifact = generateMockResearch(topic);
    await writeArtifact("s22", "01-research.json", JSON.stringify(artifact, null, 2));
    log("Research", `DRY-RUN: ${artifact.sources.length} sources, ${artifact.claims.length} claims, ${artifact.realImages.length} real images — $0.0000`);
    return artifact;
  }

  const result = await client.call({
    model: RESEARCH_MODEL,
    prompt: `Research the mystery: "${topic}".

Use search to find real facts. Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "sources": [{ "id": "s1", "title": "Source title", "url": "https://...", "excerpt": "Brief excerpt" }],
  "claims": [{ "id": "c1", "claim": "A verified claim", "sourceIds": ["s1"], "confidence": "high" }],
  "allowedFacts": ["concise verified fact 1", "concise verified fact 2"],
  "uncertainties": ["what remains unknown"],
  "warnings": ["any cautions about the evidence"]
}

Focus on: what happened, when, where, who was involved, key numbers, timeline.
Include 3-6 sources and 5-10 allowed facts. Do NOT include image URLs — those are
found separately via the Wikipedia API. Return ONLY the JSON object.`,
    useGrounding: true,
    systemInstruction: "You are an evidence-first mystery researcher. Find real data and authoritative sources using search. Never fabricate sources or statistics. Return ONLY valid JSON.",
    temperature: 0.2,
    maxOutputTokens: 4096,
    capability: "research.grounding",
  });

  log("Research", `  Gemini response: ${result.text.slice(0, 100)}...`);

  const parsed = result.json as {
    sources?: Array<{ id?: string; title?: string; url?: string; excerpt?: string }>;
    claims?: Array<{ id?: string; claim?: string; sourceIds?: string[]; confidence?: string }>;
    allowedFacts?: string[];
    uncertainties?: string[];
    warnings?: string[];
    realImages?: Array<{ url?: string; description?: string }>;
  } | null;

  const sources = (parsed?.sources ?? []).map((s, i) => ({
    id: s.id ?? `s${i + 1}`,
    title: s.title ?? "Untitled",
    url: s.url,
    excerpt: s.excerpt ?? "",
  }));

  const claims = (parsed?.claims ?? []).map((c, i) => ({
    id: c.id ?? `c${i + 1}`,
    claim: c.claim ?? "",
    sourceIds: c.sourceIds ?? [],
    confidence: (c.confidence === "high" || c.confidence === "low" ? c.confidence : "medium") as "high" | "medium" | "low",
  }));

  const realImages = (parsed?.realImages ?? []).filter((img) => img.url).map((img, i) => ({
    url: img.url!,
    description: img.description ?? `Image ${i + 1}`,
  }));

  // Supplement with direct Wikipedia API image search (much more reliable than LLM URLs)
  log("Research", `  Gemini found ${realImages.length} images — supplementing with Wikipedia API...`);
  const wikiImages = await searchWikipediaImages(topic);
  log("Research", `  Wikipedia API found ${wikiImages.length} real images`);

  // Merge: Wikipedia images first (more reliable), then any Gemini-found images
  const allRealImages = [...wikiImages, ...realImages];
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const dedupedRealImages = allRealImages.filter((img) => {
    if (seenUrls.has(img.url)) return false;
    seenUrls.add(img.url);
    return true;
  });

  const artifact: MysteryResearchArtifact = {
    topic,
    sources,
    claims,
    allowedFacts: parsed?.allowedFacts ?? [],
    uncertainties: parsed?.uncertainties ?? [],
    warnings: parsed?.warnings ?? [],
    realImages: dedupedRealImages,
    costUsd: result.cost.totalCost,
  };

  await writeArtifact("s22", "01-research.json", JSON.stringify(artifact, null, 2));
  log("Research", `${sources.length} sources, ${claims.length} claims, ${artifact.allowedFacts.length} facts, ${dedupedRealImages.length} real images — ${costSummary(artifact.costUsd)}`);
  for (const img of dedupedRealImages) {
    log("Research", `  Real image: ${img.description.slice(0, 60)} — ${img.url.slice(0, 80)}`);
  }
  return artifact;
}

// ─── Stage 2: Script Generation ──────────────────────────────────────────────

async function runScript(
  client: GeminiClient,
  topic: string,
  research: MysteryResearchArtifact,
  outDir: string,
): Promise<MysteryScriptArtifact> {
  console.log("\n▸ Stage 2: Script generation (mystery component catalog)...\n");

  if (isDryRun()) {
    const artifact = generateMockScript(topic, research);
    await writeArtifact("s22", "02-script.json", JSON.stringify(artifact, null, 2));
    log("Script", `DRY-RUN: ${artifact.scenes.length} scenes, ${artifact.narration.length} chars narration — $0.0000`);
    for (const s of artifact.scenes) {
      log("Script", `  ${s.id}: ${s.componentSlug} — "${s.title?.slice(0, 50) ?? ""}"`);
    }
    return artifact;
  }

  const catalog = getMysteryLlmCatalog();
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

  const prompt = `Write a short-form mystery documentary script about: "${topic}".

RESEARCH EVIDENCE (use only these verified facts):
${JSON.stringify(research.allowedFacts, null, 2)}

SOURCES:
${JSON.stringify(research.sources.map((s) => ({ title: s.title, excerpt: s.excerpt })), null, 2)}

REAL IMAGES AVAILABLE (assign these to scenes that need images — use the realImageUrl field):
${JSON.stringify(realImagesInfo, null, 2)}

AVAILABLE MYSTERY COMPONENTS (pick one per scene):
${JSON.stringify(catalogCompact, null, 2)}

VIRAL SHORT-FORM DESIGN RULES (critical for retention):
1. The video is 60-90 seconds, vertical 9:16 (720x1280), ${FPS}fps.
2. Write 6-9 scenes. Scene 1 MUST use "mystery-title-card". Last scene MUST use "mystery-end-card".
3. Second-to-last scene MUST use "mystery-ending".
4. Each scene's narrationSegment concatenates to form the full narration (minus title card and end card).
5. Narration should be 120-180 words, spoken-word style, ready for TTS.
6. For each scene, pick the BEST mystery component slug from the catalog above.
7. Fill in the component's data fields based on the research evidence.
8. HOOK PATTERN: The title card MUST include a "hook" field — a bold, attention-grabbing question or statement
   that makes viewers stop scrolling. Examples: "Three men vanished. No bodies. No explanation." or
   "What they found inside still haunts investigators today."
9. CLIFFHANGER ENDING: The "mystery-ending" scene MUST include an "openQuestion" field — an unresolved question
   that leaves viewers thinking. The "mystery-end-card" MUST include "finalQuestion", "cta", and "channelName"
   in its data. Example cta: "Follow for more mysteries". Example channelName: "mysteryfiles".
10. EVERY scene needs an image. If a real image from the REAL IMAGES list fits, set realImageUrl to that URL
    and realImageDescription to the description. Only set imagePrompt if NO real image fits (fallback generation).
    Even scenes without a specific image need a background image — assign the closest matching real image.
11. Set imageTreatment based on the scene mood: "dark" for locations, "noir" for evidence, "desaturated" for people.
12. Do NOT fabricate facts — use only the research evidence provided.
13. Narration should build suspense — start with the hook, escalate with clues, end with the open question.
14. IMPORTANT: Assign real images to as many scenes as possible. The title card should use a real image as
    a darkened background. Reuse images across scenes if needed to ensure every scene has a visual.

Return JSON in this exact format:
{
  "topic": "${topic}",
  "title": "Mystery title (4-8 words)",
  "subtitle": "Subtitle (3-8 words)",
  "narration": "Full narration text, 120-180 words",
  "scenes": [
    {
      "id": "scene1",
      "componentSlug": "mystery-title-card",
      "narrationSegment": "",
      "title": "Title for the card",
      "data": { "title": "...", "subtitle": "...", "hook": "Bold attention-grabbing question/statement", "caseLabel": "CASE 01" },
      "needsImage": true,
      "realImageUrl": "https://...",
      "realImageDescription": "Description of the real image",
      "imageTreatment": "dark",
      "narrativeRole": "opening"
    },
    {
      "id": "scene-last",
      "componentSlug": "mystery-end-card",
      "narrationSegment": "",
      "title": "",
      "data": { "cta": "Follow for more mysteries", "channelName": "mysteryfiles", "finalQuestion": "What do YOU think happened?" },
      "needsImage": true,
      "realImageUrl": "https://...",
      "imageTreatment": "dark",
      "narrativeRole": "outro"
    }
  ]
}`;

  const result = await client.call({
    model: SCRIPT_MODEL,
    prompt,
    responseJson: true,
    systemInstruction: "You are a master scriptwriter for viral short-form mystery documentaries on TikTok/Shorts/Reels. You write suspenseful, hook-driven narration that grabs attention in the first 2 seconds and builds curiosity throughout. You select the best mystery component for each beat. You prioritize REAL images over generated ones and ensure EVERY scene has a visual. You end with cliffhangers, not resolutions. Return ONLY valid JSON.",
    temperature: 0.7,
    maxOutputTokens: 8192,
    capability: "script.generate",
  });

  const parsed = result.json as MysteryScriptArtifact | null;
  if (!parsed || !parsed.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error("Script generation failed: invalid JSON structure");
  }

  const artifact: MysteryScriptArtifact = {
    ...parsed,
    topic,
    costUsd: result.cost.totalCost,
  };

  await writeArtifact("s22", "02-script.json", JSON.stringify(artifact, null, 2));
  log("Script", `${artifact.scenes.length} scenes, ${artifact.narration.length} chars narration — ${costSummary(artifact.costUsd)}`);
  for (const s of artifact.scenes) {
    const imgSource = s.realImageUrl ? "REAL" : s.imagePrompt ? "GEN" : "none";
    log("Script", `  ${s.id}: ${s.componentSlug} — "${s.title?.slice(0, 50) ?? ""}" [img: ${imgSource}]`);
  }
  return artifact;
}

// ─── Stage 3: Scene Plan + Timings ───────────────────────────────────────────

async function runScenePlan(
  script: MysteryScriptArtifact,
  narrationDurationSec: number,
  outDir: string,
): Promise<MysteryScenePlanArtifact> {
  console.log("\n▸ Stage 3: Scene plan + timings...\n");

  const titleCardFrames = 90;  // 3s at 30fps
  const endCardFrames = 90;    // 3s
  const narrationStartFrame = titleCardFrames;
  const narrationTotalFrames = Math.ceil(narrationDurationSec * FPS);
  const totalFrames = titleCardFrames + narrationTotalFrames + endCardFrames;

  const narrationScenes = script.scenes.filter((s) => s.narrationSegment && s.narrationSegment.length > 0);
  const totalChars = narrationScenes.reduce((sum, s) => sum + s.narrationSegment.length, 0);

  let currentFrame = narrationStartFrame;
  const sceneTimings: MysteryScenePlanArtifact["scenes"] = [];

  for (const scene of script.scenes) {
    if (scene.componentSlug === "mystery-title-card") continue;
    if (scene.componentSlug === "mystery-end-card") continue;

    const segmentLen = scene.narrationSegment?.length ?? 0;
    const proportion = totalChars > 0 ? segmentLen / totalChars : 0;
    const sceneFrames = Math.max(45, Math.round(narrationTotalFrames * proportion));

    sceneTimings.push({
      id: scene.id,
      componentSlug: scene.componentSlug,
      startFrame: currentFrame,
      endFrame: currentFrame + sceneFrames,
      durationFrames: sceneFrames,
      data: scene.data,
      imageTreatment: scene.imageTreatment,
      narrativeRole: scene.narrativeRole,
    });
    currentFrame += sceneFrames;
  }

  // Adjust last scene to end exactly at narration end
  if (sceneTimings.length > 0) {
    const last = sceneTimings[sceneTimings.length - 1]!;
    last.endFrame = narrationStartFrame + narrationTotalFrames;
    last.durationFrames = last.endFrame - last.startFrame;
  }

  const artifact: MysteryScenePlanArtifact = {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalFrames,
    titleCard: {
      startFrame: 0,
      endFrame: titleCardFrames,
      title: script.title,
      subtitle: script.subtitle,
    },
    scenes: sceneTimings,
    endCard: {
      startFrame: titleCardFrames + narrationTotalFrames,
      endFrame: totalFrames,
    },
    narrationDurationSec,
    costUsd: 0,
  };

  await writeArtifact("s22", "03-scene-plan.json", JSON.stringify(artifact, null, 2));
  log("ScenePlan", `${sceneTimings.length} scenes, ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);
  for (const s of sceneTimings) {
    log("ScenePlan", `  ${s.id} (${s.componentSlug}): ${s.startFrame}-${s.endFrame} (${(s.durationFrames / FPS).toFixed(1)}s)`);
  }
  return artifact;
}

// ─── Stage 4: Image Acquisition (download real, fallback generate) ───────────

async function runImageAcquisition(
  script: MysteryScriptArtifact,
  research: MysteryResearchArtifact,
  apiKey: string,
  outDir: string,
): Promise<MysteryImageArtifact> {
  console.log("\n▸ Stage 4: Image acquisition (download real images, fallback generate)...\n");

  const images: MysteryImageArtifact["images"] = [];
  const imageScenes = script.scenes.filter((s) => s.needsImage);

  if (imageScenes.length === 0) {
    log("Images", "No scenes require images — skipping");
    const artifact: MysteryImageArtifact = { images, totalCostUsd: 0 };
    await writeArtifact("s22", "04-images.json", JSON.stringify(artifact, null, 2));
    return artifact;
  }

  const imagesDir = join(outDir, "images");
  await mkdir(imagesDir, { recursive: true });

  for (const scene of imageScenes) {
    // Small delay between downloads to avoid Wikimedia rate limiting
    if (scene.realImageUrl) await new Promise((r) => setTimeout(r, 500));

    const imgPath = join(imagesDir, `${scene.id}.jpg`);
    let costUsd = 0;
    let source: "downloaded" | "generated" | "placeholder" = "placeholder";
    let url: string | undefined;

    if (isDryRun()) {
      // Generate a placeholder dark gray image
      const placeholder = generatePlaceholderJpg(WIDTH, HEIGHT);
      await writeFile(imgPath, placeholder);
      source = "placeholder";
      log("Images", `DRY-RUN: placeholder for ${scene.id}`);
    } else if (scene.realImageUrl) {
      // Download the real image
      url = scene.realImageUrl;
      log("Images", `Downloading real image for ${scene.id} from ${url.slice(0, 80)}...`);
      const downloadResult = await downloadImage(url, imgPath);

      if (downloadResult.success) {
        source = "downloaded";
        log("Images", `  Downloaded: ${downloadResult.width}x${downloadResult.height}`);

        // If the image is very small or wrong aspect ratio, try to extract a better one from the page
        if (downloadResult.width > 0 && downloadResult.width < 200) {
          log("Images", `  Image too small, trying to extract from page...`);
          const betterUrl = await extractImageFromPage(url);
          if (betterUrl && betterUrl !== url) {
            log("Images", `  Found better image URL: ${betterUrl.slice(0, 80)}`);
            const retry = await downloadImage(betterUrl, imgPath);
            if (retry.success) {
              log("Images", `  Downloaded better image: ${retry.width}x${retry.height}`);
            }
          }
        }
      } else {
        log("Images", `  Download failed: ${downloadResult.error} — trying fallback`);

        // Try extracting from the page URL
        const extractedUrl = await extractImageFromPage(url);
        if (extractedUrl) {
          log("Images", `  Extracted image from page: ${extractedUrl.slice(0, 80)}`);
          const retry = await downloadImage(extractedUrl, imgPath);
          if (retry.success) {
            source = "downloaded";
            url = extractedUrl;
            log("Images", `  Downloaded extracted image: ${retry.width}x${retry.height}`);
          } else {
            // Fall back to generation
            if (scene.imagePrompt) {
              log("Images", `  Falling back to Gemini generation for ${scene.id}`);
              const genResult = await generateImage(scene.imagePrompt, imgPath, apiKey);
              if (genResult.success) {
                source = "generated";
                costUsd = genResult.costUsd;
                log("Images", `  Generated: ${costSummary(costUsd)}`);
              }
            }
          }
        } else if (scene.imagePrompt) {
          log("Images", `  Falling back to Gemini generation for ${scene.id}`);
          const genResult = await generateImage(scene.imagePrompt, imgPath, apiKey);
          if (genResult.success) {
            source = "generated";
            costUsd = genResult.costUsd;
            log("Images", `  Generated: ${costSummary(costUsd)}`);
          }
        }
      }
    } else if (scene.imagePrompt) {
      // No real image — generate with Gemini
      log("Images", `Generating image for ${scene.id} (no real image available)`);
      const genResult = await generateImage(scene.imagePrompt, imgPath, apiKey);
      if (genResult.success) {
        source = "generated";
        costUsd = genResult.costUsd;
        log("Images", `  Generated: ${costSummary(costUsd)}`);
      }
    } else {
      log("Images", `  No image source for ${scene.id} — using placeholder`);
      const placeholder = generatePlaceholderJpg(WIDTH, HEIGHT);
      await writeFile(imgPath, placeholder);
    }

    // Get final dimensions
    let imgWidth = WIDTH, imgHeight = HEIGHT;
    try {
      const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${imgPath}" 2>/dev/null`);
      const probe = JSON.parse(stdout);
      const stream = probe.streams?.[0];
      if (stream) { imgWidth = stream.width ?? WIDTH; imgHeight = stream.height ?? HEIGHT; }
    } catch { /* use defaults */ }

    images.push({ sceneId: scene.id, path: imgPath, source, url, width: imgWidth, height: imgHeight, costUsd });
  }

  const totalCostUsd = images.reduce((sum, img) => sum + img.costUsd, 0);
  const downloaded = images.filter((i) => i.source === "downloaded").length;
  const generated = images.filter((i) => i.source === "generated").length;
  const placeholder = images.filter((i) => i.source === "placeholder").length;

  const artifact: MysteryImageArtifact = { images, totalCostUsd };
  await writeArtifact("s22", "04-images.json", JSON.stringify(artifact, null, 2));
  log("Images", `${images.length} images: ${downloaded} downloaded, ${generated} generated, ${placeholder} placeholder — ${costSummary(totalCostUsd)}`);
  return artifact;
}

/** Generate an image using Gemini Flash Lite Image */
async function generateImage(prompt: string, destPath: string, apiKey: string): Promise<{ success: boolean; costUsd: number; error?: string }> {
  try {
    const estimatedCost = 0.10;
    await checkBudget(estimatedCost, {});

    const body = {
      contents: [{ role: "user", parts: [{ text: `${prompt}\n\nVertical 9:16 composition, cinematic, documentary style. No text in the image.` }] }],
      generationConfig: { temperature: 0.8 },
    };

    const t0 = performance.now();
    const res = await fetch(
      `${GEMINI_API_BASE}/models/${IMAGE_GEN_MODEL}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const latencyMs = Math.round(performance.now() - t0);
    const raw = await res.json() as any;

    if (!res.ok) return { success: false, costUsd: 0, error: raw.error?.message ?? res.status };

    const imagePart = raw.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
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
      notes: `latency=${latencyMs}ms`,
    });
    return { success: true, costUsd: cost.totalCost };
  } catch (err) {
    return { success: false, costUsd: 0, error: String(err) };
  }
}

// ─── Stage 5: Narration (Gemini TTS) ─────────────────────────────────────────

async function runNarration(
  narration: string,
  apiKey: string,
  outDir: string,
): Promise<MysteryNarrationArtifact> {
  console.log("\n▸ Stage 5: Narration (Gemini TTS Algenib)...\n");

  const wavPath = join(outDir, "narration.wav");
  let costUsd = 0;
  let durationSec = 10;

  if (isDryRun()) {
    durationSec = Math.max(10, Math.ceil(narration.length / 15));
    const dummyWav = generateDummyWav(durationSec);
    await writeFile(wavPath, dummyWav);
    log("Narration", `DRY-RUN: dummy WAV ${durationSec}s`);
  } else {
    const estimatedCost = 0.05;
    await checkBudget(estimatedCost, {});

    const ttsPrompt = `Perform the narration inside <script> exactly as written. Do not add, remove, or reorder any word.

VOICE DIRECTION:
- Natural en-US pronunciation.
- Suspenseful, engaging tone — like a mystery narrator drawing the listener in.
- Start strong with the hook — grab attention immediately.
- Build suspense throughout — pause slightly before key reveals.
- Sound like someone telling a gripping true story, not reading a report.
- Speak at a measured pace but with energy and intent.
- Use subtle emotional shifts — quieter for questions, more intense for reveals.
- End with a sense of unresolved mystery — leave the listener wanting more.

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
    const raw = await res.json() as any;

    if (!res.ok) throw new Error(`Gemini TTS failed: ${raw.error?.message ?? res.status}`);

    const audioPart = raw.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!audioPart?.inlineData?.data) throw new Error("Gemini TTS returned no audio");

    const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
    const pcmPath = join(outDir, "narration.pcm");
    await writeFile(pcmPath, pcmBuffer);

    await execAsync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a pcm_s16le "${wavPath}"`);

    const { stdout: probeOut } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${wavPath}"`);
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

  const artifact: MysteryNarrationArtifact = { wavPath, durationSec, costUsd };
  await writeArtifact("s22", "05-narration.json", JSON.stringify(artifact, null, 2));
  return artifact;
}

// ─── Stage 6: Music Sync ─────────────────────────────────────────────────────

async function runMusicSync(
  narrationPath: string,
  narrationDurationSec: number,
  outDir: string,
): Promise<MysteryMusicSyncArtifact> {
  console.log("\n▸ Stage 6: Music sync (narration + background music)...\n");

  const mixedPath = join(outDir, "mixed-audio.wav");

  if (!await exists(BACKGROUND_MUSIC)) {
    log("MusicSync", `Background music not found at ${BACKGROUND_MUSIC} — using narration only`);
    await copyFile(narrationPath, mixedPath);
    const artifact: MysteryMusicSyncArtifact = { mixedAudioPath: mixedPath, durationSec: narrationDurationSec, costUsd: 0 };
    await writeArtifact("s22", "06-music-sync.json", JSON.stringify(artifact, null, 2));
    return artifact;
  }

  // Normalize narration to -14 dB LUFS (broadcast standard for speech),
  // then duck music under it. Mystery tone = quieter music bed (12% volume)
  // but narration must be clearly audible.
  const totalDuration = narrationDurationSec + 3;
  await execAsync(
    `ffmpeg -y -i "${narrationPath}" -i "${BACKGROUND_MUSIC}" ` +
    `-filter_complex "[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[voice];[1:a]volume=0.12,afade=t=in:st=0:d=1.5,afade=t=out:st=${(totalDuration - 2).toFixed(1)}:d=2[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=0:weights=1 0.3" ` +
    `-t ${totalDuration.toFixed(1)} -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
  );

  const { stdout: probeOut } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${mixedPath}"`);
  const probe = JSON.parse(probeOut);
  const durationSec = parseFloat(probe.format.duration);

  // Verify audio levels
  try {
    const { stdout: volOut } = await execAsync(`ffmpeg -i "${mixedPath}" -af "volumedetect" -f null - 2>&1`);
    const meanMatch = volOut.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
    const maxMatch = volOut.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/);
    const meanDb = meanMatch?.[1] ?? "?";
    const maxDb = maxMatch?.[1] ?? "?";
    log("MusicSync", `Mixed audio ${durationSec.toFixed(1)}s — mean: ${meanDb} dB, max: ${maxDb} dB (narration normalized to -14 LUFS, music at 12%)`);
  } catch {
    log("MusicSync", `Mixed audio ${durationSec.toFixed(1)}s (narration normalized to -14 LUFS, music at 12%)`);
  }
  const artifact: MysteryMusicSyncArtifact = { mixedAudioPath: mixedPath, durationSec, costUsd: 0 };
  await writeArtifact("s22", "06-music-sync.json", JSON.stringify(artifact, null, 2));
  return artifact;
}

// ─── Stage 7: Composition Generation ─────────────────────────────────────────

async function runComposition(
  script: MysteryScriptArtifact,
  scenePlan: MysteryScenePlanArtifact,
  images: MysteryImageArtifact,
  musicSync: MysteryMusicSyncArtifact,
  outDir: string,
): Promise<MysteryCompositionArtifact> {
  console.log("\n▸ Stage 7: Remotion composition generation (mystery namespace)...\n");

  const imageMap: Record<string, string> = {};
  for (const img of images.images) {
    imageMap[img.sceneId] = `images/${img.sceneId}.jpg`;
  }

  // Find title card and end card scenes to get their image URLs
  const titleCardScene = script.scenes.find((s) => s.componentSlug === "mystery-title-card");
  const endCardScene = script.scenes.find((s) => s.componentSlug === "mystery-end-card");
  const titleCardImageUrl = titleCardScene ? imageMap[titleCardScene.id] : undefined;
  const endCardImageUrl = endCardScene ? imageMap[endCardScene.id] : undefined;

  const config = {
    fps: scenePlan.fps,
    width: scenePlan.width,
    height: scenePlan.height,
    totalFrames: scenePlan.totalFrames,
    theme: "mystery-dark",
    titleCard: scenePlan.titleCard,
    titleCardImageUrl,
    scenes: scenePlan.scenes.map((s) => ({
      ...s,
      imageUrl: imageMap[s.id] ?? undefined,
    })),
    endCard: scenePlan.endCard,
    endCardImageUrl,
    audioFile: "mixed-audio.wav",
  };

  const configPath = join(outDir, "composition-config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));

  const renderEntryPath = join(outDir, "render.tsx");
  const componentCode = generateMysteryRenderEntry(config, script);
  await writeFile(renderEntryPath, componentCode);

  // Copy assets
  const publicDir = join(outDir, "public");
  await mkdir(publicDir, { recursive: true });
  await copyFile(musicSync.mixedAudioPath, join(publicDir, "mixed-audio.wav"));

  const imagesPublicDir = join(publicDir, "images");
  await mkdir(imagesPublicDir, { recursive: true });
  for (const img of images.images) {
    await copyFile(img.path, join(imagesPublicDir, `${img.sceneId}.jpg`));
  }

  const compositionId = "MysteryVideo";
  log("Composition", `Entry: ${renderEntryPath}`);
  log("Composition", `Config: ${configPath}`);
  log("Composition", `Public: ${publicDir} (${images.images.length} images + audio)`);

  const artifact: MysteryCompositionArtifact = { renderEntryPath, configPath, compositionId, costUsd: 0 };
  await writeArtifact("s22", "07-composition.json", JSON.stringify(artifact, null, 2));
  return artifact;
}

function generateMysteryRenderEntry(config: any, script: MysteryScriptArtifact): string {
  const scenes = config.scenes as any[];

  // Find the title card and end card scenes from the script (they have the hook, cta, etc.)
  const titleCardScene = script.scenes.find((s) => s.componentSlug === "mystery-title-card");
  const endCardScene = script.scenes.find((s) => s.componentSlug === "mystery-end-card");

  // Build title card data with hook
  const titleCardData = titleCardScene?.data ?? { title: config.titleCard.title, subtitle: config.titleCard.subtitle };
  const titleCardImageProp = config.titleCardImageUrl ? `imageUrl={staticFile("${config.titleCardImageUrl}")}` : "";
  const titleCardTreatment = titleCardScene?.imageTreatment ? `imageTreatment="${titleCardScene.imageTreatment}"` : "";

  // Build end card data with cta, channelName, finalQuestion
  const endCardData = endCardScene?.data ?? { cta: "Follow for more mysteries", channelName: "mysteryfiles", finalQuestion: "What do YOU think happened?" };
  const endCardImageProp = config.endCardImageUrl ? `imageUrl={staticFile("${config.endCardImageUrl}")}` : "";
  const endCardTreatment = endCardScene?.imageTreatment ? `imageTreatment="${endCardScene.imageTreatment}"` : "";

  const sceneRenders = scenes.map((s) => {
    const dataStr = JSON.stringify(s.data);
    const imageProp = s.imageUrl ? `imageUrl={staticFile("${s.imageUrl}")}` : "";
    const treatmentProp = s.imageTreatment ? `imageTreatment="${s.imageTreatment}"` : "";
    return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <MysterySceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={mysteryTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
  }).join("\n");

  return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import {
  mysteryTheme,
  MysteryTitleCard,
  MysteryImageReveal,
  MysteryQuestion,
  MysteryClue,
  MysteryTimeline,
  MysteryQuote,
  MysteryLocation,
  MysteryStatistic,
  MysteryEnding,
  MysteryEndCard,
} from "@automation/remotion-templates";

const MysterySceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment } : data;
  switch (slug) {
    case "mystery-title-card": return <MysteryTitleCard data={fullData} theme={theme} />;
    case "mystery-image-reveal": return <MysteryImageReveal data={fullData} theme={theme} />;
    case "mystery-question": return <MysteryQuestion data={fullData} theme={theme} />;
    case "mystery-clue": return <MysteryClue data={fullData} theme={theme} />;
    case "mystery-timeline": return <MysteryTimeline data={fullData} theme={theme} />;
    case "mystery-quote": return <MysteryQuote data={fullData} theme={theme} />;
    case "mystery-location": return <MysteryLocation data={fullData} theme={theme} />;
    case "mystery-statistic": return <MysteryStatistic data={fullData} theme={theme} />;
    case "mystery-ending": return <MysteryEnding data={fullData} theme={theme} />;
    case "mystery-end-card": return <MysteryEndCard data={fullData} theme={theme} />;
    default: return <AbsoluteFill style={{ background: "#08090a", display: "flex", alignItems: "center", justifyContent: "center", color: "#c4a062" }}><p>Unknown: {slug}</p></AbsoluteFill>;
  }
};

const MysteryVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#08090a" }}>
      <Sequence from={${config.titleCard.startFrame}} durationInFrames={${config.titleCard.endFrame - config.titleCard.startFrame}}>
        <MysteryTitleCard data={${JSON.stringify(titleCardData)}} theme={mysteryTheme} ${titleCardImageProp} ${titleCardTreatment} />
      </Sequence>
${sceneRenders}
      <Sequence from={${config.endCard.startFrame}} durationInFrames={${config.endCard.endFrame - config.endCard.startFrame}}>
        <MysteryEndCard data={${JSON.stringify(endCardData)}} theme={mysteryTheme} ${endCardImageProp} ${endCardTreatment} />
      </Sequence>
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="MysteryVideo" component={MysteryVideo} durationInFrames={${config.totalFrames}} fps={${config.fps}} width={${config.width}} height={${config.height}} />
);

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ─── Stage 8: Render ─────────────────────────────────────────────────────────

async function runRender(
  composition: MysteryCompositionArtifact,
  outDir: string,
): Promise<MysteryRenderArtifact> {
  console.log("\n▸ Stage 8: Render (Remotion CLI)...\n");

  const videoPath = join(outDir, "mystery-video.mp4");
  const publicDir = join(outDir, "public");
  const cmd = `npx remotion render "${composition.renderEntryPath}" "${composition.compositionId}" "${videoPath}" --public-dir="${publicDir}" --log=verbose`;

  log("Render", `Running Remotion render...`);
  const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

  const { stdout: probeOut } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${videoPath}"`);
  const probe = JSON.parse(probeOut);
  const durationSec = parseFloat(probe.format.duration);
  const sizeBytes = parseInt(probe.format.size);

  log("Render", `Video: ${videoPath} (${durationSec.toFixed(1)}s, ${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);

  const artifact: MysteryRenderArtifact = { videoPath, durationSec, sizeBytes, costUsd: 0 };
  await writeArtifact("s22", "08-render.json", JSON.stringify(artifact, null, 2));
  return artifact;
}

// ─── Placeholder generators (dry-run) ────────────────────────────────────────

function generatePlaceholderJpg(width: number, height: number): Buffer {
  // Minimal 1x1 black JPEG
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x2e, 0x32, 0x29, 0x2e, 0x32, 0x2e, 0xff, 0xc9, 0x00, 0x0b, 0x08,
    0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xcc, 0x00, 0x06,
    0x00, 0x10, 0x10, 0x05, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
    0x3f, 0x00, 0x7b, 0x40, 0x1b, 0xff, 0xd9,
  ]);
}

function generateDummyWav(durationSec: number): Buffer {
  const sampleRate = 24000;
  const numSamples = Math.ceil(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

// ─── Mock data generators (dry-run) ──────────────────────────────────────────

function generateMockResearch(topic: string): MysteryResearchArtifact {
  return {
    topic,
    sources: [
      { id: "s1", title: "Wikipedia: " + topic, url: "https://en.wikipedia.org/wiki/Example", excerpt: "Historical account of the mystery." },
      { id: "s2", title: "Archival Records", url: "https://archives.gov/example", excerpt: "Official records related to the case." },
    ],
    claims: [
      { id: "c1", claim: `${topic} remains unsolved`, sourceIds: ["s1"], confidence: "high" },
      { id: "c2", claim: "Multiple theories exist but none confirmed", sourceIds: ["s1", "s2"], confidence: "high" },
    ],
    allowedFacts: [
      `${topic} is a well-documented mystery`,
      "The case has never been officially solved",
      "Multiple investigations were conducted",
      "Key evidence was found at the scene",
      "Several witnesses were interviewed",
      "The case attracted significant public attention",
    ],
    uncertainties: ["The exact sequence of events remains debated"],
    warnings: ["Avoid speculation — present only verified facts"],
    realImages: [
      { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/example.jpg", description: "The location where the mystery occurred" },
      { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/evidence.jpg", description: "Key evidence from the case" },
    ],
    costUsd: 0,
  };
}

function generateMockScript(topic: string, research: MysteryResearchArtifact): MysteryScriptArtifact {
  const title = topic.length > 50 ? topic.slice(0, 50) + "..." : topic;
  const shortTitle = title.split(" ").slice(0, 6).join(" ");
  return {
    topic,
    title: shortTitle,
    subtitle: "An Unsolved Mystery",
    narration: `${topic} is one of the most puzzling cases on record. The events unfolded without warning. Investigators arrived to find a scene that defied explanation. The evidence was contradictory. The witnesses were unreliable. And the answers never came. What makes a mystery endure? Perhaps it is the absence of closure. The questions that remain when the investigation ends. The sense that something happened here that we were never meant to understand. The files were closed. The case went cold. But the questions never stopped. And they never will.`,
    scenes: [
      {
        id: "scene1",
        componentSlug: "mystery-title-card",
        narrationSegment: "",
        title: shortTitle,
        data: { title: shortTitle, subtitle: "An Unsolved Mystery", hook: "Three men vanished. No bodies. No explanation.", caseLabel: "CASE 01" },
        needsImage: true,
        realImageUrl: research.realImages[0]?.url,
        realImageDescription: research.realImages[0]?.description,
        imageTreatment: "dark",
        narrativeRole: "opening",
      },
      {
        id: "scene2",
        componentSlug: "mystery-image-reveal",
        narrationSegment: `${topic} is one of the most puzzling cases on record. The events unfolded without warning.`,
        title: "The Scene",
        data: { caption: "The location as it appeared when investigators arrived.", caseLabel: "EVIDENCE", footer: "Scene photograph" },
        needsImage: true,
        realImageUrl: research.realImages[0]?.url,
        realImageDescription: research.realImages[0]?.description,
        imageTreatment: "dark",
        narrativeRole: "image-reveal",
      },
      {
        id: "scene3",
        componentSlug: "mystery-question",
        narrationSegment: "Investigators arrived to find a scene that defied explanation. The evidence was contradictory. The witnesses were unreliable. And the answers never came.",
        title: "The Question",
        data: { question: "How could so much evidence lead to so few answers?", context: "Every lead ended in a dead end.", caseLabel: "THE QUESTION", footer: "Investigation file" },
        needsImage: true,
        realImageUrl: research.realImages[1]?.url ?? research.realImages[0]?.url,
        realImageDescription: research.realImages[1]?.description ?? research.realImages[0]?.description,
        imageTreatment: "desaturated",
        narrativeRole: "question",
      },
      {
        id: "scene4",
        componentSlug: "mystery-timeline",
        narrationSegment: "What makes a mystery endure? Perhaps it is the absence of closure. The questions that remain when the investigation ends.",
        title: "Timeline",
        data: {
          title: "The investigation",
          events: [
            { date: "Day 1", title: "Discovery", detail: "The scene is found." },
            { date: "Day 3", title: "Investigation begins", detail: "Investigators arrive." },
            { date: "Week 2", title: "First leads", detail: "Witnesses are interviewed." },
            { date: "Month 6", title: "Case goes cold", detail: "All leads exhausted." },
          ],
          caseLabel: "TIMELINE",
        },
        needsImage: true,
        realImageUrl: research.realImages[0]?.url,
        imageTreatment: "dark",
        narrativeRole: "timeline",
      },
      {
        id: "scene5",
        componentSlug: "mystery-statistic",
        narrationSegment: "The sense that something happened here that we were never meant to understand.",
        title: "The Numbers",
        data: { value: 0, suffix: " answers", label: "Despite years of investigation", context: "The case produced no definitive explanation.", caseLabel: "DATA" },
        needsImage: true,
        realImageUrl: research.realImages[1]?.url ?? research.realImages[0]?.url,
        imageTreatment: "noir",
        narrativeRole: "statistic",
      },
      {
        id: "scene6",
        componentSlug: "mystery-ending",
        narrationSegment: "The files were closed. The case went cold. But the questions never stopped. And they never will.",
        title: "Closing",
        data: { statement: "The case was closed. The files were archived. But the questions remain open.", openQuestion: "Will we ever know what really happened?", caseLabel: "CLOSING" },
        needsImage: true,
        realImageUrl: research.realImages[0]?.url,
        imageTreatment: "dark",
        narrativeRole: "closing",
      },
      {
        id: "scene7",
        componentSlug: "mystery-end-card",
        narrationSegment: "",
        title: "",
        data: { cta: "Follow for more mysteries", channelName: "mysteryfiles", finalQuestion: "What do YOU think happened?" },
        needsImage: true,
        realImageUrl: research.realImages[0]?.url,
        imageTreatment: "dark",
        narrativeRole: "outro",
      },
    ],
    costUsd: 0,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function run(): Promise<SpikeResult> {
  await loadEnv();

  const topic = process.argv[2] ?? "The Flannan Isles Lighthouse Mystery";
  const theme = "mystery-dark";

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  S22 — Mystery Video Generation Spike");
  console.log(`  Topic: "${topic}"`);
  console.log(`  Theme: ${theme}`);
  console.log(`  Dry-run: ${isDryRun() ? "YES (no paid calls)" : "NO (real API calls)"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const outDir = await spikeDir("s22");
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const client = new GeminiClient(apiKey);

  let totalCostUsd = 0;
  const stageCosts: Record<string, number> = {};

  // Stage 1: Research
  const research = await runResearch(client, topic, outDir);
  totalCostUsd += research.costUsd;
  stageCosts.research = research.costUsd;

  // Stage 2: Script
  const script = await runScript(client, topic, research, outDir);
  totalCostUsd += script.costUsd;
  stageCosts.script = script.costUsd;

  // Stage 3: Scene Plan (estimate narration duration from script)
  const estimatedNarrationSec = Math.max(10, Math.ceil(script.narration.length / 15));
  const scenePlan = await runScenePlan(script, estimatedNarrationSec, outDir);

  // Stage 4: Image Acquisition (download real images, fallback generate)
  const images = await runImageAcquisition(script, research, apiKey, outDir);
  totalCostUsd += images.totalCostUsd;
  stageCosts.images = images.totalCostUsd;

  // Stage 5: Narration
  const narration = await runNarration(script.narration, apiKey, outDir);
  totalCostUsd += narration.costUsd;
  stageCosts.narration = narration.costUsd;

  // Re-compute scene plan with actual narration duration
  const actualScenePlan = await runScenePlan(script, narration.durationSec, outDir);

  // Stage 6: Music Sync
  const musicSync = await runMusicSync(narration.wavPath, narration.durationSec, outDir);
  totalCostUsd += musicSync.costUsd;
  stageCosts.musicSync = musicSync.costUsd;

  // Stage 7: Composition
  const composition = await runComposition(script, actualScenePlan, images, musicSync, outDir);
  totalCostUsd += composition.costUsd;
  stageCosts.composition = composition.costUsd;

  // Stage 8: Render
  let render: MysteryRenderArtifact | null = null;
  try {
    render = await runRender(composition, outDir);
    totalCostUsd += render.costUsd;
    stageCosts.render = render.costUsd;
  } catch (err) {
    console.error(`\n✗ Render failed: ${err}`);
    log("Render", "Render step failed — composition artifacts are still available");
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  SPIKE SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Topic:    "${topic}"`);
  console.log(`  Theme:    ${theme}`);
  console.log(`  Dry-run:  ${isDryRun() ? "YES" : "NO"}`);
  console.log(`  Scenes:   ${script.scenes.length}`);
  console.log(`  Images:   ${images.images.length} (${images.images.filter(i => i.source === "downloaded").length} downloaded, ${images.images.filter(i => i.source === "generated").length} generated)`);
  console.log(`  Narration: ${narration.durationSec.toFixed(1)}s`);
  console.log(`  Total frames: ${actualScenePlan.totalFrames} (${(actualScenePlan.totalFrames / FPS).toFixed(1)}s)`);
  console.log(`  Total cost: ${costSummary(totalCostUsd)}`);
  console.log(`\n  Stage costs:`);
  for (const [stage, cost] of Object.entries(stageCosts)) {
    console.log(`    ${stage}: ${costSummary(cost)}`);
  }
  if (render) {
    console.log(`\n  Video: ${render.videoPath}`);
    console.log(`  Size: ${(render.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log(`\n  Artifacts: ${outDir}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const artifactPaths = [
    join(outDir, "01-research.json"),
    join(outDir, "02-script.json"),
    join(outDir, "03-scene-plan.json"),
    join(outDir, "04-images.json"),
    join(outDir, "05-narration.json"),
    join(outDir, "06-music-sync.json"),
    join(outDir, "07-composition.json"),
    join(outDir, "08-render.json"),
    join(outDir, "composition-config.json"),
    join(outDir, "render.tsx"),
  ];
  if (render) artifactPaths.push(render.videoPath);

  return {
    id: "s22",
    name: "Mystery Video Generation",
    goal: `Generate a complete mystery documentary video from topic "${topic}" with real downloaded images`,
    result: render ? "pass" : "partial",
    measurements: {
      topic,
      theme,
      dryRun: isDryRun(),
      scenes: script.scenes.length,
      imagesDownloaded: images.images.filter(i => i.source === "downloaded").length,
      imagesGenerated: images.images.filter(i => i.source === "generated").length,
      narrationDurationSec: narration.durationSec.toFixed(1),
      totalFrames: actualScenePlan.totalFrames,
      videoDurationSec: render?.durationSec.toFixed(1) ?? "N/A",
      videoSizeMB: render ? (render.sizeBytes / 1024 / 1024).toFixed(1) : "N/A",
      totalCostUsd: totalCostUsd.toFixed(4),
      researchCostUsd: stageCosts.research?.toFixed(4) ?? "0",
      scriptCostUsd: stageCosts.script?.toFixed(4) ?? "0",
      imagesCostUsd: stageCosts.images?.toFixed(4) ?? "0",
      narrationCostUsd: stageCosts.narration?.toFixed(4) ?? "0",
    },
    notes: render
      ? `Complete mystery video generated: ${render.durationSec.toFixed(1)}s, ${(render.sizeBytes / 1024 / 1024).toFixed(1)} MB. ${images.images.filter(i => i.source === "downloaded").length} real images downloaded, ${images.images.filter(i => i.source === "generated").length} generated. Used ${script.scenes.length} mystery namespace components.`
      : `Composition artifacts generated but render failed.`,
    artifactPaths,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((result) => {
    console.log(`\nResult: ${result.result}`);
    process.exit(0);
  }).catch((err) => {
    console.error("Spike failed:", err);
    process.exit(1);
  });
}
