import { z } from "zod";
import { DEFAULT_INTER_SEGMENT_PAUSE_MS } from "./constants";

// === Zod schemas ===

const synthesizeSchema = z.object({
	storyId: z.string().min(1),
	runId: z.string().optional(),
	stepId: z.string().optional(),
	provider: z.enum(["kokoro", "gemini", "chatterbox", "auto"]).default("auto"),
	voiceId: z.string().optional(),
	interSegmentPauseMs: z
		.number()
		.min(0)
		.max(5000)
		.default(DEFAULT_INTER_SEGMENT_PAUSE_MS),
	/** When true, return only a cost estimate without synthesizing audio. */
	estimateOnly: z.boolean().default(false),
});

const gameplayCutSchema = z.object({
	voiceoverId: z.string().min(1),
	runId: z.string().optional(),
});

const packageSchema = z.object({
	runId: z.string().min(1),
	storyId: z.string().min(1),
	includeGameplay: z.boolean().default(true),
});

export { synthesizeSchema, gameplayCutSchema, packageSchema };
