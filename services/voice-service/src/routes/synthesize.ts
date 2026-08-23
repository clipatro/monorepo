import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
	SceneRow,
	StoryRow,
	ChannelRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";

import { synthesizeSchema } from "../schemas";
import type { NarrationSegment, SegmentTimingResult } from "../types";
import { KOKORO_MODEL, KOKORO_VOICE, GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, CHATTERBOX_MODEL, CHATTERBOX_VOICE } from "../constants";
import { uuid, ensureDir, probeDuration } from "../utils";
import { generateWithKokoro } from "../adapters/kokoro";
import { generateWithGeminiTts } from "../adapters/gemini-tts";
import { generateWithChatterbox } from "../adapters/chatterbox";
import { normalizeAudio, generatePauseFile, concatenateAudio } from "../audio";

// === POST /synthesize — generate voice-over from scene narration ===

export function registerSynthesizeRoutes(app: Hono, config: AppConfig): void {
	const db = getDb();

	app.post("/synthesize", zValidator("json", synthesizeSchema), async (c) => {
		const {
			storyId,
			runId,
			stepId,
			provider,
			voiceId,
			interSegmentPauseMs,
			estimateOnly,
		} = c.req.valid("json");

		// Load the story and its scenes
		const story = await db
			.prepare("SELECT * FROM stories WHERE id = ?")
			.get(storyId) as StoryRow | null;
		if (!story) return c.json({ error: "Story not found" }, 404);

		const channel = await db
			.prepare("SELECT * FROM channels WHERE id = ?")
			.get(story.channel_id) as ChannelRow | null;
		if (!channel) return c.json({ error: "Channel not found" }, 404);

		const scenes = await db
			.prepare('SELECT * FROM scenes WHERE story_id = ? ORDER BY "order" ASC')
			.all(storyId) as SceneRow[];
		if (scenes.length === 0)
			return c.json({ error: "No scenes found — plan scenes first" }, 400);

		// Build narration segments
		const segments: NarrationSegment[] = scenes.map((s) => ({
			sceneId: s.id,
			order: s.order,
			text: s.narration_text,
		}));

		// Compute cost estimate before any paid calls.
		// Kokoro and Chatterbox are free; Gemini TTS is paid.
		const willUseGemini = provider === "gemini";
		const willUseChatterbox = provider === "chatterbox";
		const estimatedCostPerSegment = willUseGemini ? 0.01 : 0;
		const estimatedTotalCostUsd = segments.length * estimatedCostPerSegment;

		// In estimate-only mode, return the cost breakdown without synthesizing.
		if (estimateOnly) {
			const estProvider = willUseGemini ? "gemini" : willUseChatterbox ? "chatterbox" : "kokoro";
			const estModel = willUseGemini ? GEMINI_TTS_MODEL : willUseChatterbox ? CHATTERBOX_MODEL : KOKORO_MODEL;
			return c.json({
				storyId,
				sceneCount: segments.length,
				provider: estProvider,
				model: estModel,
				estimatedTotalCostUsd,
				note: willUseGemini
					? "Gemini TTS is paid. Estimate is conservative; actual cost depends on token counts."
					: willUseChatterbox
						? "Chatterbox is self-hosted and free. Cost is $0."
						: "Kokoro is local and free. Cost is $0. Gemini TTS fallback (if Kokoro fails) would add ~$0.01/segment.",
				budget: {
					perRun: config.costBudgetPerRun,
					perDay: config.costBudgetPerDay,
					global: config.costBudgetGlobal,
				},
			});
		}

		// Enforce target duration from channel config (±25% tolerance)
		const targetDuration = channel.target_duration_seconds;
		const minDuration = Math.round(targetDuration * 0.75);
		const maxDuration = Math.round(targetDuration * 1.25);
		const effectiveRunId = runId ?? "manual";

		// Create output directory
		const outputDir = join(
			config.artifactStorePath,
			"channels",
			channel.id,
			"runs",
			effectiveRunId,
			"audio",
		);
		await ensureDir(outputDir);

		// Determine which provider to use.
		// "auto" defaults to kokoro, with fallback to gemini on failure.
		// "chatterbox" uses the Chatterbox TTS API (self-hosted, free).
		// "gemini" uses Gemini TTS (paid).
		type TtsProvider = "kokoro" | "gemini" | "chatterbox";
		let activeProvider: TtsProvider = provider === "gemini" ? "gemini" : provider === "chatterbox" ? "chatterbox" : "kokoro";
		let actualProvider = activeProvider;
		let actualModel = activeProvider === "gemini" ? GEMINI_TTS_MODEL : activeProvider === "chatterbox" ? CHATTERBOX_MODEL : KOKORO_MODEL;
		let actualVoiceId = voiceId ?? (activeProvider === "gemini" ? GEMINI_TTS_VOICE : activeProvider === "chatterbox" ? CHATTERBOX_VOICE : KOKORO_VOICE);
		let totalCostUsd = 0;

		// Generate per-scene audio segments
		const segmentPaths: string[] = [];
		const segmentTimings: Array<{
			sceneId: string;
			order: number;
			durationMs: number;
			segmentFile: string;
			narrationText: string;
		}> = [];

		for (const seg of segments) {
			const segPath = join(
				outputDir,
				`scene-${String(seg.order).padStart(2, "0")}.wav`,
			);

			try {
				if (activeProvider === "kokoro") {
					await generateWithKokoro(seg.text, segPath, actualVoiceId);
				} else if (activeProvider === "chatterbox") {
					await generateWithChatterbox(seg.text, segPath, actualVoiceId);
				} else {
					const result = await generateWithGeminiTts(
						config.geminiApiKey ?? "",
						seg.text,
						segPath,
						actualVoiceId,
						runId,
						stepId,
						{
							locale: channel.locale,
							style: channel.story_style || "direct, conversational, and emotionally restrained",
						},
					);
					totalCostUsd += result.costUsd;
				}
			} catch (err) {
				// If Kokoro or Chatterbox fails in auto mode, fall back to Gemini TTS
				if ((activeProvider === "kokoro" || activeProvider === "chatterbox") && provider === "auto") {
					console.warn(
						`[voice-service] ${activeProvider} failed, falling back to Gemini TTS: ${err instanceof Error ? err.message : String(err)}`,
					);
					activeProvider = "gemini";
					actualProvider = "gemini";
					actualModel = GEMINI_TTS_MODEL;
					actualVoiceId = voiceId ?? GEMINI_TTS_VOICE;
					const result = await generateWithGeminiTts(
						config.geminiApiKey ?? "",
						seg.text,
						segPath,
						actualVoiceId,
						runId,
						stepId,
						{
							locale: channel.locale,
							style: channel.story_style || "direct, conversational, and emotionally restrained",
						},
					);
					totalCostUsd += result.costUsd;
				} else {
					throw err;
				}
			}

			segmentPaths.push(segPath);

			// Probe the segment duration
			const durSec = await probeDuration(segPath);
			segmentTimings.push({
				sceneId: seg.sceneId,
				order: seg.order,
				durationMs: Math.round(durSec * 1000),
				segmentFile: segPath,
				narrationText: seg.text,
			});
		}

		// Generate pause file
		const sampleRate = 22050;
		const pausePath = join(outputDir, "pause.wav");
		await generatePauseFile(pausePath, interSegmentPauseMs, sampleRate);

		// Concatenate segments with pauses
		const rawMasterPath = join(outputDir, "voiceover-raw.wav");
		await concatenateAudio(segmentPaths, pausePath, rawMasterPath);

		// Normalize the master audio
		const masterPath = join(outputDir, "voiceover.wav");
		await normalizeAudio(rawMasterPath, masterPath);

		// Probe the final master duration
		const masterDurationSec = await probeDuration(masterPath);
		const masterDurationMs = Math.round(masterDurationSec * 1000);

		// Check if duration is within target range (based on channel config)
		const durationWarning =
			masterDurationSec < minDuration || masterDurationSec > maxDuration
				? `Duration ${masterDurationSec.toFixed(1)}s outside target range ${minDuration}-${maxDuration}s (channel target: ${targetDuration}s)`
				: null;
		if (durationWarning) {
			console.warn(`[voice-service] ${durationWarning}`);
		}

		// Record the voiceover in the database
		const voiceoverId = uuid();
		await db.prepare(`
      INSERT INTO voiceovers (id, run_id, story_id, master_path, duration_ms, sample_rate, provider, model, voice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
			voiceoverId,
			effectiveRunId,
			storyId,
			masterPath,
			masterDurationMs,
			sampleRate,
			actualProvider,
			actualModel,
			actualVoiceId,
		);

		// Compute cumulative scene timings and image display windows.
		// Image for scene N is displayed from the start of scene N's narration
		// to the start of scene N+1's narration (or end of audio for the last scene).
		// This ensures images fill the entire video with no gaps.
		let cursorMs = 0;
		const timings: SegmentTimingResult[] = [];
		for (let i = 0; i < segmentTimings.length; i++) {
			const st = segmentTimings[i]!;
			const startMs = cursorMs;
			const endMs = startMs + st.durationMs;
			timings.push({
				sceneId: st.sceneId,
				order: st.order,
				startMs,
				endMs,
				durationMs: st.durationMs,
				segmentFile: st.segmentFile,
				narrationText: st.narrationText,
			});
			cursorMs = endMs + interSegmentPauseMs;
		}

		// Store timing records with proper image display windows.
		// Image for scene N: from narration_start_ms to next scene's narration_start_ms
		// (or masterDurationMs for the last scene — image stays until audio ends).
		for (let i = 0; i < timings.length; i++) {
			const t = timings[i]!;
			const nextStartMs = i < timings.length - 1
				? timings[i + 1]!.startMs
				: masterDurationMs;
			const timingId = uuid();
			await db.prepare(`
        INSERT INTO timings (id, scene_id, voiceover_id, narration_start_ms, narration_end_ms,
          recommended_image_start_ms, recommended_image_end_ms, audio_segment_file, narration_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
				timingId,
				t.sceneId,
				voiceoverId,
				t.startMs,
				t.endMs,
				t.startMs,        // image starts when narration starts
				nextStartMs,      // image stays until next scene begins (or audio ends)
				t.segmentFile,
				t.narrationText,
			);
		}

		return c.json(
			{
				voiceoverId,
				storyId,
				masterPath,
				durationMs: masterDurationMs,
				durationSec: masterDurationSec.toFixed(2),
				provider: actualProvider,
				model: actualModel,
				voiceId: actualVoiceId,
				costUsd: totalCostUsd,
				estimatedCostUsd: estimatedTotalCostUsd,
				sceneCount: segments.length,
				timings: timings.map((t) => ({
					sceneId: t.sceneId,
					order: t.order,
					startMs: t.startMs,
					endMs: t.endMs,
					durationMs: t.durationMs,
				})),
				warning: durationWarning,
			},
			201,
		);
	});
}
