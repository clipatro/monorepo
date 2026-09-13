/**
 * S23 — Kids Story Video: DeepSeek + Runware Qwen-Image + Gemini TTS + Remotion kids template.
 *
 * A complete end-to-end kids storytelling video pipeline that mirrors the
 * milo-star-story approach but swaps every provider:
 *
 *   - DeepSeek V4-Flash  for ALL LLM work (story + scene plan generation)
 *   - Runware Qwen-Image (runware:108@1) for image generation — pure
 *     text-to-image with a detailed, locked-in character description repeated
 *     verbatim in every scene prompt + a fixed seed for consistency
 *   - Google Gemini TTS (Algenib voice) for the voiceover narration
 *   - @automation/remotion-templates KIDS namespace components rendered via
 *     the Remotion CLI to produce the final MP4
 *
 * INTELLIGENT TEXT-SAFE IMAGE COMPOSITION:
 *   Before any image is generated, the pipeline selects the Remotion kids
 *   component that will render each scene, reads that component's
 *   text-placement/safe-area config (from the kids capabilities registry),
 *   and converts it into explicit image-generation instructions. The image
 *   model is told exactly which region of the frame is reserved for the
 *   caption/text overlay and where to place Milo and other characters/objects
 *   instead, so the caption never overlaps a character or important visual
 *   element. This happens automatically for every scene.
 *
 * Every paid call is cost-tracked. A per-step + total cost breakdown is
 * printed at the end.
 *
 * Pipeline (artifacts persisted to spikes/output/s23-kids-runware-deep/):
 *   1. Story plan      — DeepSeek generates the story + scene plan JSON
 *   1.5 Component sel. — select the Remotion kids component for each scene
 *                        + read its text-placement/safe-area config
 *   2 & 3. Scene imgs  — Runware Qwen-Image generates each scene image WITH
 *                        text-safe composition instructions (characters kept
 *                        out of the reserved text region)
 *   4. Narration       — Gemini TTS (Algenib) per-scene + concatenated WAV
 *   5. Music mix       — narration + background_kids.mp3 (ducked) via FFmpeg
 *   6. Composition     — generate render.tsx using the kids Remotion template
 *   7. Render          — Remotion CLI renders the final MP4
 *
 * Usage:
 *   bun run spikes/s23-kids-runware-deepseek.ts
 *   bun run spikes/s23-kids-runware-deepseek.ts --skip-story
 *   bun run spikes/s23-kids-runware-deepseek.ts --skip-story --skip-images
 *   bun run spikes/s23-kids-runware-deepseek.ts --skip-render
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
	loadEnv,
	spikeDir,
	writeArtifact,
	type SpikeResult,
} from "./lib/spike.ts";
import { DeepSeekClient, extractJson } from "@automation/deepseek-client";
import {
	getKidsComponentCapability,
	textPlacementToImageInstructions,
	textPlacementToNegativeHint,
	type KidsTextPlacement,
} from "@automation/remotion-templates";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, ".."); // spikes/ → clipatro/
// Kids videos use a dedicated warm, playful background music/ambient layer.
// It is mixed under the narration at a low, ducked level so it never
// overpowers the dialogue/voiceover.
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background_kids.mp3");

// === Provider constants ===

const SPIKE_ID = "s23-kids-runware-deep";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

const RUNWARE_API_URL = "https://api.runware.ai/v1";
const RUNWARE_MODEL = "runware:108@1"; // Qwen-Image (Alibaba)
const IMAGE_WIDTH = 1024; // portrait orientation (multiples of 16 for Qwen)
const IMAGE_HEIGHT = 1536; // 2:3 vertical
// Qwen-Image pricing: ~$0.0058/image at 1024x1536 (per API cost field)
// All scenes are generated as pure text-to-image — no reference/seed image.
// Character consistency is achieved via a detailed, locked-in character
// description repeated verbatim in every scene prompt + a fixed seed.

const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Gemini TTS pricing: $1/1M input tokens, $20/1M output tokens

const FPS = 30;
const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;

// === Runware API response type ===

interface RunwareResponse {
	data?: Array<{ imageURL: string; cost?: number; imageBase64Data?: string }>;
	errors?: Array<{ code: string; message: string }>;
}

// === Cost tracking ===

interface CostEntry {
	step: string;
	provider: string;
	model: string;
	calls: number;
	costUsd: number;
	detail: string;
}

const costLedger: CostEntry[] = [];

function addCost(entry: CostEntry): void {
	const existing = costLedger.find((e) => e.step === entry.step);
	if (existing) {
		existing.calls += entry.calls;
		existing.costUsd += entry.costUsd;
		existing.detail = `${existing.calls} calls, $${existing.costUsd.toFixed(6)}`;
	} else {
		costLedger.push({
			...entry,
			detail: `${entry.calls} calls, $${entry.costUsd.toFixed(6)}`,
		});
	}
}

function totalCost(): number {
	return costLedger.reduce((sum, e) => sum + e.costUsd, 0);
}

// === Types ===

interface StoryScene {
	sceneId: string;
	narration: string;
	imagePrompt: string;
	emotion: string;
	durationSec: number;
	/**
	 * Where the subtitle/caption should be placed for this scene.
	 * DeepSeek intelligently chooses this per scene based on the scene's
	 * visual composition — where the character and important visual elements
	 * are best positioned. The image generator is then instructed to keep
	 * characters OUT of the reserved subtitle region.
	 * - "top": subtitle at top, characters in lower 70% of frame
	 * - "bottom": subtitle at bottom, characters in upper 72% of frame
	 */
	subtitlePosition: "top" | "bottom";
}

interface StoryPlan {
	title: string;
	totalDurationSec: number;
	artStyle: string;
	characterDesign: Record<string, string>;
	scenes: StoryScene[];
}

interface SceneImageResult {
	sceneId: string;
	imagePath: string;
	costUsd: number;
	latencyMs: number;
	usedReference: boolean;
}

interface NarrationSegment {
	sceneId: string;
	text: string;
	wavPath: string;
	durationSec: number;
	costUsd: number;
}

// === Helpers ===

