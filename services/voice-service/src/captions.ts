// === SRT Generation ===

/** Generate an SRT caption file from scene timing records. */
function generateSrt(
	timings: Array<{
		sceneId: string;
		order: number;
		startMs: number;
		endMs: number;
		narrationText: string;
	}>,
): string {
	const lines: string[] = [];

	for (let i = 0; i < timings.length; i++) {
		const t = timings[i]!;
		lines.push(String(i + 1));
		lines.push(formatSrtTime(t.startMs) + " --> " + formatSrtTime(t.endMs));
		lines.push(t.narrationText);
		lines.push(""); // blank line between entries
	}

	return lines.join("\n");
}

/** Format milliseconds as SRT time: HH:MM:SS,mmm */
function formatSrtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const millis = ms % 1000;
	const hours = Math.floor(totalSec / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	const seconds = totalSec % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export { generateSrt, formatSrtTime };
