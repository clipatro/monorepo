// === Audio Processing ===

import { writeFile } from "node:fs/promises";
import { runCmd } from "./utils";
import { NORMALIZED_LOUDNESS } from "./constants";

/** Normalize audio loudness using FFmpeg loudnorm filter. */
async function normalizeAudio(
	inputPath: string,
	outputPath: string,
): Promise<void> {
	await runCmd(
		`ffmpeg -y -i "${inputPath}" -af "${NORMALIZED_LOUDNESS}" -c:a pcm_s16le "${outputPath}"`,
	);
}

/** Generate a silent pause WAV file. */
async function generatePauseFile(
	path: string,
	durationMs: number,
	sampleRate: number,
): Promise<void> {
	await runCmd(
		`ffmpeg -y -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=${sampleRate}" ` +
			`-t ${durationMs / 1000} -c:a pcm_s16le "${path}"`,
	);
}

/** Concatenate audio files with pauses between them using FFmpeg concat demuxer. */
async function concatenateAudio(
	segmentPaths: string[],
	pausePath: string,
	outputPath: string,
): Promise<void> {
	const listPath = outputPath.replace(/\.wav$/, "-concat-list.txt");
	const { resolve } = await import("node:path");
	const lines: string[] = [];
	for (let i = 0; i < segmentPaths.length; i++) {
		// Use absolute paths — ffmpeg concat demuxer resolves relative paths
		// relative to the list file's directory, not the CWD
		lines.push(`file '${resolve(segmentPaths[i]!)}'`);
		if (i < segmentPaths.length - 1) lines.push(`file '${resolve(pausePath)}'`);
	}
	await writeFile(listPath, lines.join("\n"), "utf-8");
	await runCmd(
		`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a pcm_s16le "${outputPath}"`,
	);
}

export { normalizeAudio, generatePauseFile, concatenateAudio };