function log(stage: string, msg: string): void {
	console.log(`  [${stage}] ${msg}`);
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function probeDuration(path: string): Promise<number> {
	const { stdout } = await execAsync(
		`ffprobe -v quiet -print_format json -show_format "${path}"`,
	);
	const probe = JSON.parse(stdout) as { format?: { duration?: string } };
	return parseFloat(probe.format?.duration ?? "0");
}

// === Stage 1: Story plan generation (DeepSeek) ===

const STORY_SYSTEM_INSTRUCTION = `You are a master children's storyteller and animation director.
You create warm, engaging, cinematic stories for children ages 4-8.
Your stories have clear beginnings, adventures, emotional moments, and satisfying endings.
You think in visual scenes — each scene has a clear image, action, and emotion.
You write narration that sounds natural when spoken aloud by a warm storyteller.
Return only the requested JSON.`;

const STORY_PROMPT = `Create a complete story plan for a 40-50 second children's animated video.

TITLE: "Milo and the Little Star That Fell from the Sky"

STORY: Milo is a curious young boy who discovers a tiny fallen star in the forest.
The star has lost its glow, so Milo takes it on a small adventure to reach the
highest hill and help it find its way back to the sky. Along the way, they meet
friendly forest animals and learn about friendship, courage, and helping others.

REQUIREMENTS:
- 7-8 scenes, each 4-7 seconds long
- Clear narrative arc: beginning → adventure/problem → emotional moment → satisfying ending
- Warm, gentle, cinematic tone — like a bedtime story come to life
- Each scene must have: narration text (1-2 sentences), image description, emotion/mood, subtitlePosition
- Narration should be spoken-aloud friendly, ~15-25 words per scene
- The story should feel complete and emotionally satisfying
- Include a final "subscribe" end card scene with no narration

NO TEXT IN IMAGES (CRITICAL — APPLIES TO ALL SCENES):
- Every imagePrompt must describe ONLY visual elements: characters, objects,
  environment, lighting, mood, and composition.
- NEVER include any text, captions, titles, labels, logos, signs, words,
  letters, numbers, or written content in the imagePrompt.
- Do NOT write things like "text saying 'Subscribe'" or "the words 'The End'"
  or "a sign reading..." in the imagePrompt.
- All subtitles, captions, titles, and text overlays are rendered SEPARATELY
  by the video system after the image is generated.
- For the end card scene, describe only the visual background (e.g. "a warm
  starry night sky with a glowing star") — do NOT mention any text, subscribe
  buttons, or channel names in the imagePrompt.

SUBTITLE POSITION INTELLIGENCE (CRITICAL):
For EACH scene, you must decide whether the subtitle/caption should appear at
the TOP or BOTTOM of the frame. This decision must be based on the scene's
visual composition:
- Choose "top" when the scene's image naturally has the character/subject in
  the LOWER portion of the frame (e.g. looking up at the sky, standing in a
  valley, underground, reaching upward). The subtitle goes at top, character
  stays low.
- Choose "bottom" when the scene's image naturally has the character/subject
  in the UPPER portion of the frame (e.g. standing tall, looking down from a
  hill, aerial view, tall trees). The subtitle goes at bottom, character
  stays high.
- The goal: the subtitle must NEVER overlap the character's face, body, or
  important visual elements. Choose the position that keeps the subtitle
  away from where the character/subject will be.
- Vary the positions across scenes for visual variety — don't use the same
  position for every scene unless the story demands it.
- The first scene (title card) and last scene (end card) should use "bottom"
  since they have special layouts.

VISUAL CONSISTENCY:
- Milo: a young boy (age 6-7) with curly brown hair, wearing a blue jacket and yellow boots
- The star: a small, glowing, round star character with a friendly face, dimmed/fading
- Forest: warm autumn forest with golden light, friendly atmosphere
- Animals: a rabbit, an owl, and a deer — all cute and friendly
- Art style: soft, warm, storybook illustration style with gentle lighting

Return JSON with this exact structure:
{
  "title": "string",
  "totalDurationSec": number (40-50),
  "artStyle": "detailed description of the consistent art style for all scenes",
  "characterDesign": {
    "milo": "detailed visual description for consistency",
    "star": "detailed visual description for consistency",
    "rabbit": "detailed visual description",
    "owl": "detailed visual description",
    "deer": "detailed visual description"
  },
  "scenes": [
    {
      "sceneId": "string (e.g. 'scene-1')",
      "narration": "string (the spoken narration for this scene)",
      "imagePrompt": "string (detailed prompt for AI image generation, including character descriptions, environment, mood, lighting, art style — must maintain visual consistency. IMPORTANT: describe WHERE in the frame the character/subject should be positioned, consistent with the chosen subtitlePosition. CRITICAL: The imagePrompt must describe ONLY visual elements — characters, objects, environment, lighting, and composition. NEVER mention text, captions, titles, labels, logos, signs, words, letters, numbers, or any written content in the imagePrompt. All text/captions are rendered separately as overlays by the video system. Do NOT say things like 'text saying...' or 'the words...' or 'a sign reading...' — describe only the visual scene.)",
      "emotion": "string (the emotional tone of this scene)",
      "durationSec": number (4-7),
      "subtitlePosition": "string ('top' or 'bottom' — where the subtitle should appear, chosen so it never overlaps the character)"
    }
  ]
}`;

async function generateStoryPlan(
	client: DeepSeekClient,
	outDir: string,
	skipExisting: boolean,
): Promise<{ plan: StoryPlan; costUsd: number }> {
	const storyPath = join(outDir, "01-story-plan.json");

	if (skipExisting && (await exists(storyPath))) {
		log("Story", "Reusing existing story plan");
		const raw = await readFile(storyPath, "utf-8");
		return { plan: JSON.parse(raw) as StoryPlan, costUsd: 0 };
	}

	log("Story", `Calling DeepSeek ${DEEPSEEK_MODEL} for story plan...`);
	const result = await client.call({
		prompt: STORY_PROMPT,
		systemInstruction: STORY_SYSTEM_INSTRUCTION,
		model: DEEPSEEK_MODEL,
		temperature: 0.8,
		maxOutputTokens: 4096,
		responseJson: true,
		capability: "story.generate",
		stepId: "s23-kids-story-plan",
	});

	const plan = extractJson(result.text) as StoryPlan;
	if (!plan || !plan.scenes || plan.scenes.length === 0) {
		throw new Error("DeepSeek did not return a valid story plan");
	}

	await writeFile(storyPath, JSON.stringify(plan, null, 2));
	const costUsd = result.cost.totalCost;
	addCost({
		step: "1. Story plan (DeepSeek)",
		provider: "deepseek",
		model: DEEPSEEK_MODEL,
		calls: 1,
		costUsd,
		detail: `${result.usage.promptTokens} in / ${result.usage.outputTokens} out tokens`,
	});
	log(
		"Story",
		`OK — ${plan.scenes.length} scenes, "${plan.title}", $${costUsd.toFixed(6)}`,
	);
	return { plan, costUsd };
}

// === Stage 2 & 3: Image generation (Runware Qwen-Image) ===

const ART_STYLE_PREFIX = `HIGH-QUALITY 3D ANIMATED MOVIE STYLE — like a modern Pixar/Disney animated film. Warm, cinematic children's animation with soft volumetric lighting, rich textures, cozy autumn atmosphere. Warm golden palette (oranges, ambers, soft browns). Sharp focus, high detail, professional quality.

MILO (same boy in every image): young boy aged 6-7, curly brown hair, big expressive brown eyes, blue jacket, yellow boots, kind curious face with rosy cheeks. Keep his face, hair, skin tone, clothing, and proportions EXACTLY consistent across every scene.

ART STYLE: 3D animated movie style, warm golden cinematic lighting, rich textures, sharp focus. Vertical portrait composition.

ABSOLUTELY NO TEXT: 100% text-free image. No words, letters, numbers, labels, captions, titles, subtitles, speech bubbles, signs, logos, watermarks, or written characters. Only pure visual artwork — characters, objects, environment. All text is added separately as overlays.`;

const NEGATIVE_PROMPT =
	"text, words, letters, numbers, labels, captions, titles, subtitles, speech bubbles, signs, logos, watermarks, studio name, brand name, written characters, typography, font, handwriting, printed text, any text at all, blurry, low quality, deformed, extra limbs, bad anatomy, scary, dark, horror, flat lighting, washed out, cartoon, anime, 2d illustration, rough sketch, noisy, grainy, distorted face, mismatched eyes, extra fingers, malformed hands";

// Fixed seed for all generations — combined with the identical character
// description in every prompt, this gives maximum character consistency.
const FIXED_SEED = 42;

// === Text-stripping safeguard (reusable, story-agnostic) ====================
//
// Even with explicit instructions, LLMs sometimes include text descriptions
// in image prompts (e.g. "text saying 'Subscribe'" or "the words 'The End'").
// This function strips any text-related descriptions from the imagePrompt
// BEFORE it is sent to Qwen-Image, ensuring the image model never receives
// instructions to generate text.
//
// It removes:
// 1. Phrases like "text saying '...'", "the words '...'", "a sign reading '...'"
// 2. Quoted text that appears to be content for the image (e.g. 'Subscribe for more!')
// 3. References to "text", "caption", "title", "label", "logo", "watermark"
//    when they describe something to be drawn in the image
//
// This is a REUSABLE safeguard that works for ANY story, not just Milo.

/**
 * Strip text-related descriptions from an image prompt so the image model
 * never receives instructions to generate text inside the artwork.
 * Returns a cleaned prompt that describes only visual elements.
 */
function stripTextFromPrompt(prompt: string): string {
	let cleaned = prompt;

	// ── Phase 1: Remove full text-description phrases ──
	// These patterns catch the most common ways LLMs describe text to be
	// generated inside an image. We remove the entire phrase including
	// the quoted content and any font/style descriptions attached to it.
	const textPhrasePatterns = [
		// "the text '...' is written in a ... font" (full phrase, most common)
		/the\s+text\s+['"][^'"]*['"]\s+is\s+written\s+in\s+a\s+[\w\s,]*font/gi,
		// "the text '...' is written"
		/the\s+text\s+['"][^'"]*['"]\s+is\s+written/gi,
		// "text saying '...'" or "text saying \"...\""
		/text\s+saying\s+['"][^'"]*['"]/gi,
		// "the words '...'" or "the words \"...\""
		/the\s+words\s+['"][^'"]*['"]/gi,
		// "a sign reading '...'" or "sign reading \"...\""
		/(?:a\s+)?sign\s+reading\s+['"][^'"]*['"]/gi,
		// "text '...'" or "text \"...\""
		/text\s+['"][^'"]*['"]/gi,
		// "caption '...'" or "caption \"...\""
		/caption\s+['"][^'"]*['"]/gi,
		// "title '...'" or "title \"...\""
		/title\s+['"][^'"]*['"]/gi,
		// "label '...'" or "label \"...\""
		/label\s+['"][^'"]*['"]/gi,
		// "writing '...'" or "writing \"...\""
		/writing\s+['"][^'"]*['"]/gi,
		// "written in a ... font" or "written in ... font" (standalone)
		/written\s+in\s+a\s+[\w\s,]*font/gi,
		/written\s+in\s+[\w\s,]*font/gi,
		// "in a playful, rounded font" (standalone font descriptions)
		/in\s+a\s+[\w\s,]*font/gi,
		// "is written" (orphaned remnant after text removal)
		/is\s+written/gi,
	];

	for (const pattern of textPhrasePatterns) {
		cleaned = cleaned.replace(pattern, "");
	}

	// ── Phase 2: Remove subscribe/channel-name/subtitle references ──
	// These are common in end-card prompts and should not appear as image content.
	// Also remove "subtitle at top/bottom" phrases — mentioning "subtitle" in
	// the image prompt can cause Qwen-Image to generate subtitle text in the image.
	cleaned = cleaned.replace(/\bsubscribe\s+for\s+more\b[^.]*\./gi, "");
	cleaned = cleaned.replace(/\bsubscribe\s+button\b/gi, "decorative button shape");
	cleaned = cleaned.replace(/\bchannel\s+name\b/gi, "decorative text-free area");
	cleaned = cleaned.replace(/,\s*so\s+subtitle\s+at\s+(?:top|bottom)\b/gi, "");
	cleaned = cleaned.replace(/\bsubtitle\s+at\s+(?:top|bottom)\b/gi, "");
	cleaned = cleaned.replace(/\bsubtitle\s+(?:at\s+)?(?:top|bottom)\b/gi, "");

	// ── Phase 3: Clean up remnants and awkward phrasing ──
	// Remove orphaned "the" that was left before a removed text phrase
	cleaned = cleaned.replace(/\bthe\s+is\s+/gi, "");
	// Remove "Below the star," if it's now followed by nothing meaningful
	cleaned = cleaned.replace(/,\s*below\s+the\s+star\s*,\s*/gi, ". ");
	cleaned = cleaned.replace(/\bbelow\s+the\s+star\s*,\s*$/gi, "");

	// General cleanup: double spaces, orphaned commas, trailing connectors
	cleaned = cleaned
		.replace(/\s+/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/,\s*,/g, ",")
		.replace(/,\s*\./g, ".")
		.replace(/\s+\./g, ".")
		.replace(/\.\s*\./g, ".")
		.trim();
	// Fix sentences that might start with a connector after removal
	cleaned = cleaned.replace(/^\s*and\s+/i, "").replace(/^\s*but\s+/i, "");
	// Fix orphaned commas at the start
	cleaned = cleaned.replace(/^\s*,\s*/g, "");

	return cleaned;
}

// === Component selection (runs BEFORE image generation) =====================
//
// The intelligent image-generation pipeline requires knowing which Remotion
// component will render each scene BEFORE the image is generated, so it can
// read that component's text-placement/safe-area config and instruct the
// image model to keep characters and important objects away from the
// reserved text region.
//
// selectComponentForScene mirrors the logic in mapScenesToKidsComponents but
// runs on the story plan alone (no narration timing needed) so it can be
// used in the image-generation stage.

interface ComponentSelection {
	componentSlug: string;
	data: Record<string, unknown>;
}

function selectComponentForScene(
	scene: StoryScene,
	index: number,
	lastIndex: number,
	plan: StoryPlan,
): ComponentSelection {
	const isFirst = index === 0;
	const isLast = index === lastIndex;

	if (isFirst) {
		return {
			componentSlug: "kids-title-card",
			// Title card shows ONLY the title — narration plays as audio.
			data: {
				title:
					plan.title.length > 60 ? plan.title.slice(0, 57) + "…" : plan.title,
				subtitle: "",
				hook: "",
				label: "FUN STORY!",
			},
		};
	}
	if (isLast) {
		return {
			componentSlug: "kids-end-card",
			data: {
				cta: "Subscribe for more!",
				channelName: "kidstorytime",
				finalQuestion: "What's your favorite story?",
			},
		};
	}
	if (index === lastIndex - 1) {
		return {
			componentSlug: "kids-ending",
			data: {
				message: scene.narration.slice(0, 200),
				encouragement: "What do YOU think?",
				label: "REMEMBER!",
			},
		};
	}
	// ── Intelligent subtitle-safe component selection ──
	// DeepSeek has chosen the subtitlePosition for this scene based on the
	// scene's visual composition. We select the matching subtitle-safe
	// component so the image generator knows exactly where to keep
	// characters/objects away from the reserved subtitle region.
	const subtitlePos = scene.subtitlePosition ?? "bottom";
	if (subtitlePos === "top") {
		return {
			componentSlug: "kids-subtitle-top-scene",
			data: {
				caption: scene.narration.slice(0, 200),
				label: scene.emotion.slice(0, 30),
			},
		};
	}
	return {
		componentSlug: "kids-subtitle-bottom-scene",
		data: {
			caption: scene.narration.slice(0, 200),
			label: scene.emotion.slice(0, 30),
		},
	};
}

// === Subtitle-position conflict safeguard ==================================
//
// A REUSABLE, story-agnostic safeguard that runs AFTER the story plan is
// generated but BEFORE component selection and image generation. For each
// scene, it analyzes the imagePrompt for character/subject position cues and
// checks them against the LLM-chosen subtitlePosition. If the character is
// described as being in the SAME region as the reserved subtitle area, the
// safeguard flips the subtitlePosition to the opposite side so the image
// generator and component layout work together to keep characters away from
// the subtitle.
//
// This prevents the recurring bug where subtitles overlap characters because
// the LLM chose a subtitle position that conflicts with where it also
// described the character as being.
//
// The detection is keyword-based and works for ANY story (not just Milo):
// it looks for position cues like "upper", "lower", "top", "bottom",
// "stretched upward", "looking up", "standing tall", "aerial", etc.

/**
 * STRONG cues that indicate the MAIN CHARACTER/SUBJECT's body or action is
 * in the UPPER portion of the frame. These are body-part + direction
 * combinations or direct action descriptions that mean the main subject
 * occupies the upper region. These reliably cause subtitle overlap when
 * the subtitle is at the top.
 */
const STRONG_UPPER_CUES = [
	"arms stretched upward",
	"arms stretched up",
	"arms raised",
	"reaching up",
	"reaching upward",
	"lifted high",
	"held high",
	"held up",
	"held above",
	"stretched upward",
	"stretched up",
	"looking up",
	"up into the sky",
	"floating up",
	"rising into",
	"rising up",
	"climbing up",
	"ascending",
	"standing tall",
	"towering over",
	"from above",
	"aerial view",
	"overhead",
];

/**
 * STRONG cues that indicate the MAIN CHARACTER/SUBJECT's body or action is
 * in the LOWER portion of the frame. These reliably cause subtitle overlap
 * when the subtitle is at the bottom.
 *
 * NOTE: "viewed from below" and "from below" are NOT included here — they
 * describe a camera angle (looking up at the subject), which typically
 * places the subject in the UPPER portion of the frame, not the lower.
 */
const STRONG_LOWER_CUES = [
	"kneeling",
	"kneeling down",
	"lying down",
	"on the ground",
	"crouching",
	"sitting down",
	"looking up at",
	"underground",
	"in the valley",
	"down low",
	"at the bottom",
	"bottom of the frame",
];

/**
 * Detect whether the image prompt describes the MAIN character/subject's
 * body or action in the UPPER or LOWER region of the frame. Only STRONG
 * cues (body-part + direction or direct action descriptions) are counted —
 * generic position words like "upper" or "lower" that might describe
 * secondary elements (e.g. "an owl sits in the upper half") are NOT counted
 * to avoid false positives.
 *
 * Returns which regions have STRONG cues indicating the main subject is there.
 */
function detectOccupiedRegions(imagePrompt: string): { upper: boolean; lower: boolean } {
	const prompt = imagePrompt.toLowerCase();
	let upperScore = 0;
	let lowerScore = 0;
	for (const cue of STRONG_UPPER_CUES) {
		if (prompt.includes(cue)) upperScore++;
	}
	for (const cue of STRONG_LOWER_CUES) {
		if (prompt.includes(cue)) lowerScore++;
	}
	return { upper: upperScore > 0, lower: lowerScore > 0 };
}

/**
 * The subtitle-safe zones (must match the textPlacement configs in capabilities.ts).
 * - "top" subtitle reserves the UPPER ~30% of the frame → characters must be LOWER
 * - "bottom" subtitle reserves the LOWER ~72-90% of the frame → characters must be UPPER
 */
type SubtitleZone = "top" | "bottom";

/**
 * Check whether the occupied regions conflict with the subtitle zone.
 * A conflict exists when ANY important visual element is described in the
 * SAME region as the reserved subtitle area.
 *
 * Conservative by design: even a single upper cue (e.g. "arms stretched
 * upward") with a top subtitle is a conflict, because that element will
 * overlap the subtitle.
 */
function hasSubtitleConflict(
	occupied: { upper: boolean; lower: boolean },
	subtitleZone: SubtitleZone,
): boolean {
	if (subtitleZone === "top" && occupied.upper) return true;
	if (subtitleZone === "bottom" && occupied.lower) return true;
	return false;
}

/**
 * REUSABLE SAFEGUARD: Validate and correct each scene's subtitlePosition
 * against the character/object positions described in its imagePrompt. If a
 * conflict is detected (ANY important element described in the same region
 * as the reserved subtitle area), flip the subtitlePosition to the opposite
 * side.
 *
 * Special scenes (first = title card, last = end card, second-to-last =
 * ending) are SKIPPED because they use fixed-layout components with their
 * own text-placement configs that don't depend on subtitlePosition.
 *
 * This mutates the plan in-place AND returns a list of corrections for logging.
 * Works for ANY story — the detection is based on generic position cues, not
 * story-specific content.
 */
function validateSubtitlePositions(plan: StoryPlan): Array<{
	sceneId: string;
	original: SubtitleZone;
	corrected: SubtitleZone;
	reason: string;
}> {
	const corrections: Array<{
		sceneId: string;
		original: SubtitleZone;
		corrected: SubtitleZone;
		reason: string;
	}> = [];

	const lastIndex = plan.scenes.length - 1;
	for (let i = 0; i < plan.scenes.length; i++) {
		const scene = plan.scenes[i]!;
		// Skip special-layout scenes: title card (first), end card (last),
		// and ending (second-to-last). These use fixed components whose
		// text placement doesn't depend on subtitlePosition.
		if (i === 0 || i === lastIndex || i === lastIndex - 1) continue;

		const chosen = scene.subtitlePosition ?? "bottom";
		const occupied = detectOccupiedRegions(scene.imagePrompt);

		if (hasSubtitleConflict(occupied, chosen)) {
			const flipped: SubtitleZone = chosen === "top" ? "bottom" : "top";
			const regionCues = [
				occupied.upper ? "upper" : null,
				occupied.lower ? "lower" : null,
			].filter(Boolean).join("+");
			corrections.push({
				sceneId: scene.sceneId,
				original: chosen,
				corrected: flipped,
				reason: `Important visual elements detected in ${regionCues} region(s), subtitle was at ${chosen} — flipped to ${flipped} to avoid overlap`,
			});
			scene.subtitlePosition = flipped;
		}
	}

	return corrections;
}

/**
 * Build a sceneId → componentSlug map for the whole story. Used by the
 * image-generation stage to look up each scene's text-placement config.
 */
function selectComponentsForPlan(plan: StoryPlan): Map<string, ComponentSelection> {
	const lastIndex = plan.scenes.length - 1;
	const map = new Map<string, ComponentSelection>();
	for (let i = 0; i < plan.scenes.length; i++) {
		const scene = plan.scenes[i]!;
		map.set(scene.sceneId, selectComponentForScene(scene, i, lastIndex, plan));
	}
	return map;
}

/**
 * Look up the text-placement config for a component slug from the kids
 * capabilities registry. Falls back to a bottom-anchored placement if the
 * slug is unknown (defensive — should never happen for registered components).
 */
function getTextPlacementForSlug(slug: string): KidsTextPlacement {
	const cap = getKidsComponentCapability(slug);
	if (cap) return cap.textPlacement;
	return {
		zone: "bottom",
		description: "Text appears in the bottom portion of the frame.",
		verticalExtent: { from: 0.55, to: 0.83 },
		horizontalExtent: { from: 0.1, to: 0.9 },
	};
}

async function runwareGenerate(
	apiKey: string,
	positivePrompt: string,
	destPath: string,
	negativePromptOverride?: string,
): Promise<{ costUsd: number; latencyMs: number }> {
	const taskUUID = randomUUID();
	const task: Record<string, unknown> = {
		taskType: "imageInference",
		taskUUID,
		model: RUNWARE_MODEL,
		positivePrompt,
		negativePrompt: negativePromptOverride ?? NEGATIVE_PROMPT,
		width: IMAGE_WIDTH,
		height: IMAGE_HEIGHT,
		numberResults: 1,
		outputFormat: "JPEG",
		outputQuality: 95,
		steps: 28, // Qwen-Image: 28 steps for high quality
		CFGScale: 6, // Qwen-Image recommended CFGScale
		seed: FIXED_SEED, // fixed seed for consistency
		includeCost: true, // required by Runware API to return the cost field
	};

	const t0 = performance.now();
	const res = await fetch(RUNWARE_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify([task]),
	});

	const raw: RunwareResponse = await res.json();
	const latencyMs = Math.round(performance.now() - t0);

	if (!res.ok || raw.errors?.length) {
		const errMsg = raw.errors?.[0]?.message ?? `HTTP ${res.status}`;
		const errCode = raw.errors?.[0]?.code ?? "unknown";
		throw new Error(
			`Runware API error: ${errMsg} (code: ${errCode}, http: ${res.status})`,
		);
	}

	const result = raw.data?.[0];
	if (!result?.imageURL) {
		throw new Error("Runware returned no image URL");
	}

	// Download the generated image
	const imgRes = await fetch(result.imageURL);
	if (!imgRes.ok) {
		throw new Error(`Failed to download image: HTTP ${imgRes.status}`);
	}
	const imgBuf = Buffer.from(await imgRes.arrayBuffer());
	await writeFile(destPath, imgBuf);

	// Use ONLY the actual cost reported by the Runware API — never invent or
	// estimate. If the API omits the cost field, surface it explicitly rather
	// than substituting a placeholder number.
	if (result.cost === undefined || result.cost === null) {
		throw new Error(
			`Runware API did not return a cost field for task ${taskUUID}. Refusing to estimate — check the API response shape.`,
		);
	}
	const costUsd = result.cost;
	return { costUsd, latencyMs };
}

