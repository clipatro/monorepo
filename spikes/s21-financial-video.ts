/**
 * S21 — Financial Video Generation Spike.
 *
 * Turns a topic + theme into a complete financial documentary video using
 * the @automation/remotion-templates component catalog, Gemini research,
 * Gemini Flash Image, Gemini TTS, and background music mixing.
 *
 * Gated pipeline (each stage persists artifacts to spikes/output/s21/):
 *   1. Research    — Gemini grounding gathers evidence on the topic
 *   2. Script      — LLM writes a documentary script + scene breakdown
 *                    using the component capability catalog
 *   3. Scene Plan  — Map script beats to Remotion components + compute timings
 *   4. Media       — Generate/acquire images for scenes that need them
 *   5. Narration   — Gemini TTS (Algenib) voiceover → WAV
 *   6. Music Sync  — Mix narration WAV with background.mp3 via FFmpeg
 *   7. Composition — Generate Remotion composition using @automation/remotion-templates
 *   8. Render      — Render the final MP4 via Remotion CLI
 *
 * Cost tracking: every paid call goes through checkBudget → calculateCost → recordCost.
 * Dry-run: DRY_RUN=true runs the full pipeline with placeholder data (zero cost).
 *
 * Usage:
 *   bun run spikes/s21-financial-video.ts "The 2008 Financial Crisis" archive
 *   DRY_RUN=true bun run spikes/s21-financial-video.ts "Inflation" midnight
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, access, copyFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import {
	loadEnv,
	spikeDir,
	writeArtifact,
	writeBinaryArtifact,
	type SpikeResult,
} from "./lib/spike.ts";

// ─── Provider + cost tracking imports ────────────────────────────────────────
import { GeminiClient, extractJson } from "@automation/gemini-client";
import {
	checkBudget,
	calculateCost,
	recordCost,
} from "@automation/cost-tracker";
import { isDryRun } from "@automation/contracts";

// ─── Remotion template catalog imports ───────────────────────────────────────
import {
	getLlmComponentCatalog,
	recommendComponents,
	type ComponentCapability,
	type ComponentRecommendation,
} from "@automation/remotion-templates";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const FPS = 60;
const WIDTH = 720;
const HEIGHT = 1280;
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

// ─── Models ──────────────────────────────────────────────────────────────────
const RESEARCH_MODEL = "gemini-3.7-flash";
const SCRIPT_MODEL = "gemini-3.6-flash";
const IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_VOICE = "Algenib";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResearchArtifact {
	topic: string;
	sources: Array<{ id: string; title: string; url?: string; excerpt: string }>;
	claims: Array<{
		id: string;
		claim: string;
		sourceIds: string[];
		confidence: "high" | "medium" | "low";
	}>;
	allowedFacts: string[];
	uncertainties: string[];
	warnings: string[];
	costUsd: number;
}

export interface ScriptScene {
	id: string;
	/** Component slug from the catalog, e.g. "bar-chart", "hero-image-story" */
	componentSlug: string;
	/** Narration segment for this scene (concatenated to form full narration) */
	narrationSegment: string;
	/** On-screen title or headline */
	title: string;
	/** Component data payload — matches the component's data type */
	data: Record<string, unknown>;
	/** Whether this scene needs an AI-generated image */
	needsImage: boolean;
	/** Image prompt if needsImage is true */
	imagePrompt?: string;
	/** Narrative role hint for the LLM */
	narrativeRole: string;
}

export interface ScriptArtifact {
	topic: string;
	title: string;
	subtitle: string;
	theme: string;
	narration: string;
	scenes: ScriptScene[];
	costUsd: number;
}

export interface ScenePlanArtifact {
	fps: number;
	width: number;
	height: number;
	totalFrames: number;
	titleCard: {
		startFrame: number;
		endFrame: number;
		title: string;
		subtitle: string;
	};
	scenes: Array<{
		id: string;
		componentSlug: string;
		startFrame: number;
		endFrame: number;
		durationFrames: number;
		data: Record<string, unknown>;
		imageUrl?: string;
		narrativeRole: string;
	}>;
	endCard: { startFrame: number; endFrame: number };
	narrationDurationSec: number;
	costUsd: number;
}

export interface MediaArtifact {
	images: Array<{
		sceneId: string;
		path: string;
		width: number;
		height: number;
		costUsd: number;
	}>;
	totalCostUsd: number;
}

export interface NarrationArtifact {
	wavPath: string;
	durationSec: number;
	costUsd: number;
}

export interface MusicSyncArtifact {
	mixedAudioPath: string;
	durationSec: number;
	costUsd: number;
}

export interface CompositionArtifact {
	renderEntryPath: string;
	configPath: string;
	compositionId: string;
	costUsd: number;
}

