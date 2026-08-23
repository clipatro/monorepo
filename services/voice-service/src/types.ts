// === Types ===

interface NarrationSegment {
	sceneId: string;
	order: number;
	text: string;
}

interface SegmentTimingResult {
	sceneId: string;
	order: number;
	startMs: number;
	endMs: number;
	durationMs: number;
	segmentFile: string;
	narrationText: string;
}

interface KokoroInstance {
	generate: (
		text: string,
		opts: { voice: string; speed?: number },
	) => {
		save: (path: string) => void;
		toBuffer: () => Buffer;
	};
}

export type { NarrationSegment, SegmentTimingResult, KokoroInstance };