async function fileToDataUri(path: string): Promise<string> {
	const buf = await readFile(path);
	const ext = path.endsWith(".png") ? "png" : "jpeg";
	return `data:image/${ext};base64,${buf.toString("base64")}`;
}

async function generateAllImages(
	plan: StoryPlan,
	outDir: string,
	apiKey: string,
	skipExisting: boolean,
	componentSelection: Map<string, ComponentSelection>,
): Promise<{
	images: SceneImageResult[];
	totalCostUsd: number;
	refImagePath: string;
}> {
	const imagesDir = join(outDir, "images");
	await mkdir(imagesDir, { recursive: true });

	const images: SceneImageResult[] = [];
	let totalCostUsd = 0;

	// When reusing existing images, load the previous cost data so the cost
	// breakdown and artifacts reflect the actual API costs that were paid,
	// rather than zeroing them out.
	let prevCosts: {
		refImageCostUsd?: number;
		images?: Array<{ sceneId: string; costUsd: number; latencyMs: number }>;
	} | null = null;
	if (skipExisting) {
		const prevArtifactPath = join(outDir, "02-images.json");
		if (await exists(prevArtifactPath)) {
			try {
				prevCosts = JSON.parse(await readFile(prevArtifactPath, "utf-8"));
			} catch {
				// ignore — treat as no previous costs
			}
		}
	}

	// ─── Stage 2 & 3: Generate each scene image (text-to-image) ────────────
	// All scenes are generated as pure text-to-image with the identical MILO
	// description from ART_STYLE_PREFIX + a fixed seed for consistency.
	// No reference/seed image is used.
	//
	// INTELLIGENT TEXT-SAFE COMPOSITION: For each scene, the Remotion
	// component that will render it is already known (componentSelection).
	// We read that component's text-placement/safe-area config and convert it
	// into explicit image-generation instructions so the image model places
	// Milo and other characters/objects AWAY from the reserved text region.
	// This guarantees the caption never overlaps a character or important
	// visual element.
	const refImagePath = "";

	addCost({
		step: "2. Reference image (Runware)",
		provider: "runware",
		model: RUNWARE_MODEL,
		calls: 0,
		costUsd: 0,
		detail: "No reference image — pure text-to-image generation",
	});

	for (const scene of plan.scenes) {
		const sceneImagePath = join(imagesDir, `${scene.sceneId}.jpg`);

		if (skipExisting && (await exists(sceneImagePath))) {
			log("Image", `  ${scene.sceneId}: reusing existing image`);
			const prev = prevCosts?.images?.find(
				(p) => p.sceneId === scene.sceneId,
			);
			const prevCost = prev?.costUsd ?? 0;
			const prevLat = prev?.latencyMs ?? 0;
			totalCostUsd += prevCost;
			if (prevCost > 0) {
				addCost({
					step: "3. Scene images (Runware)",
					provider: "runware",
					model: RUNWARE_MODEL,
					calls: 1,
					costUsd: prevCost,
					detail: `${scene.sceneId} (reused, actual cost from prior run)`,
				});
			}
			images.push({
				sceneId: scene.sceneId,
				imagePath: sceneImagePath,
				costUsd: prevCost,
				latencyMs: prevLat,
				usedReference: false,
			});
			continue;
		}

		// ── Intelligent text-safe composition ──
		// Look up the component that will render this scene, read its
		// text-placement config, and convert it into image-gen instructions.
		const selection = componentSelection.get(scene.sceneId);
		const componentSlug = selection?.componentSlug ?? "kids-subtitle-bottom-scene";
		const textPlacement = getTextPlacementForSlug(componentSlug);
		const textSafeInstructions = textPlacementToImageInstructions(textPlacement);
		const textSafeNegative = textPlacementToNegativeHint(textPlacement);

		// ── Text-stripping safeguard ──
		// Strip any text-related descriptions from the imagePrompt before
		// sending it to Qwen-Image. This ensures the image model never
		// receives instructions to generate text inside the artwork, even
		// if the LLM included text descriptions despite the no-text rules.
		const cleanedImagePrompt = stripTextFromPrompt(scene.imagePrompt);
		if (cleanedImagePrompt !== scene.imagePrompt) {
			log("Safeguard", `  ${scene.sceneId}: stripped text descriptions from imagePrompt`);
		}

		const fullPrompt = `${ART_STYLE_PREFIX}

SCENE: ${cleanedImagePrompt}

EMOTION: ${scene.emotion}

${textSafeInstructions}

Vertical portrait composition. Absolutely no text in image.`;

		// Append the text-safe negative hint to the base negative prompt so
		// the model avoids placing subjects in the reserved text region.
		const sceneNegativePrompt = `${NEGATIVE_PROMPT}, ${textSafeNegative}`;

		log(
			"Image",
			`  ${scene.sceneId}: generating (component=${componentSlug}, text-zone=${textPlacement.zone}, fixed seed ${FIXED_SEED})...`,
		);
		try {
			const result = await runwareGenerate(
				apiKey,
				fullPrompt,
				sceneImagePath,
				sceneNegativePrompt,
			);
			totalCostUsd += result.costUsd;
			addCost({
				step: "3. Scene images (Runware)",
				provider: "runware",
				model: RUNWARE_MODEL,
				calls: 1,
				costUsd: result.costUsd,
				detail: `${scene.sceneId}, ${result.latencyMs}ms`,
			});
			log(
				"Image",
				`    OK — ${result.latencyMs}ms, $${result.costUsd.toFixed(6)}`,
			);
			images.push({
				sceneId: scene.sceneId,
				imagePath: sceneImagePath,
				costUsd: result.costUsd,
				latencyMs: result.latencyMs,
				usedReference: false,
			});
		} catch (err) {
			log("Image", `    FAILED: ${err}`);
			images.push({
				sceneId: scene.sceneId,
				imagePath: "",
				costUsd: 0,
				latencyMs: 0,
				usedReference: false,
			});
		}
	}

	return { images, totalCostUsd, refImagePath };
}

