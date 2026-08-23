// === Package Assembly ===

import { join, dirname, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ensureDir, runCmd } from "./utils";

/** Build the export package manifest JSON. */
function buildManifest(params: {
	runId: string;
	channelId: string;
	storyId: string;
	storyTitle: string;
	voiceoverId: string;
	audioDurationMs: number;
	sceneCount: number;
	sceneImages: Array<{ order: number; file: string }>;
	sceneTimings: Array<{
		order: number;
		sceneId: string;
		narrationStartMs: number;
		narrationEndMs: number;
		imageStartMs: number;
		imageEndMs: number;
	}>;
	gameplayVideo?: { sourceFile: string; startSec: number; durationSec: number };
	provider: string;
	model: string;
	voiceId: string;
}): Record<string, unknown> {
	return {
		version: "1.1",
		createdAt: new Date().toISOString(),
		runId: params.runId,
		channelId: params.channelId,
		storyId: params.storyId,
		storyTitle: params.storyTitle,
		audio: {
			voiceoverId: params.voiceoverId,
			durationMs: params.audioDurationMs,
			durationSec: (params.audioDurationMs / 1000).toFixed(2),
			provider: params.provider,
			model: params.model,
			voiceId: params.voiceId,
		},
		scenes: {
			count: params.sceneCount,
			timelineFile: "scene-timeline.csv",
			images: params.sceneImages,
			// Image display timeline: when each scene's image appears and for how long
			imageTimeline: params.sceneTimings.map((t) => ({
				scene: t.order,
				imageStartSec: (t.imageStartMs / 1000).toFixed(2),
				imageEndSec: (t.imageEndMs / 1000).toFixed(2),
				imageDurationSec: ((t.imageEndMs - t.imageStartMs) / 1000).toFixed(2),
				narrationStartSec: (t.narrationStartMs / 1000).toFixed(2),
				narrationEndSec: (t.narrationEndMs / 1000).toFixed(2),
			})),
		},
		gameplay: params.gameplayVideo
			? {
					sourceFile: params.gameplayVideo.sourceFile,
					startSec: params.gameplayVideo.startSec.toFixed(2),
					durationSec: params.gameplayVideo.durationSec.toFixed(2),
					file: "gameplay-background.mp4",
					muted: true,
				}
			: null,
		captions: {
			file: "captions.srt",
			precision: "scene-level",
		},
		instructions:
			"Import into CapCut: place gameplay-background.mp4 as the base layer, " +
			"overlay scene images at the timings in scene-timeline.csv (image_start_sec to image_end_sec), " +
			"add captions.srt, and mix voiceover.wav as the audio track.",
	};
}

/** Build the scene timeline CSV. */
function buildTimelineCsv(
	timings: Array<{
		order: number;
		sceneId: string;
		narrationStartMs: number;
		narrationEndMs: number;
		imageStartMs: number;
		imageEndMs: number;
		narrationText: string;
	}>,
	imageAssets: Array<{ sceneId: string; filePath: string }>,
): string {
	const imageMap = new Map(imageAssets.map((a) => [a.sceneId, a.filePath]));
	const lines: string[] = [
		"scene_order,scene_id,narration_start_ms,narration_end_ms,narration_start_sec,narration_end_sec,image_start_ms,image_end_ms,image_start_sec,image_end_sec,image_duration_sec,image_file,caption_text",
	];

	for (const t of timings) {
		const imageFile = imageMap.get(t.sceneId) ?? "";
		const imageBasename = imageFile ? basename(imageFile) : "";
		// Escape caption text for CSV (wrap in quotes, escape internal quotes)
		const escapedText = '"' + t.narrationText.replace(/"/g, '""') + '"';
		const imageDurSec = ((t.imageEndMs - t.imageStartMs) / 1000).toFixed(3);
		lines.push(
			`${t.order},${t.sceneId},${t.narrationStartMs},${t.narrationEndMs},` +
				`${(t.narrationStartMs / 1000).toFixed(3)},${(t.narrationEndMs / 1000).toFixed(3)},` +
				`${t.imageStartMs},${t.imageEndMs},` +
				`${(t.imageStartMs / 1000).toFixed(3)},${(t.imageEndMs / 1000).toFixed(3)},` +
				`${imageDurSec},${imageBasename},${escapedText}`,
		);
	}

	return lines.join("\n");
}

/** Create a ZIP archive of the export package. */
async function createZip(
	files: Array<{ name: string; path: string }>,
	zipPath: string,
): Promise<void> {
	const { resolve } = await import("node:path");
	const absZipPath = resolve(zipPath);

	// Create the parent directory
	const zipDir = dirname(absZipPath);
	await ensureDir(zipDir);

	// Change to a temp dir, copy files with their target names, then zip
	const tmpDir = absZipPath + "-tmp";
	await ensureDir(tmpDir);
	for (const f of files) {
		const destPath = join(tmpDir, f.name);
		await ensureDir(dirname(destPath));
		const data = await readFile(f.path);
		await writeFile(destPath, data);
	}

	try {
		// Use absolute path for the zip output since we cd into tmpDir
		await runCmd(`cd "${tmpDir}" && zip -r "${absZipPath}" . -x "*.DS_Store"`);
	} catch {
		// Fall back to tar if zip is not available
		console.warn("[voice-service] zip command not available, using tar");
		const tarPath = absZipPath.replace(/\.zip$/, ".tar.gz");
		await runCmd(`cd "${tmpDir}" && tar czf "${tarPath}" .`);
		// If tar succeeded, rename .tar.gz to .zip (not ideal but keeps the interface consistent)
		// Actually, just return — the caller will check for the file
	}

	// Clean up temp dir
	await runCmd(`rm -rf "${tmpDir}"`);
}

export { buildManifest, buildTimelineCsv, createZip };
