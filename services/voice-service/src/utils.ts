import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

const execAsync = promisify(exec);

// === Helpers ===

function uuid(): string {
	return crypto.randomUUID();
}

/** Execute a shell command with a large buffer for video/audio processing. */
async function runCmd(
	cmd: string,
): Promise<{ stdout: string; stderr: string }> {
	return execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });
}

/** Get duration in seconds via ffprobe. */
async function probeDuration(path: string): Promise<number> {
	const { stdout } = await runCmd(
		`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
	);
	return parseFloat(stdout.trim());
}

/** Get audio stream info via ffprobe. */
async function probeAudio(
	path: string,
): Promise<{ sampleRate: number; channels: number; codec: string }> {
	const { stdout } = await runCmd(
		`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels,codec_name -of csv=p=0 "${path}"`,
	);
	const parts = stdout.trim().split(",");
	return {
		codec: parts[0] ?? "unknown",
		sampleRate: parseInt(parts[1] ?? "0", 10),
		channels: parseInt(parts[2] ?? "0", 10),
	};
}

/** Get video stream info via ffprobe. */
async function probeVideo(
	path: string,
): Promise<{
	width: number;
	height: number;
	durationSec: number;
	codec: string;
	fps: number;
}> {
	// ffprobe outputs stream entries and format entries on separate lines with csv=p=0
	// Line 1: width,height,codec_name,r_frame_rate (from stream)
	// Line 2: duration (from format)
	const { stdout } = await runCmd(
		`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate -show_entries format=duration -of csv=p=0 "${path}"`,
	);
	const lines = stdout.trim().split("\n");
	const streamParts = (lines[0] ?? "").trim().split(",");
	const formatLine = (lines[1] ?? "").trim();
	// r_frame_rate is a fraction like "60/1" or "30000/1001"
	const fpsStr = streamParts[3] ?? "0/1";
	const [num, den] = fpsStr.split("/");
	const fps = den && parseFloat(den) > 0 ? parseFloat(num ?? "0") / parseFloat(den) : 0;
	return {
		width: parseInt(streamParts[0] ?? "0", 10),
		height: parseInt(streamParts[1] ?? "0", 10),
		codec: streamParts[2] ?? "unknown",
		fps,
		durationSec: parseFloat(formatLine || "0"),
	};
}

/** Ensure a directory exists. */
async function ensureDir(path: string): Promise<void> {
	if (!existsSync(path)) {
		await mkdir(path, { recursive: true });
	}
}

/** Compute SHA-256 checksum of a file. */
async function fileChecksum(path: string): Promise<string> {
	const buf = await readFile(path);
	return createHash("sha256").update(buf).digest("hex");
}

export { uuid, runCmd, probeDuration, probeAudio, probeVideo, ensureDir, fileChecksum };