// === Stage 4: Narration (Gemini TTS — Algenib) ===

/**
 * Generate a single TTS segment via Gemini TTS.
 * Returns the WAV path and cost.
 *
 * Gemini TTS returns raw L16 PCM (24000 Hz, mono, s16le). We wrap it into WAV
 * via FFmpeg. Cost: $1/1M input tokens, $20/1M output tokens.
 * Approximate: 1 token ≈ 4 chars. Audio output tokens ≈ duration * 1000/6.
 */
async function geminiTts(
	text: string,
	destWavPath: string,
	apiKey: string,
): Promise<{
	durationSec: number;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
}> {
	// Expressive storytelling instruction — tells Gemini TTS to deliver the
	// narration as an engaging, animated storyteller rather than flat TTS.
	// This adds natural tone changes, emphasis, emotion, pauses, and varied
	// delivery that feels like a warm, excited storyteller reading to children.
	const storytellingInstruction = `You are a warm, expressive children's storyteller. Read the following narration with natural emotion, enthusiasm, and engaging delivery. Vary your tone to match the mood of each moment — be excited during adventures, gentle during emotional moments, curious during questions, and triumphant during victories. Add natural pauses for dramatic effect, emphasize important words, and let your voice convey wonder and warmth. Speak at a child-friendly pace — not too fast, not too slow. Make it feel like you're reading a beloved bedtime story to an enchanted child.`;

	const body = {
		contents: [{ role: "user", parts: [{ text: `${storytellingInstruction}\n\nNARRATION: ${text}` }] }],
		generationConfig: {
			temperature: 1,
			responseModalities: ["AUDIO"],
			speechConfig: {
				voiceConfig: {
					prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE },
				},
			},
		},
	};

	const res = await fetch(
		`${GEMINI_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);

	const raw = (await res.json()) as {
		candidates?: Array<{
			content?: {
				parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
			};
		}>;
		error?: { message?: string };
		usageMetadata?: {
			promptTokenCount?: number;
			candidatesTokenCount?: number;
		};
	};

	if (!res.ok) {
		throw new Error(
			`Gemini TTS error: ${raw.error?.message ?? `HTTP ${res.status}`}`,
		);
	}

	const audioPart = raw.candidates?.[0]?.content?.parts?.find(
		(p) => p.inlineData?.data,
	);
	if (!audioPart?.inlineData?.data) {
		throw new Error("Gemini TTS returned no audio");
	}

	// Decode raw L16 PCM and wrap into WAV
	const rawPcm = Buffer.from(audioPart.inlineData.data, "base64");
	const tmpPcm = destWavPath + ".pcm";
	await writeFile(tmpPcm, rawPcm);
	await execAsync(
		`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${tmpPcm}" -c:a pcm_s16le "${destWavPath}"`,
	);

	const durationSec = await probeDuration(destWavPath);

	// Cost: $1/1M input tokens, $20/1M output tokens
	const inputTokens =
		raw.usageMetadata?.promptTokenCount ?? Math.ceil(text.length / 4);
	const outputTokens =
		raw.usageMetadata?.candidatesTokenCount ?? Math.ceil(durationSec * 167); // ~167 tokens/sec
	const costUsd =
		(inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 20.0;

	return { durationSec, costUsd, inputTokens, outputTokens };
}

