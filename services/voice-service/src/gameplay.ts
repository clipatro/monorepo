// === Gameplay Video Cutting ===

import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { runCmd, probeVideo } from "./utils";

/**
 * Cut a muted gameplay video segment matching the audio duration.
 *
 * Picks a random gameplay video from the configured directory, selects a random
 * start point in the middle of the video, and cuts a segment of the specified
 * duration. The output video is muted (no audio track).
 */
async function cutGameplayVideo(
	gameplayDir: string,
	durationSec: number,
	outputPath: string,
): Promise<{ sourceFile: string; startSec: number; durationSec: number }> {
	// List all video files in the gameplay directory
	const files = await readdir(gameplayDir);
	const videoFiles = files.filter((f) => {
		const ext = extname(f).toLowerCase();
		return [".mp4", ".mkv", ".webm", ".mov", ".avi"].includes(ext);
	});

	if (videoFiles.length === 0) {
		throw new Error(`No gameplay videos found in ${gameplayDir}`);
	}

	// Pick a random video
	const randomFile = videoFiles[Math.floor(Math.random() * videoFiles.length)]!;
	const videoPath = join(gameplayDir, randomFile);

	// Probe the video duration
	const videoInfo = await probeVideo(videoPath);
	const videoDuration = videoInfo.durationSec;

	if (videoDuration <= 0) {
		throw new Error(`Could not determine duration of ${randomFile}`);
	}

	// If the video is shorter than the requested duration, use the whole video
	let startSec: number;
	let cutDuration: number;

	if (videoDuration <= durationSec) {
		// Video is shorter — use the whole thing
		startSec = 0;
		cutDuration = videoDuration;
	} else {
		// Pick a random start point in the middle (avoid first/last 10%)
		const margin = videoDuration * 0.1;
		const availableStart = videoDuration - durationSec - 2 * margin;
		if (availableStart > 0) {
			startSec = margin + Math.random() * availableStart;
		} else {
			// Not enough margin — just start at 0
			startSec = 0;
		}
		cutDuration = durationSec;
	}

	// Re-encode the segment with libx264 for a clean cut.
	//
	// Why re-encode instead of -c:v copy:
	//   Stream copy (-c:v copy) with seeking cuts at the nearest keyframe, not
	//   the exact frame. The first frames reference P/B frames that depend on a
	//   keyframe that wasn't included → distorted pixels until the next keyframe.
	//   CapCut also struggles with stream-copied files that have broken timestamps.
	//
	// Key settings:
	//   -ss AFTER -i    → accurate frame-level seeking (slower but no distortion)
	//   -r 60           → force 60fps CFR (constant frame rate) for smooth editing
	//   -pix_fmt yuv420p → broad compatibility (VLC, CapCut, Premiere, etc.)
	//   -crf 18         → visually lossless quality
	//   -preset fast    → good speed/quality balance
	//   -g 60           → keyframe every 1 second at 60fps (good for editing)
	//   -movflags +faststart → moov atom at front for fast playback
	//   -an             → drop audio (gameplay is muted)
	const targetFps = 60;
	await runCmd(
		`ffmpeg -y -i "${videoPath}" -ss ${startSec.toFixed(3)} -t ${cutDuration.toFixed(3)} ` +
			`-an -c:v libx264 -preset fast -crf 18 ` +
			`-r ${targetFps} -g ${targetFps} -pix_fmt yuv420p ` +
			`-movflags +faststart "${outputPath}"`,
	);

	return { sourceFile: randomFile, startSec, durationSec: cutDuration };
}

export { cutGameplayVideo };