export interface RenderArtifact {
	videoPath: string;
	durationSec: number;
	sizeBytes: number;
	costUsd: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function log(stage: string, msg: string): void {
	console.log(`  [${stage}] ${msg}`);
}

function costSummary(total: number): string {
	return `$${total.toFixed(4)}`;
}

// ─── Stage 1: Research ───────────────────────────────────────────────────────

async function runResearch(
	client: GeminiClient,
	topic: string,
	outDir: string,
): Promise<ResearchArtifact> {
	console.log("\n▸ Stage 1: Research (Gemini grounding)...\n");

	if (isDryRun()) {
		const artifact = generateMockResearch(topic);
		await writeArtifact(
			"s21",
			"01-research.json",
			JSON.stringify(artifact, null, 2),
		);
		log(
			"Research",
			`DRY-RUN: ${artifact.sources.length} sources, ${artifact.claims.length} claims, ${artifact.allowedFacts.length} facts — $0.0000`,
		);
		return artifact;
	}

	const result = await client.call({
		model: RESEARCH_MODEL,
		prompt: `Build an evidence dossier for a short-form financial documentary about: "${topic}".

Find real data, statistics, dates, key figures, and authoritative sources. Focus on:
- Key facts and numbers that can be visualized (charts, statistics, comparisons)
- Historical context and timeline events
- Cause-and-effect relationships
- Expert quotes or official statements

Return JSON in this exact format:
{
  "sources": [{ "id": "s1", "title": "...", "url": "...", "excerpt": "..." }],
  "claims": [{ "id": "c1", "claim": "...", "sourceIds": ["s1"], "confidence": "high" }],
  "allowedFacts": ["concise verified facts safe to state"],
  "uncertainties": ["..."],
  "warnings": ["..."]
}

Do not fabricate sources, URLs, or statistics. Use only verified information.`,
		useGrounding: true,
		systemInstruction:
			"You are an evidence-first financial researcher. Find real data and authoritative sources. Never fabricate statistics, dates, or quotations.",
		temperature: 0.2,
		maxOutputTokens: 4096,
		capability: "research.grounding",
	});

	const parsed = result.json as {
		sources?: Array<{
			id?: string;
			title?: string;
			url?: string;
			excerpt?: string;
		}>;
		claims?: Array<{
			id?: string;
			claim?: string;
			sourceIds?: string[];
			confidence?: string;
		}>;
		allowedFacts?: string[];
		uncertainties?: string[];
		warnings?: string[];
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
		confidence: (c.confidence === "high" || c.confidence === "low"
			? c.confidence
			: "medium") as "high" | "medium" | "low",
	}));

	const artifact: ResearchArtifact = {
		topic,
		sources,
		claims,
		allowedFacts: parsed?.allowedFacts ?? [],
		uncertainties: parsed?.uncertainties ?? [],
		warnings: parsed?.warnings ?? [],
		costUsd: result.cost.totalCost,
	};

	await writeArtifact(
		"s21",
		"01-research.json",
		JSON.stringify(artifact, null, 2),
	);
	log(
		"Research",
		`${sources.length} sources, ${claims.length} claims, ${artifact.allowedFacts.length} facts — ${costSummary(artifact.costUsd)}`,
	);
	return artifact;
}

// ─── Stage 2: Script Generation ──────────────────────────────────────────────

async function runScript(
	client: GeminiClient,
	topic: string,
	theme: string,
	research: ResearchArtifact,
	outDir: string,
): Promise<ScriptArtifact> {
	console.log(
		"\n▸ Stage 2: Script generation (Gemini + component catalog)...\n",
	);

	if (isDryRun()) {
		const artifact = generateMockScript(topic, theme, research);
		await writeArtifact(
			"s21",
			"02-script.json",
			JSON.stringify(artifact, null, 2),
		);
		log(
			"Script",
			`DRY-RUN: ${artifact.scenes.length} scenes, ${artifact.narration.length} chars narration — $0.0000`,
		);
		for (const s of artifact.scenes) {
			log(
				"Script",
				`  ${s.id}: ${s.componentSlug} — "${s.title?.slice(0, 50) ?? ""}"`,
			);
		}
		return artifact;
	}

	const catalog = getLlmComponentCatalog();
	const catalogCompact = catalog.components.map((c) => ({
		slug: c.slug,
		name: c.name,
		purpose: c.purpose,
		narrativeRoles: c.narrativeRoles,
		informationShapes: c.informationShapes,
		tones: c.tones,
		media: c.media,
		inputs: c.inputs.map((i) => ({
			name: i.name,
			kind: i.kind,
			required: i.required,
			max: i.maxCharacters ?? i.maxItems,
		})),
		textBudget: c.textBudget,
		selectionHint: c.selectionHint,
	}));

	const prompt = `Write a short-form financial documentary script about: "${topic}".

THEME: ${theme}

RESEARCH EVIDENCE (use only these verified facts):
${JSON.stringify(research.allowedFacts, null, 2)}

SOURCES:
${JSON.stringify(
	research.sources.map((s) => ({ title: s.title, excerpt: s.excerpt })),
	null,
	2,
)}

AVAILABLE REMOTION COMPONENTS (pick one per scene):
${JSON.stringify(catalogCompact, null, 2)}

RULES:
1. The video is 60-90 seconds, vertical 9:16 (720x1280), ${FPS}fps.
2. Write 5-7 scenes. Scene 1 MUST use "title-card". Last scene MUST use "end-card".
3. Each scene's narrationSegment concatenates to form the full narration (minus title card).
4. Narration should be 120-180 words, spoken-word style, ready for TTS.
5. For each scene, pick the BEST component slug from the catalog above.
6. Fill in the component's data fields based on the research evidence.
7. For chart components (bar-chart, line-chart, pie-chart, circular-progress), use REAL data from the research.
8. For image components (hero-image-story, archival-photo, etc.), set needsImage=true and write a detailed imagePrompt.
9. For text-only components (key-fact, quote-card, etc.), set needsImage=false.
10. Do NOT fabricate statistics — use only the research evidence provided.

Return JSON in this exact format:
{
  "topic": "${topic}",
  "title": "Documentary title (4-8 words)",
  "subtitle": "Subtitle (3-6 words)",
  "theme": "${theme}",
  "narration": "Full narration text, 120-180 words",
  "scenes": [
    {
      "id": "scene1",
      "componentSlug": "title-card",
      "narrationSegment": "",
      "title": "Title for the card",
      "data": { "title": "...", "subtitle": "..." },
      "needsImage": false,
      "narrativeRole": "intro"
    },
    {
      "id": "scene2",
      "componentSlug": "bar-chart",
      "narrationSegment": "Portion of narration for this scene",
      "title": "Chart headline",
      "data": { "title": "...", "bars": [...], "maxValue": 100, "yAxisLabel": "..." },
      "needsImage": false,
      "narrativeRole": "fact"
    }
  ]
}`;

	const result = await client.call({
		model: SCRIPT_MODEL,
		prompt,
		responseJson: true,
		systemInstruction:
			"You are a master scriptwriter for short-form financial documentaries. You write clear, engaging, spoken-word narration. You select the best visual component for each beat. Return ONLY valid JSON.",
		temperature: 0.7,
		maxOutputTokens: 8192,
		capability: "script.generate",
	});

	const parsed = result.json as ScriptArtifact | null;
	if (!parsed || !parsed.scenes || !Array.isArray(parsed.scenes)) {
		throw new Error("Script generation failed: invalid JSON structure");
	}

	const artifact: ScriptArtifact = {
		...parsed,
		topic,
		theme,
		costUsd: result.cost.totalCost,
	};

	await writeArtifact(
		"s21",
		"02-script.json",
		JSON.stringify(artifact, null, 2),
	);
	log(
		"Script",
		`${artifact.scenes.length} scenes, ${artifact.narration.length} chars narration — ${costSummary(artifact.costUsd)}`,
	);
	for (const s of artifact.scenes) {
		log(
			"Script",
			`  ${s.id}: ${s.componentSlug} — "${s.title?.slice(0, 50) ?? ""}"`,
		);
	}
	return artifact;
}