interface KokoroInstance {
	generate: (
		text: string,
		opts: { voice: string },
	) => Promise<{ save: (path: string) => void }>;
}

let kokoroTts: KokoroInstance | null = null;

async function getKokoro(): Promise<KokoroInstance> {
	if (kokoroTts) return kokoroTts;
	const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
	log("Narration", `Loading Kokoro fallback model (${KOKORO_MODEL})...`);
	const mod = await import("kokoro-js");
	const KokoroTTS = mod.KokoroTTS as unknown as {
		from_pretrained: (
			model: string,
			opts: { dtype: string; device: string },
		) => Promise<KokoroInstance>;
	};
	kokoroTts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
		dtype: "q8",
		device: "cpu",
	});
	log("Narration", "Kokoro model loaded.");
	return kokoroTts;
}

async function generateNarration(
	plan: StoryPlan,
	outDir: string,
	apiKey: string,
	skipExisting: boolean,
): Promise<{
	segments: NarrationSegment[];
	totalDurationSec: number;
	fullWavPath: string;
	totalCostUsd: number;
	ttsProvider: string;
}> {
	const audioDir = join(outDir, "audio");
	await mkdir(audioDir, { recursive: true });
	const fullWavPath = join(audioDir, "narration-full.wav");

	if (skipExisting && (await exists(fullWavPath))) {
		log("Narration", "Reusing existing narration audio");
		const totalDurationSec = await probeDuration(fullWavPath);
		const segments: NarrationSegment[] = [];
		for (const scene of plan.scenes) {
			const segPath = join(audioDir, `narration-${scene.sceneId}.wav`);
			if (scene.narration && (await exists(segPath))) {
				const dur = await probeDuration(segPath);
				segments.push({
					sceneId: scene.sceneId,
					text: scene.narration,
					wavPath: segPath,
					durationSec: dur,
					costUsd: 0,
				});
			} else {
				segments.push({
					sceneId: scene.sceneId,
					text: scene.narration,
					wavPath: "",
					durationSec: 0,
					costUsd: 0,
				});
			}
		}
		return {
			segments,
			totalDurationSec,
			fullWavPath,
			totalCostUsd: 0,
			ttsProvider: "reused",
		};
	}

	const segments: NarrationSegment[] = [];
	let totalCostUsd = 0;
	const pauseSec = 0.5;
	let geminiFailed = false;
	let ttsProvider = GEMINI_TTS_MODEL;

	for (const scene of plan.scenes) {
		if (!scene.narration) {
			log("Narration", `  ${scene.sceneId}: (no narration — skipping)`);
			segments.push({
				sceneId: scene.sceneId,
				text: "",
				wavPath: "",
				durationSec: 0,
				costUsd: 0,
			});
			continue;
		}

		const segPath = join(audioDir, `narration-${scene.sceneId}.wav`);
		log(
			"Narration",
			`  ${scene.sceneId}: "${scene.narration.substring(0, 50)}..."`,
		);

		// Try Gemini TTS first
		if (!geminiFailed) {
			try {
				const result = await geminiTts(scene.narration, segPath, apiKey);
				totalCostUsd += result.costUsd;
				addCost({
					step: "4. Narration (Gemini TTS)",
					provider: "gemini",
					model: GEMINI_TTS_MODEL,
					calls: 1,
					costUsd: result.costUsd,
					detail: `${scene.sceneId}, ${result.durationSec.toFixed(1)}s, ${result.inputTokens}in/${result.outputTokens}out tokens`,
				});
				log(
					"Narration",
					`    OK (Gemini) — ${result.durationSec.toFixed(1)}s, $${result.costUsd.toFixed(6)}`,
				);
				segments.push({
					sceneId: scene.sceneId,
					text: scene.narration,
					wavPath: segPath,
					durationSec: result.durationSec,
					costUsd: result.costUsd,
				});
				continue;
			} catch (err) {
				log(
					"Narration",
					`    Gemini TTS failed: ${err instanceof Error ? err.message : err}`,
				);
				log(
					"Narration",
					`    Falling back to Kokoro TTS (local, free) for all remaining segments...`,
				);
				geminiFailed = true;
				ttsProvider = "kokoro-af_heart (fallback)";
			}
		}

		// Kokoro fallback (free, local)
		// Add natural pauses for more expressive storytelling — extra spacing
		// at sentence boundaries and commas helps Kokoro produce more natural
		// rhythm and emphasis, closer to an engaging storyteller.
		try {
			const tts = await getKokoro();
			const expressiveText = scene.narration
				.replace(/\. /g, ".  ")  // slight pause after sentences
				.replace(/, /g, ",  ")   // slight pause after commas
				.replace(/— /g, "—  ")   // pause after em-dashes
				.replace(/\? /g, "?  "); // pause after questions
			const audio = await tts.generate(expressiveText, { voice: "af_heart" });
			audio.save(segPath);
			const durationSec = await probeDuration(segPath);
			log(
				"Narration",
				`    OK (Kokoro) — ${durationSec.toFixed(1)}s, $0.000000 (free)`,
			);
			segments.push({
				sceneId: scene.sceneId,
				text: scene.narration,
				wavPath: segPath,
				durationSec,
				costUsd: 0,
			});
		} catch (err) {
			log("Narration", `    FAILED (both Gemini + Kokoro): ${err}`);
			segments.push({
				sceneId: scene.sceneId,
				text: scene.narration,
				wavPath: "",
				durationSec: 0,
				costUsd: 0,
			});
		}
	}

	if (geminiFailed) {
		addCost({
			step: "4. Narration (Kokoro fallback)",
			provider: "local",
			model: "kokoro-af_heart",
			calls: segments.filter((s) => s.durationSec > 0).length,
			costUsd: 0,
			detail: "Local Kokoro TTS, $0 (Gemini credits depleted)",
		});
	}

	// Concatenate segments with pauses (guard against empty segment list)
	log("Narration", "Concatenating segments with pauses...");
	const segmentsWithAudio = segments.filter((s) => s.durationSec > 0);

	if (segmentsWithAudio.length === 0) {
		// No audio at all — write a silent placeholder
		log(
			"Narration",
			"WARNING: No narration audio generated — writing silent placeholder",
		);
		await execAsync(
			`ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t 10 -c:a pcm_s16le "${fullWavPath}"`,
		);
	} else if (segmentsWithAudio.length === 1) {
		// Single segment — just resample
		await execAsync(
			`ffmpeg -y -i "${segmentsWithAudio[0]!.wavPath}" -ar 48000 -ac 2 -c:a pcm_s16le "${fullWavPath}"`,
		);
	} else {
		const inputs: string[] = [];
		const silenceInputs: string[] = [];
		const silenceFilterParts: string[] = [];
		const concatInputs: string[] = [];
		let silenceIdx = segmentsWithAudio.length;

		segmentsWithAudio.forEach((seg, i) => {
			inputs.push(`-i "${seg.wavPath}"`);
			concatInputs.push(`[${i}:a]`);
			if (i < segmentsWithAudio.length - 1) {
				silenceInputs.push(
					`-f lavfi -i anullsrc=channel_layout=mono:sample_rate=24000`,
				);
				silenceFilterParts.push(
					`[${silenceIdx}:a]atrim=0:${pauseSec}[sil${i}]`,
				);
				concatInputs.push(`[sil${i}]`);
				silenceIdx++;
			}
		});

		const filter = `${silenceFilterParts.join(";")};${concatInputs.join("")}concat=n=${concatInputs.length}:v=0:a=1[out]`;
		const allInputs = [...inputs, ...silenceInputs].join(" ");

		await execAsync(
			`ffmpeg -y ${allInputs} -filter_complex "${filter}" -map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${fullWavPath}"`,
		);
	}

	const totalDurationSec = await probeDuration(fullWavPath);
	log(
		"Narration",
		`Full narration: ${totalDurationSec.toFixed(1)}s, total TTS cost: $${totalCostUsd.toFixed(6)}, provider: ${ttsProvider}`,
	);

	return { segments, totalDurationSec, fullWavPath, totalCostUsd, ttsProvider };
}

