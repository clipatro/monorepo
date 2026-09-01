/**
 * S23 — Kids Story Video: DeepSeek + Runware FLUX.2 [klein] 9B + Gemini TTS + Remotion kids template.
 *
 * A complete end-to-end kids storytelling video pipeline that mirrors the
 * milo-star-story approach but swaps every provider:
 *
 *   - DeepSeek V4-Flash  for ALL LLM work (story + scene plan generation)
 *   - Runware FLUX.2 [klein] 9B (runware:400@2) for image generation,
 *     with a generated character reference image attached to every character
 *     scene for visual consistency
 *   - Google Gemini TTS (Algenib voice) for the voiceover narration
 *   - @automation/remotion-templates KIDS namespace components rendered via
 *     the Remotion CLI to produce the final MP4
 *
 * Every paid call is cost-tracked. A per-step + total cost breakdown is
 * printed at the end.
 *
 * Pipeline (artifacts persisted to spikes/output/s23-kids-runware-deep/):
 *   1. Story plan     — DeepSeek generates the story + scene plan JSON
 *   2. Reference img  — Runware generates a Milo character reference image
 *   3. Scene images   — Runware generates each scene image WITH the reference
 *   4. Narration      — Gemini TTS (Algenib) per-scene + concatenated WAV
 *   5. Music mix      — narration + background.mp3 (ducked) via FFmpeg
 *   6. Composition    — generate render.tsx using the kids Remotion template
 *   7. Render         — Remotion CLI renders the final MP4
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

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, ".."); // spikes/ → clipatro/
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

// === Provider constants ===

const SPIKE_ID = "s23-kids-runware-deep";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

const RUNWARE_API_URL = "https://api.runware.ai/v1";
const RUNWARE_MODEL = "runware:400@3"; // FLUX.2 [klein] 9B Base
const IMAGE_WIDTH = 1088; // 9:16 vertical
const IMAGE_HEIGHT = 1920;
// Runware FLUX.2 [klein] 9B pricing: ~$0.001/image at 1088x1920 (per API cost field)

const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Gemini TTS pricing: $1/1M input tokens, $20/1M output tokens

const FPS = 30;
const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;

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
- Each scene must have: narration text (1-2 sentences), image description, emotion/mood
- Narration should be spoken-aloud friendly, ~15-25 words per scene
- The story should feel complete and emotionally satisfying
- Include a final "subscribe" end card scene with no narration

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
      "imagePrompt": "string (detailed prompt for AI image generation, including character descriptions, environment, mood, lighting, art style — must maintain visual consistency)",
      "emotion": "string (the emotional tone of this scene)",
      "durationSec": number (4-7)
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

// === Stage 2 & 3: Image generation (Runware FLUX.2 [klein] 9B) ===

const ART_STYLE_PREFIX = `STORYBOOK ILLUSTRATION STYLE — soft, warm, hand-painted children's book illustration with gentle lighting, rounded shapes, and a dreamy comforting atmosphere. Warm autumn color palette with golden tones. Consistent character designs across all images.

CHARACTER DESIGNS (use EXACTLY these descriptions in every image):
- MILO: A young boy aged 6-7 with curly brown hair, big expressive eyes, wearing a blue jacket and yellow boots. Kind and curious face.
- STAR: A small, round star character with a friendly face (two dot eyes and a smile). Glowing with warm golden-yellow light.
- RABBIT: A friendly, fluffy rabbit with soft brown fur, long ears, gentle expression. Small and cute.
- OWL: A wise, friendly owl with large round eyes, soft brown and white feathers, gentle knowing smile.
- DEER: A gentle, friendly deer with soft brown fur, large kind eyes, small antlers. Elegant and calm.

ART STYLE: Soft storybook illustration, warm golden lighting, rounded shapes, no harsh lines, gentle and inviting. Vertical composition (portrait orientation 9:16). No text, no watermark, no border.`;

const NEGATIVE_PROMPT =
	"text, watermark, logo, border, signature, blurry, deformed, extra limbs, bad anatomy, scary, dark, horror, realistic photo, 3d render, cgi";

async function runwareGenerate(
	apiKey: string,
	positivePrompt: string,
	referenceDataUris: string[],
	destPath: string,
): Promise<{ costUsd: number; latencyMs: number }> {
	const taskUUID = randomUUID();
	const task: Record<string, unknown> = {
		taskType: "imageInference",
		taskUUID,
		model: RUNWARE_MODEL,
		positivePrompt,
		negativePrompt: NEGATIVE_PROMPT,
		width: IMAGE_WIDTH,
		height: IMAGE_HEIGHT,
		numberResults: 1,
		outputFormat: "JPEG",
		outputQuality: 95,
		steps: 4,
		CFGScale: 3.5,
	};

	if (referenceDataUris.length > 0) {
		task.inputs = { referenceImages: referenceDataUris };
	}

	const t0 = performance.now();
	const res = await fetch(RUNWARE_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify([task]),
	});

	const raw = (await res.json()) as {
		data?: Array<{ imageURL: string; cost?: number }>;
		errors?: Array<{ code: string; message: string }>;
	};

	const latencyMs = Math.round(performance.now() - t0);

	if (!res.ok || raw.errors?.length) {
		const errMsg = raw.errors?.[0]?.message ?? `HTTP ${res.status}`;
		throw new Error(`Runware API error: ${errMsg}`);
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

	// Runware reports cost per image; ~$0.001 at 1088x1920
	const costUsd = result.cost ?? 0.001;
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
): Promise<{
	images: SceneImageResult[];
	totalCostUsd: number;
	refImagePath: string;
}> {
	const imagesDir = join(outDir, "images");
	await mkdir(imagesDir, { recursive: true });

	const images: SceneImageResult[] = [];
	let totalCostUsd = 0;

	// ─── Stage 2: Generate Milo character reference image ───────────────────
	const refImagePath = join(imagesDir, "milo-reference.jpg");

	if (skipExisting && (await exists(refImagePath))) {
		log("RefImage", "Reusing existing Milo reference image");
	} else {
		log(
			"RefImage",
			"Generating Milo character reference image (no reference)...",
		);
		const refPrompt = `${ART_STYLE_PREFIX}

CHARACTER REFERENCE SHEET: A young boy named Milo, aged 6-7, with curly brown hair, big expressive brown eyes, wearing a blue jacket and yellow boots. He has a kind and curious face with rosy cheeks. Show him in a friendly neutral pose, standing in a warm autumn forest with golden light, looking at the camera with a gentle smile. Full body visible. This is a character reference image for maintaining visual consistency across scenes.

Vertical 9:16 composition. No text, no watermark.`;

		const result = await runwareGenerate(apiKey, refPrompt, [], refImagePath);
		totalCostUsd += result.costUsd;
		addCost({
			step: "2. Reference image (Runware)",
			provider: "runware",
			model: RUNWARE_MODEL,
			calls: 1,
			costUsd: result.costUsd,
			detail: `Milo reference, ${result.latencyMs}ms`,
		});
		log(
			"RefImage",
			`OK — ${result.latencyMs}ms, $${result.costUsd.toFixed(6)}`,
		);
	}

	// Load the reference image as a data URI for all subsequent scene generations
	const refDataUri = await fileToDataUri(refImagePath);

	// ─── Stage 3: Generate each scene image ─────────────────────────────────
	for (const scene of plan.scenes) {
		const sceneImagePath = join(imagesDir, `${scene.sceneId}.jpg`);

		if (skipExisting && (await exists(sceneImagePath))) {
			log("Image", `  ${scene.sceneId}: reusing existing image`);
			images.push({
				sceneId: scene.sceneId,
				imagePath: sceneImagePath,
				costUsd: 0,
				latencyMs: 0,
				usedReference: true,
			});
			continue;
		}

		// The last scene (end card) has no Milo — generate without reference
		const isEndCard = !scene.narration;
		const refs = isEndCard ? [] : [refDataUri];

		const fullPrompt = `${ART_STYLE_PREFIX}

SCENE: ${scene.imagePrompt}

EMOTION: ${scene.emotion}
Vertical 9:16 composition. No text, no watermark.`;

		log("Image", `  ${scene.sceneId}: generating (ref=${refs.length})...`);
		try {
			const result = await runwareGenerate(
				apiKey,
				fullPrompt,
				refs,
				sceneImagePath,
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
				usedReference: refs.length > 0,
			});
		} catch (err) {
			log("Image", `    FAILED: ${err}`);
			images.push({
				sceneId: scene.sceneId,
				imagePath: "",
				costUsd: 0,
				latencyMs: 0,
				usedReference: refs.length > 0,
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
	const body = {
		contents: [{ role: "user", parts: [{ text }] }],
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
		try {
			const tts = await getKokoro();
			const audio = await tts.generate(scene.narration, { voice: "af_heart" });
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

async function mixMusic(
	narrationWav: string,
	narrationDuration: number,
	outDir: string,
): Promise<string> {
	const mixedPath = join(outDir, "audio", "mixed-audio.wav");
	const musicLevel = 0.12;

	await execAsync(
		`ffmpeg -y -i "${narrationWav}" -stream_loop -1 -i "${BACKGROUND_MUSIC}" ` +
			`-filter_complex "` +
			`[1:a]volume=${musicLevel},afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, narrationDuration - 2).toFixed(1)}:d=2[bg];` +
			`[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=1.5[out]" ` +
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
 * Map each story scene to a kids component slug + data payload.
 * First scene → title card, last → end card, rest → image-reveal.
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

		// Component slug + data
		let componentSlug: string;
		let data: Record<string, unknown>;

		if (isFirst) {
			componentSlug = "kids-title-card";
			data = {
				title:
					plan.title.length > 60 ? plan.title.slice(0, 57) + "…" : plan.title,
				subtitle: scene.narration.slice(0, 100),
				hook: scene.narration.slice(0, 120),
				label: "FUN STORY!",
			};
		} else if (isLast) {
			componentSlug = "kids-end-card";
			data = {
				cta: "Subscribe for more!",
				channelName: "kidstorytime",
				finalQuestion: "What's your favorite story?",
			};
		} else if (i === lastIndex - 1) {
			componentSlug = "kids-ending";
			data = {
				message: scene.narration.slice(0, 200),
				encouragement: "What do YOU think?",
				label: "REMEMBER!",
			};
		} else {
			componentSlug = "kids-image-reveal";
			data = {
				caption: scene.narration.slice(0, 180),
				label: scene.emotion.slice(0, 30),
			};
		}

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
	console.log(`  Images:   Runware ${RUNWARE_MODEL} (FLUX.2 [klein] 9B)`);
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
			goal: "Generate a complete kids storytelling video using DeepSeek for LLM, Runware FLUX.2 [klein] 9B for images, Gemini TTS for narration, and the Remotion kids template for rendering.",
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

	// ─── Stage 2 & 3: Images (Runware) ──────────────────────────────────────
	console.log(
		"▸ Stage 2 & 3: Image generation (Runware FLUX.2 [klein] 9B)...\n",
	);
	const imageResult = await generateAllImages(
		plan,
		outDir,
		runwareKey,
		skipImages,
	);
	const succeeded = imageResult.images.filter((i) => i.imagePath).length;
	const failed = imageResult.images.length - succeeded;
	log(
		"Images",
		`${succeeded}/${imageResult.images.length} images, ${failed} failed, $${imageResult.totalCostUsd.toFixed(6)}`,
	);
	await writeArtifact(
		SPIKE_ID,
		"02-images.json",
		JSON.stringify(
			{
				refImagePath: imageResult.refImagePath,
				model: RUNWARE_MODEL,
				totalCostUsd: imageResult.totalCostUsd,
				images: imageResult.images,
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
		`  Images:      ${succeeded}/${imageResult.images.length} (Runware FLUX.2 [klein] 9B)`,
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
		goal: "Generate a complete kids storytelling video using DeepSeek for LLM, Runware FLUX.2 [klein] 9B for images (with reference), Gemini TTS for narration, and the Remotion kids template for rendering.",
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
		notes: `Generated "${plan.title}" — a ${plan.scenes.length}-scene kids story video. Providers: DeepSeek ${DEEPSEEK_MODEL} (story), Runware ${RUNWARE_MODEL} (images, with character reference), Gemini TTS ${GEMINI_TTS_VOICE} (narration), Remotion kids template (render). Total cost: $${tc.toFixed(6)}.`,
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