// ─── Stage 3: Scene Plan + Timings ───────────────────────────────────────────

async function runScenePlan(
	script: ScriptArtifact,
	narrationDurationSec: number,
	outDir: string,
): Promise<ScenePlanArtifact> {
	console.log("\n▸ Stage 3: Scene plan + timings...\n");

	const titleCardFrames = 75; // 2.5s at 30fps
	const endCardFrames = 90; // 3s
	const narrationStartFrame = titleCardFrames;
	const narrationTotalFrames = Math.ceil(narrationDurationSec * FPS);
	const totalFrames = titleCardFrames + narrationTotalFrames + endCardFrames;

	// Distribute narration frames across non-title scenes proportionally to segment length
	const narrationScenes = script.scenes.filter(
		(s) => s.narrationSegment && s.narrationSegment.length > 0,
	);
	const totalChars = narrationScenes.reduce(
		(sum, s) => sum + s.narrationSegment.length,
		0,
	);

	let currentFrame = narrationStartFrame;
	const sceneTimings: ScenePlanArtifact["scenes"] = [];

	for (const scene of script.scenes) {
		if (scene.componentSlug === "title-card") continue;
		if (scene.componentSlug === "end-card") continue;

		const segmentLen = scene.narrationSegment?.length ?? 0;
		const proportion = totalChars > 0 ? segmentLen / totalChars : 0;
		const sceneFrames = Math.max(
			45,
			Math.round(narrationTotalFrames * proportion),
		);

		sceneTimings.push({
			id: scene.id,
			componentSlug: scene.componentSlug,
			startFrame: currentFrame,
			endFrame: currentFrame + sceneFrames,
			durationFrames: sceneFrames,
			data: scene.data,
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

	const artifact: ScenePlanArtifact = {
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

	await writeArtifact(
		"s21",
		"03-scene-plan.json",
		JSON.stringify(artifact, null, 2),
	);
	log(
		"ScenePlan",
		`${sceneTimings.length} scenes, ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`,
	);
	for (const s of sceneTimings) {
		log(
			"ScenePlan",
			`  ${s.id} (${s.componentSlug}): ${s.startFrame}-${s.endFrame} (${(s.durationFrames / FPS).toFixed(1)}s)`,
		);
	}
	return artifact;
}

// ─── Stage 4: Media Acquisition ──────────────────────────────────────────────

async function runMedia(
	script: ScriptArtifact,
	apiKey: string,
	outDir: string,
): Promise<MediaArtifact> {
	console.log("\n▸ Stage 4: Media acquisition (Gemini Flash Image)...\n");

	const images: MediaArtifact["images"] = [];
	const imageScenes = script.scenes.filter(
		(s) => s.needsImage && s.imagePrompt,
	);

	if (imageScenes.length === 0) {
		log("Media", "No scenes require images — skipping");
		const artifact: MediaArtifact = { images, totalCostUsd: 0 };
		await writeArtifact(
			"s21",
			"04-media.json",
			JSON.stringify(artifact, null, 2),
		);
		return artifact;
	}

	const imagesDir = join(outDir, "images");
	await mkdir(imagesDir, { recursive: true });

	for (const scene of imageScenes) {
		const imgPath = join(imagesDir, `${scene.id}.png`);
		let costUsd = 0;

		if (isDryRun()) {
			// Generate a placeholder gray PNG
			const placeholder = generatePlaceholderPng(WIDTH, HEIGHT);
			await writeFile(imgPath, placeholder);
			costUsd = 0;
			log("Media", `DRY-RUN: placeholder for ${scene.id}`);
		} else {
			// Check budget before each image
			const estimatedCost = 0.1;
			await checkBudget(estimatedCost, {});

			const t0 = performance.now();
			const body = {
				contents: [
					{
						role: "user",
						parts: [
							{
								text: `${scene.imagePrompt}\n\nVertical 9:16 composition, cinematic, documentary style. No text in the image.`,
							},
						],
					},
				],
				generationConfig: { temperature: 0.8 },
			};

			const res = await fetch(
				`${GEMINI_API_BASE}/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
			);
			const latencyMs = Math.round(performance.now() - t0);
			const raw = (await res.json()) as any;

			if (!res.ok)
				throw new Error(
					`Image generation failed for ${scene.id}: ${raw.error?.message ?? res.status}`,
				);

			const imagePart = raw.candidates?.[0]?.content?.parts?.find(
				(p: any) => p.inlineData?.data,
			);
			if (!imagePart?.inlineData?.data)
				throw new Error(`No image returned for ${scene.id}`);

			const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
			await writeFile(imgPath, imageBuffer);

			// Calculate cost
			const usage = raw.usageMetadata ?? {};
			const cost = calculateCost({
				model: IMAGE_MODEL,
				inputTokens: usage.promptTokenCount ?? 0,
				outputTokens: usage.candidatesTokenCount ?? 0,
				imageCount: 1,
				imageResolution: "1k" as const,
			});
			recordCost(cost, {
				capability: "image.generate",
				inputTokens: usage.promptTokenCount ?? 0,
				outputTokens: usage.candidatesTokenCount ?? 0,
				notes: `latency=${latencyMs}ms, scene=${scene.id}`,
			});
			costUsd = cost.totalCost;
			log("Media", `Generated ${scene.id} — ${costSummary(costUsd)}`);
		}

		images.push({
			sceneId: scene.id,
			path: imgPath,
			width: WIDTH,
			height: HEIGHT,
			costUsd,
		});
	}

	const totalCostUsd = images.reduce((sum, img) => sum + img.costUsd, 0);
	const artifact: MediaArtifact = { images, totalCostUsd };
	await writeArtifact(
		"s21",
		"04-media.json",
		JSON.stringify(artifact, null, 2),
	);
	log("Media", `${images.length} images — ${costSummary(totalCostUsd)}`);
	return artifact;
}

// ─── Stage 5: Narration (Gemini TTS) ─────────────────────────────────────────

async function runNarration(
	narration: string,
	apiKey: string,
	outDir: string,
): Promise<NarrationArtifact> {
	console.log("\n▸ Stage 5: Narration (Gemini TTS Algenib)...\n");

	const wavPath = join(outDir, "narration.wav");
	let costUsd = 0;
	let durationSec = 10; // default for dry-run

	if (isDryRun()) {
		// Generate a silent dummy WAV
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
- Direct, conversational, and emotionally restrained.
- Sound like one thoughtful person speaking to one listener.
- Speak at a brisk, purposeful pace.
- Use restrained, believable emotion.

<script>
${narration}
</script>`;

		const body = {
			contents: [{ role: "user", parts: [{ text: ttsPrompt }] }],
			generationConfig: {
				temperature: 1,
				responseModalities: ["AUDIO"],
				speechConfig: {
					voiceConfig: {
						prebuiltVoiceConfig: { voiceName: TTS_VOICE },
					},
				},
			},
		};

		const t0 = performance.now();
		const res = await fetch(
			`${GEMINI_API_BASE}/models/${TTS_MODEL}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);
		const latencyMs = Math.round(performance.now() - t0);
		const raw = (await res.json()) as any;

		if (!res.ok)
			throw new Error(`Gemini TTS failed: ${raw.error?.message ?? res.status}`);

		const audioPart = raw.candidates?.[0]?.content?.parts?.find(
			(p: any) => p.inlineData?.data,
		);
		if (!audioPart?.inlineData?.data)
			throw new Error("Gemini TTS returned no audio");

		const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
		const pcmPath = join(outDir, "narration.pcm");
		await writeFile(pcmPath, pcmBuffer);

		// Convert PCM (L16, 24kHz, mono) to WAV
		await execAsync(
			`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a pcm_s16le "${wavPath}"`,
		);

		// Get duration
		const { stdout: probeOut } = await execAsync(
			`ffprobe -v quiet -print_format json -show_format "${wavPath}"`,
		);
		const probe = JSON.parse(probeOut);
		durationSec = parseFloat(probe.format.duration);

		// Calculate cost
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
		log(
			"Narration",
			`WAV ${durationSec.toFixed(1)}s — ${costSummary(costUsd)}`,
		);
	}

	const artifact: NarrationArtifact = { wavPath, durationSec, costUsd };
	await writeArtifact(
		"s21",
		"05-narration.json",
		JSON.stringify(artifact, null, 2),
	);
	return artifact;
}

// ─── Stage 6: Music Sync ─────────────────────────────────────────────────────

async function runMusicSync(
	narrationPath: string,
	narrationDurationSec: number,
	outDir: string,
): Promise<MusicSyncArtifact> {
	console.log("\n▸ Stage 6: Music sync (narration + background music)...\n");

	const mixedPath = join(outDir, "mixed-audio.wav");

	if (!(await exists(BACKGROUND_MUSIC))) {
		log(
			"MusicSync",
			`Background music not found at ${BACKGROUND_MUSIC} — using narration only`,
		);
		await copyFile(narrationPath, mixedPath);
		const artifact: MusicSyncArtifact = {
			mixedAudioPath: mixedPath,
			durationSec: narrationDurationSec,
			costUsd: 0,
		};
		await writeArtifact(
			"s21",
			"06-music-sync.json",
			JSON.stringify(artifact, null, 2),
		);
		return artifact;
	}

	// Mix narration (full volume) with background music (ducked to 15% volume)
	// Music is trimmed/looped to match narration duration + 3s tail
	const totalDuration = narrationDurationSec + 3;
	await execAsync(
		`ffmpeg -y -i "${narrationPath}" -i "${BACKGROUND_MUSIC}" ` +
			`-filter_complex "[0:a]volume=1.0[voice];[1:a]volume=0.15,afade=t=out:st=${(totalDuration - 2).toFixed(1)}:d=2[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=0" ` +
			`-t ${totalDuration.toFixed(1)} -c:a pcm_s16le "${mixedPath}"`,
	);

	const { stdout: probeOut } = await execAsync(
		`ffprobe -v quiet -print_format json -show_format "${mixedPath}"`,
	);
	const probe = JSON.parse(probeOut);
	const durationSec = parseFloat(probe.format.duration);

	log(
		"MusicSync",
		`Mixed audio ${durationSec.toFixed(1)}s (narration + background music)`,
	);
	const artifact: MusicSyncArtifact = {
		mixedAudioPath: mixedPath,
		durationSec,
		costUsd: 0,
	};
	await writeArtifact(
		"s21",
		"06-music-sync.json",
		JSON.stringify(artifact, null, 2),
	);
	return artifact;
}

// ─── Stage 7: Composition Generation ─────────────────────────────────────────

async function runComposition(
	script: ScriptArtifact,
	scenePlan: ScenePlanArtifact,
	media: MediaArtifact,
	musicSync: MusicSyncArtifact,
	theme: string,
	outDir: string,
): Promise<CompositionArtifact> {
	console.log("\n▸ Stage 7: Remotion composition generation...\n");

	// Build the image map: sceneId → staticFile path
	const imageMap: Record<string, string> = {};
	for (const img of media.images) {
		imageMap[img.sceneId] = `images/${img.sceneId}.png`;
	}

	// Build the composition config JSON
	const config = {
		fps: scenePlan.fps,
		width: scenePlan.width,
		height: scenePlan.height,
		totalFrames: scenePlan.totalFrames,
		theme,
		titleCard: scenePlan.titleCard,
		scenes: scenePlan.scenes.map((s) => ({
			...s,
			imageUrl: imageMap[s.id] ?? undefined,
		})),
		endCard: scenePlan.endCard,
		audioFile: "mixed-audio.wav",
	};

	const configPath = join(outDir, "composition-config.json");
	await writeFile(configPath, JSON.stringify(config, null, 2));

	// Generate the render entry point (Root.tsx)
	const renderEntryPath = join(outDir, "render.tsx");
	const componentCode = generateRenderEntry(config, script);
	await writeFile(renderEntryPath, componentCode);

	// Copy media assets into a public folder next to the render entry
	const publicDir = join(outDir, "public");
	await mkdir(publicDir, { recursive: true });
	await copyFile(musicSync.mixedAudioPath, join(publicDir, "mixed-audio.wav"));

	const imagesPublicDir = join(publicDir, "images");
	await mkdir(imagesPublicDir, { recursive: true });
	for (const img of media.images) {
		await copyFile(img.path, join(imagesPublicDir, `${img.sceneId}.png`));
	}

	const compositionId = "FinancialVideo";
	log("Composition", `Entry: ${renderEntryPath}`);
	log("Composition", `Config: ${configPath}`);
	log(
		"Composition",
		`Public: ${publicDir} (${media.images.length} images + audio)`,
	);

	const artifact: CompositionArtifact = {
		renderEntryPath,
		configPath,
		compositionId,
		costUsd: 0,
	};
	await writeArtifact(
		"s21",
		"07-composition.json",
		JSON.stringify(artifact, null, 2),
	);
	return artifact;
}

function generateRenderEntry(config: any, script: ScriptArtifact): string {
	const scenes = config.scenes as any[];
	const themeVar = `${config.theme}Theme`;

	// Build scene render code
	const sceneRenders = scenes
		.map((s) => {
			const dataStr = JSON.stringify(s.data);
			const imageProp = s.imageUrl
				? `imageUrl={staticFile("${s.imageUrl}")}`
				: "";
			return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <SceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={theme} ${imageProp} />
      </Sequence>`;
		})
		.join("\n");

	return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import {
  ${themeVar} as theme,
  TitleCard,
  EndCard,
  BarChart,
  LineChart,
  PieChart,
  AnimatedList,
  CircularProgress,
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
} from "@automation/remotion-templates";

// ─── Scene Renderer ──────────────────────────────────────────────────────────

const SceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
}> = ({ slug, data, theme, imageUrl }) => {
  // Inject imageUrl into data if provided
  const fullData = imageUrl ? { ...data, imageUrl } : data;

  switch (slug) {
    case "bar-chart": return <BarChart data={fullData} theme={theme} />;
    case "line-chart": return <LineChart data={fullData} theme={theme} />;
    case "pie-chart": return <PieChart data={fullData} theme={theme} />;
    case "animated-list": return <AnimatedList data={fullData} theme={theme} />;
    case "circular-progress": return <CircularProgress data={fullData} theme={theme} />;
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
    default: return <AbsoluteFill style={{ background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><p>Unknown component: {slug}</p></AbsoluteFill>;
  }
};

// ─── Main Composition ────────────────────────────────────────────────────────

const FinancialVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* Title card */}
      <Sequence from={${config.titleCard.startFrame}} durationInFrames={${config.titleCard.endFrame - config.titleCard.startFrame}}>
        <TitleCard title="${escapeJs(config.titleCard.title)}" subtitle="${escapeJs(config.titleCard.subtitle)}" theme={theme} />
      </Sequence>

      {/* Content scenes */}
${sceneRenders}

      {/* End card */}
      <Sequence from={${config.endCard.startFrame}} durationInFrames={${config.endCard.endFrame - config.endCard.startFrame}}>
        <EndCard theme={theme} />
      </Sequence>

      {/* Mixed audio (narration + background music) */}
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FinancialVideo"
      component={FinancialVideo}
      durationInFrames={${config.totalFrames}}
      fps={${config.fps}}
      width={${config.width}}
      height={${config.height}}
    />
  );
};

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
}

function escapeJs(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ─── Stage 8: Render ─────────────────────────────────────────────────────────

async function runRender(
	composition: CompositionArtifact,
	outDir: string,
): Promise<RenderArtifact> {
	console.log("\n▸ Stage 8: Render (Remotion CLI)...\n");

	const videoPath = join(outDir, "financial-video.mp4");

	// Use Remotion CLI to render the composition
	// --public-dir points to the public folder with images + audio
	const publicDir = join(outDir, "public");
	const cmd = `npx remotion render "${composition.renderEntryPath}" "${composition.compositionId}" "${videoPath}" --public-dir="${publicDir}" --log=verbose`;

	log("Render", `Running: ${cmd}`);
	const { stdout, stderr } = await execAsync(cmd, {
		maxBuffer: 50 * 1024 * 1024,
	});

	// Get video duration + size
	const { stdout: probeOut } = await execAsync(
		`ffprobe -v quiet -print_format json -show_format "${videoPath}"`,
	);
	const probe = JSON.parse(probeOut);
	const durationSec = parseFloat(probe.format.duration);
	const sizeBytes = parseInt(probe.format.size);

	log(
		"Render",
		`Video: ${videoPath} (${durationSec.toFixed(1)}s, ${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
	);

	const artifact: RenderArtifact = {
		videoPath,
		durationSec,
		sizeBytes,
		costUsd: 0,
	};
	await writeArtifact(
		"s21",
		"08-render.json",
		JSON.stringify(artifact, null, 2),
	);
	return artifact;
}

// ─── Mock data generators (dry-run) ──────────────────────────────────────────

function generateMockResearch(topic: string): ResearchArtifact {
	return {
		topic,
		sources: [
			{
				id: "s1",
				title: "Federal Reserve Economic Data (FRED)",
				url: "https://fred.stlouisfed.org",
				excerpt:
					"Historical economic data including GDP, inflation, and unemployment rates.",
			},
			{
				id: "s2",
				title: "Bureau of Labor Statistics",
				url: "https://www.bls.gov",
				excerpt:
					"Official employment and price statistics for the United States.",
			},
			{
				id: "s3",
				title: "International Monetary Fund Reports",
				url: "https://www.imf.org",
				excerpt:
					"Global economic outlook and country-level financial assessments.",
			},
		],
		claims: [
			{
				id: "c1",
				claim: `${topic} had measurable impact on employment and GDP growth`,
				sourceIds: ["s1", "s2"],
				confidence: "high",
			},
			{
				id: "c2",
				claim: "Central bank policy responses were rapid and unprecedented",
				sourceIds: ["s1", "s3"],
				confidence: "high",
			},
			{
				id: "c3",
				claim: "Recovery timelines varied significantly across regions",
				sourceIds: ["s3"],
				confidence: "medium",
			},
		],
		allowedFacts: [
			`${topic} caused significant market volatility`,
			"Unemployment rose sharply during the peak crisis period",
			"GDP contracted for multiple consecutive quarters",
			"Central banks cut interest rates to near zero",
			"Government stimulus packages exceeded previous records",
			"Recovery took several years in most developed economies",
		],
		uncertainties: [
			"Long-term structural effects are still debated by economists",
			"The relative effectiveness of different policy responses remains contested",
		],
		warnings: [
			"Avoid making specific investment recommendations",
			"Present economic data with appropriate time context",
		],
		costUsd: 0,
	};
}

function generateMockScript(
	topic: string,
	theme: string,
	research: ResearchArtifact,
): ScriptArtifact {
	const title = topic.length > 40 ? topic.slice(0, 40) + "..." : topic;
	return {
		topic,
		title: title.split(" ").slice(0, 6).join(" "),
		subtitle: "A Financial Documentary",
		theme,
		narration: `${topic} reshaped the global economy in ways we still feel today. Markets plunged. Unemployment soared. Millions of families lost their savings and their homes. But what actually happened? The crisis began with a simple idea: that housing prices would always rise. Banks packaged risky mortgages into complex securities, rating agencies stamped them as safe, and investors bought them by the billions. When the housing bubble burst, the entire financial system froze. Banks stopped lending. Businesses couldn't make payroll. The government responded with the largest bailout in history, injecting hundreds of billions into the financial system. The recovery was slow and uneven. Some regions bounced back within two years. Others took nearly a decade. The crisis exposed deep flaws in how we regulate finance, and it changed the way central banks think about risk forever.`,
		scenes: [
			{
				id: "scene1",
				componentSlug: "title-card",
				narrationSegment: "",
				title: title.split(" ").slice(0, 6).join(" "),
				data: {
					title: title.split(" ").slice(0, 6).join(" "),
					subtitle: "A Financial Documentary",
				},
				needsImage: false,
				narrativeRole: "intro",
			},
			{
				id: "scene2",
				componentSlug: "hook-headline",
				narrationSegment: `${topic} reshaped the global economy in ways we still feel today. Markets plunged. Unemployment soared. Millions of families lost their savings and their homes.`,
				title: "When the Economy Stopped",
				data: {
					kicker: "FINANCIAL CRISIS",
					headline: "When the Economy Stopped",
					emphasis: "Millions Lost Everything",
					context:
						"Markets plunged and unemployment soared as the global financial system froze.",
				},
				needsImage: true,
				imagePrompt:
					"Dramatic financial district skyline at dusk, empty trading floor with red screens showing falling numbers, cinematic documentary photography, moody lighting",
				narrativeRole: "hook",
			},
			{
				id: "scene3",
				componentSlug: "bar-chart",
				narrationSegment:
					"But what actually happened? The crisis began with a simple idea: that housing prices would always rise. Banks packaged risky mortgages into complex securities, rating agencies stamped them as safe, and investors bought them by the billions.",
				title: "Mortgage Delinquency Rate (%)",
				data: {
					title: "Mortgage Delinquency Rate (%)",
					yAxisLabel: "Percent",
					maxValue: 12,
					bars: [
						{ label: "2006", value: 2.5 },
						{ label: "2007", value: 3.5 },
						{ label: "2008", value: 7.5 },
						{ label: "2009", value: 10.0 },
						{ label: "2010", value: 9.5 },
					],
				},
				needsImage: false,
				narrativeRole: "fact",
			},
			{
				id: "scene4",
				componentSlug: "line-chart",
				narrationSegment:
					"When the housing bubble burst, the entire financial system froze. Banks stopped lending. Businesses couldn't make payroll.",
				title: "GDP Growth Rate (Annual %)",
				data: {
					title: "GDP Growth Rate (Annual %)",
					yAxisLabel: "Percent",
					maxValue: 4,
					points: [
						{ label: "2006", value: 2.8 },
						{ label: "2007", value: 2.0 },
						{ label: "2008", value: -0.1 },
						{ label: "2009", value: -2.8 },
						{ label: "2010", value: 2.5 },
						{ label: "2011", value: 1.6 },
					],
				},
				needsImage: false,
				narrativeRole: "evidence",
			},
			{
				id: "scene5",
				componentSlug: "circular-progress",
				narrationSegment:
					"The government responded with the largest bailout in history, injecting hundreds of billions into the financial system.",
				title: "Emergency Bailout as % of GDP",
				data: {
					title: "Emergency Bailout as % of GDP",
					percentage: 25,
					label:
						"The bailout package equaled roughly a quarter of annual economic output.",
					sublabel: "of GDP",
				},
				needsImage: false,
				narrativeRole: "fact",
			},
			{
				id: "scene6",
				componentSlug: "conclusion-card",
				narrationSegment:
					"The recovery was slow and uneven. Some regions bounced back within two years. Others took nearly a decade. The crisis exposed deep flaws in how we regulate finance, and it changed the way central banks think about risk forever.",
				title: "Lessons for the Future",
				data: {
					conclusion: "The crisis changed financial regulation forever.",
					takeaway:
						"It exposed deep flaws in how we regulate finance and changed the way central banks think about risk. The question is whether we've learned enough to prevent the next one.",
					closingQuestion: "Are we better prepared today?",
				},
				needsImage: false,
				narrativeRole: "conclusion",
			},
			{
				id: "scene7",
				componentSlug: "end-card",
				narrationSegment: "",
				title: "",
				data: {},
				needsImage: false,
				narrativeRole: "outro",
			},
		],
		costUsd: 0,
	};
}

// ─── Placeholder generators (dry-run) ────────────────────────────────────────

// CRC32 table for PNG chunks (computed once at module load)
const CRC_TABLE: number[] = (() => {
	const table = new Array<number>(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
	const typeBuf = Buffer.from(type, "ascii");
	const lengthBuf = Buffer.alloc(4);
	lengthBuf.writeUInt32BE(data.length, 0);
	const crc = crc32(Buffer.concat([typeBuf, data]));
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc >>> 0, 0);
	return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function generatePlaceholderPng(width: number, height: number): Buffer {
	// Minimal valid PNG — solid dark gray
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8;
	ihdrData[9] = 2;
	ihdrData[10] = 0;
	ihdrData[11] = 0;
	ihdrData[12] = 0;

	const rowSize = 1 + width * 3;
	const rawData = Buffer.alloc(rowSize * height);
	for (let y = 0; y < height; y++) {
		const offset = y * rowSize;
		rawData[offset] = 0;
		for (let x = 0; x < width; x++) {
			const px = offset + 1 + x * 3;
			rawData[px] = 40;
			rawData[px + 1] = 40;
			rawData[px + 2] = 50;
		}
	}
	const compressed = deflateSync(rawData);

	return Buffer.concat([
		signature,
		makePngChunk("IHDR", ihdrData),
		makePngChunk("IDAT", compressed),
		makePngChunk("IEND", Buffer.alloc(0)),
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

// ─── Main ────────────────────────────────────────────────────────────────────

export async function run(): Promise<SpikeResult> {
	await loadEnv();

	const topic = process.argv[2] ?? "The 2008 Financial Crisis";
	const theme = process.argv[3] ?? "archive";

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log(`  S21 — Financial Video Generation Spike`);
	console.log(`  Topic: "${topic}"`);
	console.log(`  Theme: ${theme}`);
	console.log(
		`  Dry-run: ${isDryRun() ? "YES (no paid calls)" : "NO (real API calls)"}`,
	);
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const outDir = await spikeDir("s21");
	const apiKey = process.env.GEMINI_API_KEY ?? "";
	const client = new GeminiClient(apiKey);

	// Track total cost
	let totalCostUsd = 0;
	const stageCosts: Record<string, number> = {};

	// ─── Stage 1: Research ─────────────────────────────────────────────────────
	const research = await runResearch(client, topic, outDir);
	totalCostUsd += research.costUsd;
	stageCosts.research = research.costUsd;

	// ─── Stage 2: Script ───────────────────────────────────────────────────────
	const script = await runScript(client, topic, theme, research, outDir);
	totalCostUsd += script.costUsd;
	stageCosts.script = script.costUsd;

	// ─── Stage 3: Scene Plan (needs narration duration — estimate from script) ─
	// Estimate narration duration: ~15 chars per second of speech
	const estimatedNarrationSec = Math.max(
		10,
		Math.ceil(script.narration.length / 15),
	);
	const scenePlan = await runScenePlan(script, estimatedNarrationSec, outDir);
	totalCostUsd += scenePlan.costUsd;
	stageCosts.scenePlan = scenePlan.costUsd;

	// ─── Stage 4: Media ────────────────────────────────────────────────────────
	const media = await runMedia(script, apiKey, outDir);
	totalCostUsd += media.totalCostUsd;
	stageCosts.media = media.totalCostUsd;

	// ─── Stage 5: Narration ────────────────────────────────────────────────────
	const narration = await runNarration(script.narration, apiKey, outDir);
	totalCostUsd += narration.costUsd;
	stageCosts.narration = narration.costUsd;

	// Re-compute scene plan with actual narration duration
	const actualScenePlan = await runScenePlan(
		script,
		narration.durationSec,
		outDir,
	);

	// ─── Stage 6: Music Sync ───────────────────────────────────────────────────
	const musicSync = await runMusicSync(
		narration.wavPath,
		narration.durationSec,
		outDir,
	);
	totalCostUsd += musicSync.costUsd;
	stageCosts.musicSync = musicSync.costUsd;

	// ─── Stage 7: Composition ──────────────────────────────────────────────────
	const composition = await runComposition(
		script,
		actualScenePlan,
		media,
		musicSync,
		theme,
		outDir,
	);
	totalCostUsd += composition.costUsd;
	stageCosts.composition = composition.costUsd;

	// ─── Stage 8: Render ───────────────────────────────────────────────────────
	let render: RenderArtifact | null = null;
	try {
		render = await runRender(composition, outDir);
		totalCostUsd += render.costUsd;
		stageCosts.render = render.costUsd;
	} catch (err) {
		console.error(`\n✗ Render failed: ${err}`);
		log(
			"Render",
			"Render step failed — composition artifacts are still available for manual rendering",
		);
	}

	// ─── Summary ───────────────────────────────────────────────────────────────
	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("  SPIKE SUMMARY");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);
	console.log(`  Topic:    "${topic}"`);
	console.log(`  Theme:    ${theme}`);
	console.log(`  Dry-run:  ${isDryRun() ? "YES" : "NO"}`);
	console.log(`  Scenes:   ${script.scenes.length}`);
	console.log(`  Images:   ${media.images.length}`);
	console.log(`  Narration: ${narration.durationSec.toFixed(1)}s`);
	console.log(
		`  Total frames: ${actualScenePlan.totalFrames} (${(actualScenePlan.totalFrames / FPS).toFixed(1)}s)`,
	);
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
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const artifactPaths = [
		join(outDir, "01-research.json"),
		join(outDir, "02-script.json"),
		join(outDir, "03-scene-plan.json"),
		join(outDir, "04-media.json"),
		join(outDir, "05-narration.json"),
		join(outDir, "06-music-sync.json"),
		join(outDir, "07-composition.json"),
		join(outDir, "composition-config.json"),
		join(outDir, "render.tsx"),
	];
	if (render) artifactPaths.push(render.videoPath);

	return {
		id: "s21",
		name: "Financial Video Generation",
		goal: `Generate a complete financial documentary video from topic "${topic}" with theme ${theme}`,
		result: render ? "pass" : "partial",
		measurements: {
			topic,
			theme,
			dryRun: isDryRun(),
			scenes: script.scenes.length,
			images: media.images.length,
			narrationDurationSec: narration.durationSec.toFixed(1),
			totalFrames: actualScenePlan.totalFrames,
			videoDurationSec: render?.durationSec.toFixed(1) ?? "N/A",
			videoSizeMB: render ? (render.sizeBytes / 1024 / 1024).toFixed(1) : "N/A",
			totalCostUsd: totalCostUsd.toFixed(4),
			researchCostUsd: stageCosts.research?.toFixed(4) ?? "0",
			scriptCostUsd: stageCosts.script?.toFixed(4) ?? "0",
			mediaCostUsd: stageCosts.media?.toFixed(4) ?? "0",
			narrationCostUsd: stageCosts.narration?.toFixed(4) ?? "0",
		},
		notes: render
			? `Complete video generated: ${render.durationSec.toFixed(1)}s, ${(render.sizeBytes / 1024 / 1024).toFixed(1)} MB. Used ${script.scenes.length} Remotion template components.`
			: `Composition artifacts generated but render failed. Manual render: npx remotion render ${composition.renderEntryPath} ${composition.compositionId} out.mp4 --public-dir=${outDir}/public`,
		artifactPaths,
	};
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
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