// === Stage 5: Music mix ===
//
// Mixes the narration/voiceover with the dedicated kids background music
// (media/background_kids.mp3). The music is ducked to a low level (10%) so
// it sits beneath the narration/dialogue as a warm ambient layer without
// overpowering it. A 2s fade-in and 2s fade-out keep the music entrance/exit
// gentle. The narration is boosted in the final mix so dialogue stays clear.

async function mixMusic(
	narrationWav: string,
	narrationDuration: number,
	outDir: string,
): Promise<string> {
	const mixedPath = join(outDir, "audio", "mixed-audio.wav");
	// Music is set to 10% — audible enough to add energy and warmth as a
	// background tone, but still balanced so the narration/dialogue remains
	// clear and prominent. No fade-in so the background tone is present from
	// the very start; 2s fade-out at the end for a gentle exit.
	const musicLevel = 0.10;
	const fadeOutStart = Math.max(0, narrationDuration - 2).toFixed(1);

	// The Remotion-bundled FFmpeg lacks the `afade` filter, so we use the
	// `volume` filter with per-frame evaluated time expressions. The music
	// is at full level from the very start (no fade-in) so the background
	// tone is present immediately. A 2s fade-out at the end keeps the exit
	// gentle.
	await execAsync(
		`ffmpeg -y -i "${narrationWav}" -stream_loop -1 -i "${BACKGROUND_MUSIC}" ` +
			`-filter_complex "` +
			`[1:a]volume='${musicLevel}*min(1,max(0,(${fadeOutStart}-t)/2))':eval=frame[bg];` +
			`[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=1.6[out]" ` +
			`-map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
	);

	log("MusicMix", `Mixed audio: ${mixedPath}`);
	return mixedPath;
}

// === Stage 6: Composition generation (Remotion kids template) ===

interface TimedScene {
	sceneId: string;
	componentSlug: string;
	data: Record<string, unknown>;
	imageUrl?: string;
	imageTreatment?: string;
	narrationSegment: string;
	startFrame: number;
	durationFrames: number;
	durationSeconds: number;
}

/**
 * Map each story scene to a kids component slug + data payload + timing.
 * Component selection is delegated to selectComponentForScene so it stays
 * consistent with the selection used during image generation (the image-gen
 * stage reads the same component's text-placement config to compose around
 * the reserved text region).
 */
function mapScenesToKidsComponents(
	plan: StoryPlan,
	segments: NarrationSegment[],
	imageMap: Record<string, string>,
): TimedScene[] {
	const scenes = plan.scenes;
	const lastIndex = scenes.length - 1;
	const timed: TimedScene[] = [];
	let currentFrame = 0;

	// Compute per-scene durations from narration segments
	const pauseSec = 0.5;
	const titleSeconds = 3;
	const endSeconds = 3;

	for (let i = 0; i < scenes.length; i++) {
		const scene = scenes[i]!;
		const seg = segments.find((s) => s.sceneId === scene.sceneId);
		const isFirst = i === 0;
		const isLast = i === lastIndex;

		// Duration
		let durationSeconds: number;
		if (isFirst) {
			durationSeconds = titleSeconds + (seg?.durationSec ?? 0);
		} else if (isLast) {
			durationSeconds = endSeconds;
		} else {
			durationSeconds = (seg?.durationSec ?? scene.durationSec) + pauseSec;
		}

		const durationFrames = Math.max(1, Math.round(durationSeconds * FPS));
		const startFrame = currentFrame;

		// Component slug + data — reuse the same selection logic used for
		// image generation so text-safe composition stays consistent.
		const { componentSlug, data } = selectComponentForScene(
			scene,
			i,
			lastIndex,
			plan,
		);

		timed.push({
			sceneId: scene.sceneId,
			componentSlug,
			data,
			imageUrl: imageMap[scene.sceneId],
			imageTreatment: "bright",
			narrationSegment: scene.narration,
			startFrame,
			durationFrames,
			durationSeconds,
		});

		currentFrame += durationFrames;
	}

	return timed;
}

async function generateComposition(
	plan: StoryPlan,
	segments: NarrationSegment[],
	images: SceneImageResult[],
	mixedAudio: string,
	outDir: string,
): Promise<{
	renderEntryPath: string;
	configPath: string;
	compositionId: string;
	publicDir: string;
}> {
	// Build image map: sceneId → relative path
	const imageMap: Record<string, string> = {};
	for (const img of images) {
		if (img.imagePath) {
			imageMap[img.sceneId] = `images/${img.sceneId}.jpg`;
		}
	}

	const timedScenes = mapScenesToKidsComponents(plan, segments, imageMap);
	const totalFrames = timedScenes.reduce((sum, s) => sum + s.durationFrames, 0);

	// Write composition config
	const configPath = join(outDir, "composition-config.json");
	await writeFile(
		configPath,
		JSON.stringify(
			{
				fps: FPS,
				width: VIDEO_WIDTH,
				height: VIDEO_HEIGHT,
				totalFrames,
				theme: "kids-bright",
				scenes: timedScenes,
				audioFile: "mixed-audio.wav",
			},
			null,
			2,
		),
	);

	// Generate render.tsx
	const sceneRenders = timedScenes
		.map((s) => {
			const dataStr = JSON.stringify(s.data);
			const imageProp = s.imageUrl
				? `imageUrl={staticFile("${s.imageUrl}")}`
				: "";
			const treatmentProp = s.imageTreatment
				? `imageTreatment="${s.imageTreatment}"`
				: "";
			return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <KidsSceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={kidsTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
		})
		.join("\n");

	const renderEntryPath = join(outDir, "render.tsx");
	const componentCode = `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import {
  kidsTheme,
  loadKidsFonts,
  KidsTitleCard,
  KidsImageReveal,
  KidsQuestion,
  KidsFunFact,
  KidsNumberStat,
  KidsTimeline,
  KidsQuote,
  KidsTopList,
  KidsEnding,
  KidsEndCard,
  KidsSubtitleTopScene,
  KidsSubtitleBottomScene,
} from "@automation/remotion-templates";

loadKidsFonts();

const KidsSceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl
    ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment }
    : data;
  switch (slug) {
    case "kids-title-card": return <KidsTitleCard data={fullData} theme={theme} />;
    case "kids-image-reveal": return <KidsImageReveal data={fullData} theme={theme} />;
    case "kids-subtitle-top-scene": return <KidsSubtitleTopScene data={fullData} theme={theme} />;
    case "kids-subtitle-bottom-scene": return <KidsSubtitleBottomScene data={fullData} theme={theme} />;
    case "kids-question": return <KidsQuestion data={fullData} theme={theme} />;
    case "kids-fun-fact": return <KidsFunFact data={fullData} theme={theme} />;
    case "kids-number-stat": return <KidsNumberStat data={fullData} theme={theme} />;
    case "kids-timeline": return <KidsTimeline data={fullData} theme={theme} />;
    case "kids-quote": return <KidsQuote data={fullData} theme={theme} />;
    case "kids-top-list": return <KidsTopList data={fullData} theme={theme} />;
    case "kids-ending": return <KidsEnding data={fullData} theme={theme} />;
    case "kids-end-card": return <KidsEndCard data={fullData} theme={theme} />;
    default: return (
      <AbsoluteFill style={{ background: "#4FC3F7", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a2e" }}>
        <p>Unknown kids component: {slug}</p>
      </AbsoluteFill>
    );
  }
};

const KidsVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#4FC3F7" }}>
${sceneRenders}
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="KidsVideo" component={KidsVideo} durationInFrames={${totalFrames}} fps={${FPS}} width={${VIDEO_WIDTH}} height={${VIDEO_HEIGHT}} />
);

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
	await writeFile(renderEntryPath, componentCode);

	// Copy assets to public dir
	const publicDir = join(outDir, "public");
	await mkdir(publicDir, { recursive: true });
	await copyFile(mixedAudio, join(publicDir, "mixed-audio.wav"));

	const imagesPublicDir = join(publicDir, "images");
	await mkdir(imagesPublicDir, { recursive: true });
	for (const img of images) {
		if (img.imagePath) {
			await copyFile(
				img.imagePath,
				join(imagesPublicDir, `${img.sceneId}.jpg`),
			);
		}
	}

	log(
		"Composition",
		`render.tsx + config + public dir ready (${totalFrames} frames)`,
	);
	return { renderEntryPath, configPath, compositionId: "KidsVideo", publicDir };
}

// === Stage 7: Render (Remotion CLI) ===

async function renderVideo(
	composition: {
		renderEntryPath: string;
		compositionId: string;
		publicDir: string;
	},
	outDir: string,
): Promise<{ videoPath: string; durationSec: number; sizeBytes: number }> {
	const videoPath = join(outDir, "milo-and-the-little-star.mp4");

	log("Render", `Remotion CLI rendering → ${videoPath}`);
	const cmd = `bun node_modules/@remotion/cli/remotion-cli.js render "${composition.renderEntryPath}" "${composition.compositionId}" "${videoPath}" --public-dir="${composition.publicDir}" --log=error`;
	await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });

	const durationSec = await probeDuration(videoPath);
	const { stdout: statOut } = await execAsync(`stat -c %s "${videoPath}"`);
	const sizeBytes = parseInt(statOut.trim());

	// Remotion render is free (local CPU)
	addCost({
		step: "7. Render (Remotion CLI)",
		provider: "local",
		model: "remotion-4.0.411",
		calls: 1,
		costUsd: 0,
		detail: "Local CPU render, $0",
	});

	return { videoPath, durationSec, sizeBytes };
}

// === Main run ===

export async function run(): Promise<SpikeResult> {
	await loadEnv();

	const args = process.argv.slice(2);
	const skipStory = args.includes("--skip-story");
	const skipImages = args.includes("--skip-images");
	const skipNarration = args.includes("--skip-narration");
	const skipRender = args.includes("--skip-render");

	const runwareKey = process.env.RUNWARE_API_KEY ?? "";
	const geminiKey = process.env.GEMINI_API_KEY ?? "";
	const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log(
		"  S23 — Kids Story Video: DeepSeek + Runware + Gemini TTS + Remotion",
	);
	console.log(`  LLM:      DeepSeek ${DEEPSEEK_MODEL}`);
	console.log(`  Images:   Runware ${RUNWARE_MODEL} (Qwen-Image)`);
	console.log(`  TTS:      Gemini ${GEMINI_TTS_MODEL} (${GEMINI_TTS_VOICE})`);
	console.log(
		`  Render:   Remotion kids template (${skipRender ? "SKIPPED" : "ENABLED"})`,
	);
	console.log(
		`  Keys:     DeepSeek=${deepseekKey ? "SET" : "MISSING"} Runware=${runwareKey ? "SET" : "MISSING"} Gemini=${geminiKey ? "SET" : "MISSING"}`,
	);
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	if (!runwareKey || !geminiKey || !deepseekKey) {
		return {
			id: SPIKE_ID,
			name: "Kids Story Video: DeepSeek + Runware + Gemini TTS + Remotion",
			goal: "Generate a complete kids storytelling video using DeepSeek for LLM, Runware Qwen-Image for images, Gemini TTS for narration, and the Remotion kids template for rendering.",
			result: "fail",
			measurements: {
				deepseekKey: !!deepseekKey,
				runwareKey: !!runwareKey,
				geminiKey: !!geminiKey,
			},
			notes:
				"One or more API keys missing. Set DEEPSEEK_API_KEY, RUNWARE_API_KEY, and GEMINI_API_KEY in .env.",
			artifactPaths: [],
		};
	}

	const outDir = await spikeDir(SPIKE_ID);
	const deepseek = new DeepSeekClient(deepseekKey);

	// ─── Stage 1: Story plan (DeepSeek) ─────────────────────────────────────
	console.log("▸ Stage 1: Story plan (DeepSeek V4-Flash)...\n");
	const { plan, costUsd: storyCost } = await generateStoryPlan(
		deepseek,
		outDir,
		skipStory,
	);
	console.log();

	// ─── Stage 1.4: Subtitle-position conflict safeguard ───────────────────
	// REUSABLE SAFEGUARD: Before selecting components or generating any images,
	// validate each scene's subtitlePosition against the character positions
	// described in its imagePrompt. If the character is described as being in
	// the SAME region as the reserved subtitle area, flip the subtitlePosition
	// to the opposite side. This prevents subtitles from overlapping
	// characters in the final video. Works for ANY story.
	const corrections = validateSubtitlePositions(plan);
	if (corrections.length > 0) {
		log("Safeguard", `Subtitle-position conflict detected in ${corrections.length} scene(s) — correcting:`);
		for (const c of corrections) {
			log("Safeguard", `  ${c.sceneId}: ${c.original} → ${c.corrected} (${c.reason})`);
		}
		// Persist the corrected plan so future runs reuse the fixed positions
		const storyPath = join(outDir, "01-story-plan.json");
		await writeFile(storyPath, JSON.stringify(plan, null, 2));
	} else {
		log("Safeguard", "No subtitle-position conflicts detected — all scenes OK");
	}
	console.log();

	// ─── Stage 1.5: Component selection (runs BEFORE image generation) ──────
	// Determine which Remotion kids component will render each scene so the
	// image-generation stage can read that component's text-placement config
	// and compose the image around the reserved text region.
	const componentSelection = selectComponentsForPlan(plan);
	log(
		"Components",
		`Selected ${componentSelection.size} components → ${[...componentSelection.entries()]
			.map(([id, sel]) => `${id}:${sel.componentSlug}`)
			.join(", ")}`,
	);

	// ─── Stage 2 & 3: Images (Runware Qwen-Image) ──────────────────────────
	console.log(
		"▸ Stage 2 & 3: Image generation (Runware Qwen-Image, text-safe composition)...\n",
	);
	const imageResult = await generateAllImages(
		plan,
		outDir,
		runwareKey,
		skipImages,
		componentSelection,
	);
	const succeeded = imageResult.images.filter((i) => i.imagePath).length;
	const failed = imageResult.images.length - succeeded;
	log(
		"Images",
		`${succeeded}/${imageResult.images.length} images, ${failed} failed, $${imageResult.totalCostUsd.toFixed(6)}`,
	);
	const refCostEntryForArtifact = costLedger.find((e) =>
		e.step.startsWith("2."),
	);
	await writeArtifact(
		SPIKE_ID,
		"02-images.json",
		JSON.stringify(
			{
				refImagePath: imageResult.refImagePath,
				refImageCostUsd: refCostEntryForArtifact?.costUsd ?? 0,
				model: RUNWARE_MODEL,
				modelName: "Qwen-Image",
				imageWidth: IMAGE_WIDTH,
				imageHeight: IMAGE_HEIGHT,
				totalCostUsd: imageResult.totalCostUsd,
				sceneImagesCostUsd: imageResult.images.reduce(
					(sum, i) => sum + i.costUsd,
					0,
				),
				images: imageResult.images,
				componentSelection: Object.fromEntries(
					[...componentSelection.entries()].map(([id, sel]) => [
						id,
						{ componentSlug: sel.componentSlug, textPlacement: getTextPlacementForSlug(sel.componentSlug) },
					]),
				),
				costSource: "actual Runware API response (result.cost field) — no estimates",
			},
			null,
			2,
		),
	);
	console.log();

	// ─── Stage 4: Narration (Gemini TTS) ────────────────────────────────────
	console.log("▸ Stage 4: Narration (Gemini TTS, Algenib)...\n");
	const narrationResult = await generateNarration(
		plan,
		outDir,
		geminiKey,
		skipNarration,
	);
	await writeArtifact(
		SPIKE_ID,
		"03-narration.json",
		JSON.stringify(
			{
				voice: GEMINI_TTS_VOICE,
				model: GEMINI_TTS_MODEL,
				ttsProvider: narrationResult.ttsProvider,
				totalDurationSec: narrationResult.totalDurationSec,
				totalCostUsd: narrationResult.totalCostUsd,
				segments: narrationResult.segments.map((s) => ({
					sceneId: s.sceneId,
					text: s.text,
					durationSec: s.durationSec,
					costUsd: s.costUsd,
				})),
			},
			null,
			2,
		),
	);
	console.log();

	// ─── Stage 5: Music mix ─────────────────────────────────────────────────
	console.log("▸ Stage 5: Music mix (narration + background music)...\n");
	const mixedAudio = await mixMusic(
		narrationResult.fullWavPath,
		narrationResult.totalDurationSec,
		outDir,
	);
	addCost({
		step: "5. Music mix (FFmpeg)",
		provider: "local",
		model: "ffmpeg",
		calls: 1,
		costUsd: 0,
		detail: "Local FFmpeg mix, $0",
	});
	console.log();

	// ─── Stage 6: Composition (Remotion kids template) ──────────────────────
	console.log(
		"▸ Stage 6: Composition generation (Remotion kids template)...\n",
	);
	const composition = await generateComposition(
		plan,
		narrationResult.segments,
		imageResult.images,
		mixedAudio,
		outDir,
	);
	addCost({
		step: "6. Composition (Remotion)",
		provider: "local",
		model: "remotion-kids",
		calls: 1,
		costUsd: 0,
		detail: "Local codegen, $0",
	});
	console.log();

	// ─── Stage 7: Render ────────────────────────────────────────────────────
	let video: {
		videoPath: string;
		durationSec: number;
		sizeBytes: number;
	} | null = null;
	if (!skipRender) {
		console.log("▸ Stage 7: Render (Remotion CLI)...\n");
		try {
			video = await renderVideo(composition, outDir);
			log(
				"Render",
				`${video.videoPath} (${video.durationSec.toFixed(1)}s, ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
			);
		} catch (err) {
			console.error(`\n✗ Render failed: ${err}`);
			log(
				"Render",
				"Render step failed — composition artifacts are still available",
			);
		}
	} else {
		log("Render", "SKIPPED (--skip-render)");
	}
	console.log();

	// ─── Cost summary ───────────────────────────────────────────────────────
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  COST BREAKDOWN");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);
	console.log(
		"  Step                          Provider    Model                    Calls    Cost (USD)",
	);
	console.log(
		"  ───────────────────────────── ─────────── ─────────────────────── ──────── ────────────",
	);
	for (const entry of costLedger) {
		const step = entry.step.padEnd(31);
		const prov = entry.provider.padEnd(11);
		const model = entry.model.padEnd(23);
		const calls = String(entry.calls).padEnd(8);
		const cost = `$${entry.costUsd.toFixed(6)}`.padStart(12);
		console.log(`  ${step} ${prov} ${model} ${calls} ${cost}`);
	}
	console.log(
		`  ${"─".repeat(31)} ${"─".repeat(11)} ${"─".repeat(23)} ${"─".repeat(8)} ${"─".repeat(12)}`,
	);
	const tc = totalCost();
	console.log(
		`  ${"TOTAL".padEnd(31)} ${"".padEnd(11)} ${"".padEnd(23)} ${"".padEnd(8)} ${"$" + tc.toFixed(6)}`.padEnd(
			0,
		),
	);
	console.log(`\n  Total video cost: $${tc.toFixed(6)}\n`);

	// ─── Image generation cost breakdown (per request, actual API costs) ────
	const refCostEntry = costLedger.find((e) => e.step.startsWith("2."));
	const sceneImageEntries = imageResult.images;
	const imageTotalUsd =
		(refCostEntry?.costUsd ?? 0) +
		sceneImageEntries.reduce((sum, i) => sum + i.costUsd, 0);

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  IMAGE GENERATION COST BREAKDOWN (actual Runware API costs)");
	console.log(
		`  Model: ${RUNWARE_MODEL} (Qwen-Image)  •  ${IMAGE_WIDTH}x${IMAGE_HEIGHT}`,
	);
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);
	console.log(
		"  Request                        Scene/Role      Refs  Latency    Cost (USD)",
	);
	console.log(
		"  ────────────────────────────── ─────────────── ──── ────────── ────────────",
	);
	console.log(
		`  milo-reference.jpg             ref (Milo)      0    ${"—".padStart(8)}   $${(refCostEntry?.costUsd ?? 0).toFixed(6)}`.padEnd(0),
	);
	for (const img of sceneImageEntries) {
		const req = `${img.sceneId}.jpg`.padEnd(31);
		const role = (img.usedReference ? "scene (w/ ref)" : "scene (no ref)").padEnd(15);
		const refs = String(img.usedReference ? 1 : 0).padEnd(4);
		const lat = `${img.latencyMs}ms`.padStart(10);
		const cost = `$${img.costUsd.toFixed(6)}`.padStart(12);
		console.log(`  ${req} ${role} ${refs} ${lat} ${cost}`);
	}
	console.log(
		`  ${"─".repeat(31)} ${"─".repeat(15)} ${"─".repeat(4)} ${"─".repeat(10)} ${"─".repeat(12)}`,
	);
	console.log(
		`  ${"TOTAL IMAGE GENERATION".padEnd(31)} ${"".padEnd(15)} ${"".padEnd(4)} ${"".padEnd(10)} ${"$" + imageTotalUsd.toFixed(6)}`.padEnd(0),
	);
	console.log(
		`  Image requests: ${sceneImageEntries.length + 1} (1 reference + ${sceneImageEntries.length} scenes)\n`,
	);

	// ─── Summary ────────────────────────────────────────────────────────────
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  SPIKE SUMMARY");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);
	console.log(`  Story:       "${plan.title}"`);
	console.log(`  Scenes:      ${plan.scenes.length}`);
	console.log(
		`  Images:      ${succeeded}/${imageResult.images.length} (Runware Qwen-Image)`,
	);
	console.log(
		`  Narration:   ${narrationResult.totalDurationSec.toFixed(1)}s (${narrationResult.ttsProvider})`,
	);
	if (video) {
		console.log(
			`  Video:       ${video.durationSec.toFixed(1)}s, ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
		);
		console.log(`  Output:      ${video.videoPath}`);
	}
	console.log(`  Total cost:  $${tc.toFixed(6)}`);
	console.log(`  Artifacts:   ${outDir}`);
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const artifactPaths = [
		join(outDir, "01-story-plan.json"),
		join(outDir, "02-images.json"),
		join(outDir, "03-narration.json"),
		join(outDir, "composition-config.json"),
		join(outDir, "render.tsx"),
		imageResult.refImagePath,
	];
	if (video) artifactPaths.push(video.videoPath);

	return {
		id: SPIKE_ID,
		name: "Kids Story Video: DeepSeek + Runware + Gemini TTS + Remotion",
		goal: "Generate a complete kids storytelling video using DeepSeek for LLM, Runware Qwen-Image for images, Gemini TTS for narration, and the Remotion kids template for rendering.",
		result: video ? "pass" : "partial",
		measurements: {
			storyTitle: plan.title,
			scenes: plan.scenes.length,
			imagesGenerated: succeeded,
			imagesFailed: failed,
			imageModel: RUNWARE_MODEL,
			imageCostUsd: imageResult.totalCostUsd.toFixed(6),
			narrationDurationSec: narrationResult.totalDurationSec.toFixed(1),
			ttsVoice: GEMINI_TTS_VOICE,
			ttsCostUsd: narrationResult.totalCostUsd.toFixed(6),
			storyCostUsd: storyCost.toFixed(6),
			videoDurationSec: video?.durationSec.toFixed(1) ?? "N/A",
			videoSizeMB: video ? (video.sizeBytes / 1024 / 1024).toFixed(1) : "N/A",
			totalCostUsd: tc.toFixed(6),
		},
		notes: `Generated "${plan.title}" — a ${plan.scenes.length}-scene kids story video. Providers: DeepSeek ${DEEPSEEK_MODEL} (story), Runware ${RUNWARE_MODEL} Qwen-Image (images, pure text-to-image with fixed seed), Gemini TTS ${GEMINI_TTS_VOICE} (narration), Remotion kids template (render). Total cost: $${tc.toFixed(6)}.`,
		artifactPaths,
	};
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
	run()
		.then((result) => {
			console.log(`\nResult: ${result.result}`);
			process.exit(0);
		})
		.catch((err) => {
			console.error("Spike failed:", err);
			process.exit(1);
		});
}
