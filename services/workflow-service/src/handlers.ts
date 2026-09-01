/**
 * Phase 3 + 4 step handlers — real implementations for the story and image pipeline.
 *
 * These handlers call story-service, research-service, embedding-service, and
 * image-service via HTTP. They replace the stub handlers for Phase 3-4 step types.
 *
 * Phase 3 handlers:
 * - concept_intake: pass through the topic + channel config
 * - content_classification: call story-service /classify
 * - research: call research-service /research (skip if fictional_story)
 * - novelty_context: call story-service /novelty
 * - generate_candidates: call story-service /generate
 * - duplicate_detection: call story-service /duplicates
 *
 * Phase 4 handlers:
 * - scene_plan: call image-service /scene-plan (plan 4-8 scenes from approved story)
 * - image_prompt_compilation: call image-service /compile-prompt for each scene
 * - image_generation: call image-service /generate-batch (generate all scene images)
 *
 * Phase 5 handlers:
 * - voice_generation: call voice-service /synthesize (Kokoro primary, Gemini TTS fallback)
 * - audio_timing: call voice-service /gameplay-cut (cut muted gameplay video matching audio)
 * - package_assembly: call voice-service /package (assemble export package with ZIP)
 *
 * Approval checkpoints (no handler needed — pauses run):
 * - story_approval, similarity_review, script_approval, image_review
 */

import type {
	StepHandler,
	StepHandlerContext,
	StepHandlerResult,
	LlmStepKey,
} from "@automation/workflow-engine";
import type {
	ContentType,
	ResearchOutput,
	StoryCandidate,
	StoryConcept,
	TemplateConfig,
} from "@automation/contracts";
import { requiresResearch as typeRequiresResearch, requiresEvidence as typeRequiresEvidence } from "@automation/contracts";
import { loadConfig } from "@automation/config";
import { getDb } from "@automation/database";
import { unlink as fsUnlink } from "node:fs/promises";

// D022: Manifest type for Remotion composition setup
interface ManifestRow {
	audio: { durationSec: string };
	scenes: {
		count: number;
		imageTimeline: Array<{
			scene: number;
			imageStartSec: string;
			imageEndSec: string;
			imageDurationSec: string;
		}>;
	};
	storyTitle: string;
}

const _config = loadConfig("workflow-service");
const STORY_SERVICE_URL = _config.services.storyService;
const RESEARCH_SERVICE_URL = _config.services.researchService;
const IMAGE_SERVICE_URL = _config.services.imageService;
const VOICE_SERVICE_URL = _config.services.voiceService;
const VIDEO_SERVICE_URL = _config.services.videoService;
const API_GATEWAY_URL = _config.services.apiGateway;

// === Helper: fetch with error handling ===

async function postJson(
	url: string,
	body: unknown,
): Promise<Record<string, unknown>> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	// Read the response body as text first, then try to parse as JSON.
	// This avoids "Failed to parse JSON" errors when the server returns a
	// non-JSON error body (e.g. HTML error page or plain text), and surfaces
	// the real error message instead.
	const text = await res.text();
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(text) as Record<string, unknown>;
	} catch {
		if (!res.ok) {
			throw new Error(`${url} returned ${res.status}: ${text.slice(0, 500)}`);
		}
		throw new Error(`${url} returned non-JSON response: ${text.slice(0, 500)}`);
	}
	if (!res.ok) {
		const errMsg = (data.error as string) ?? JSON.stringify(data);
		throw new Error(`${url} returned ${res.status}: ${errMsg}`);
	}
	return data;
}

// === Helper: extract per-step LLM provider/model from channel config ===
// Returns { llmProvider, llmModel } where each is undefined if not set
// (so the service falls back to env var / provider default).

function stepLlm(
	ctx: StepHandlerContext,
	stepKey: LlmStepKey,
): { llmProvider?: string; llmModel?: string } {
	const stepCfg = ctx.channelConfig.llmConfig?.[stepKey];
	if (!stepCfg) return {};
	return {
		llmProvider: stepCfg.provider ?? undefined,
		llmModel: stepCfg.model ?? undefined,
	};
}


/** D017: Get the channel's template config, or null. */
function getTemplate(ctx: StepHandlerContext): TemplateConfig | null {
	return ctx.channelConfig.template;
}

// === Handlers ===

/** concept_intake — pass through topic and channel config. */
export const conceptIntakeHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	ctx.log(`Concept intake for topic: ${ctx.inputData.topic as string}`);
	return {
		success: true,
		outputData: {
			topic: ctx.inputData.topic,
			channelId: ctx.channelId,
			targetDurationSeconds: ctx.inputData.targetDurationSeconds ?? 45,
			emotionalDirection: ctx.inputData.emotionalDirection ?? null,
			requiredIdeas: ctx.inputData.requiredIdeas ?? [],
			forbiddenIdeas: ctx.inputData.forbiddenIdeas ?? [],
			storyline: ctx.inputData.storyline ?? null,
		},
	};
};

/** content_classification — call story-service /classify (concept director, D014).
 * Always runs: even when contentType is provided, the concept director still
 * selects characters and produces creative direction. */
export const contentClassificationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const topic = ctx.inputData.topic as string;
	const providedContentType = ctx.inputData.contentType as ContentType | undefined;
	const storyline = ctx.inputData.storyline as string | undefined;

	ctx.log(`Concept director for topic: ${topic}${storyline ? " (with storyline)" : ""}`);

	try {
		const result = await postJson(`${STORY_SERVICE_URL}/classify`, {
			topic,
			channelId: ctx.channelId,
			...(storyline ? { storyline } : {}),
			...(providedContentType ? { providedContentType } : {}),
			runId: ctx.runId,
			stepId: ctx.stepId,
			...stepLlm(ctx, "classification"),
		});

		const concept = result.concept as StoryConcept | undefined;
		const contentType = (concept?.contentType ?? result.contentType ?? providedContentType ?? "fictional_story") as ContentType;
		ctx.log(`Concept: ${contentType}, ${concept?.characterMode ?? "none"} mode, ${concept?.characters?.length ?? 0} existing + ${concept?.newCharacters?.length ?? 0} new characters`);

		return {
			success: true,
			outputData: {
				contentType,
				reasoning: concept?.reasoning ?? result.reasoning ?? "",
				concept: concept ?? null,
			},
			provider: (result.provider as string) ?? "gemini",
			model: (result.model as string) ?? "gemini-3.6-flash",
			costUsd: result.costUsd as number | undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** research — call research-service /research (skip if content type doesn't require research). */
export const researchHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const classification = ctx.dependencyResults.content_classification;
	const contentType = (classification?.contentType ??
		ctx.inputData.contentType) as ContentType | undefined;

	// Skip research for content types that don't require it (D015 — registry-driven)
	if (contentType && !typeRequiresResearch(contentType)) {
		ctx.log(`Skipping research — ${contentType} does not require grounding`);
		return {
			success: true,
			skip: true,
			skipReason: `${contentType} does not require research`,
			outputData: {
				sources: [],
				claims: [],
				uncertainties: [],
				allowedFacts: [],
				warnings: [],
			},
		};
	}

	// Skip research when the channel has it disabled (cost saving)
	if (!ctx.channelConfig.researchEnabled) {
		ctx.log("Skipping research — channel has research disabled");
		return {
			success: true,
			skip: true,
			skipReason: "Research disabled on this channel",
			outputData: {
				sources: [],
				claims: [],
				uncertainties: [],
				allowedFacts: [],
				warnings: [],
			},
		};
	}

	const topic = ctx.inputData.topic as string;
	ctx.log(`Researching topic: ${topic} (type: ${contentType})`);

	try {
		const result = await postJson(`${RESEARCH_SERVICE_URL}/research`, {
			topic,
			contentType,
			channelId: ctx.channelId,
			requiredIdeas: ctx.inputData.requiredIdeas ?? [],
			forbiddenIdeas: ctx.inputData.forbiddenIdeas ?? [],
			runId: ctx.runId,
			stepId: ctx.stepId,
			...stepLlm(ctx, "research_grounding"),
			structuringLlm: stepLlm(ctx, "research_structuring"),
		});

		const research = result as unknown as ResearchOutput;
		ctx.log(
			`Research complete: ${research.sources?.length ?? 0} sources, ${research.claims?.length ?? 0} claims`,
		);

		// For content types that require evidence, check if evidence is sufficient
		if (
			contentType && typeRequiresEvidence(contentType) &&
			(research.warnings?.some((w) =>
				w.toLowerCase().includes("insufficient"),
			) ??
				false)
		) {
			return {
				success: false,
				error:
					`Insufficient evidence for ${contentType} — cannot proceed without adequate sources`,
				retryable: false,
			};
		}

		return {
			success: true,
			outputData: research as unknown as Record<string, unknown>,
			// Research uses two models: Gemini for grounding, DeepSeek/Gemini for structuring
			// Report the structuring provider/model as the primary, and include both in outputData
			provider: (result.structuringProvider as string) ?? "gemini",
			model: (result.structuringModel as string) ?? "gemini-3.7-flash",
			costUsd:
				((result.groundingCostUsd as number) ?? 0) +
				((result.structuringCostUsd as number) ?? 0),
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** novelty_context — call story-service /novelty. */
export const noveltyContextHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const topic = ctx.inputData.topic as string;
	ctx.log(`Retrieving novelty context for topic: ${topic}`);

	try {
		const result = await postJson(`${STORY_SERVICE_URL}/novelty`, {
			channelId: ctx.channelId,
			topic,
			limit: 10,
		});

		ctx.log(
			`Novelty context: ${(result.noveltyContext as string)?.length ?? 0} chars`,
		);

		return {
			success: true,
			outputData: {
				noveltyContext: result.noveltyContext ?? "",
				nearestStories: result.nearestStories ?? [],
			},
		};
	} catch (err) {
		// Novelty context is optional — continue without it
		ctx.log(
			`Novelty context failed (continuing without): ${err instanceof Error ? err.message : String(err)}`,
		);
		return {
			success: true,
			outputData: { noveltyContext: "", nearestStories: [] },
		};
	}
};

/** generate_candidates — call story-service /generate. */
export const generateCandidatesHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const topic = ctx.inputData.topic as string;
	const classification = ctx.dependencyResults.content_classification;
	const contentType = (classification?.contentType ??
		ctx.inputData.contentType) as ContentType | undefined;
	const novelty = ctx.dependencyResults.novelty_context;
	const research = ctx.dependencyResults.research;
	const concept = classification?.concept as StoryConcept | undefined;

	ctx.log(`Generating candidates for topic: ${topic}`);

	try {
		const result = await postJson(`${STORY_SERVICE_URL}/generate`, {
			channel: ctx.channelId,
			topic,
			contentType,
			targetDurationSeconds: ctx.inputData.targetDurationSeconds ?? 45,
			emotionalDirection: ctx.inputData.emotionalDirection,
			requiredIdeas: ctx.inputData.requiredIdeas,
			forbiddenIdeas: ctx.inputData.forbiddenIdeas,
			noveltyContext: novelty?.noveltyContext as string | undefined,
			candidateCount: 3,
			research: research as Record<string, unknown> | undefined,
			storyline: ctx.inputData.storyline as string | undefined,
			// Pass the creative direction from the concept director so the
			// story generator has the creative angle, tone, and character
			// dynamics decided during classification.
			...(concept?.creativeDirection ? { creativeDirection: concept.creativeDirection } : {}),
			runId: ctx.runId,
			stepId: ctx.stepId,
			...stepLlm(ctx, "story_candidates"),
		});

		const candidates = result.candidates as StoryCandidate[];
		ctx.log(`Generated ${candidates.length} candidates`);

		return {
			success: true,
			outputData: { candidates },
			provider: (result.provider as string) ?? "gemini",
			model: (result.model as string) ?? "gemini-3.6-flash",
			costUsd: result.costUsd as number | undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** duplicate_detection — call story-service /duplicates. */
export const duplicateDetectionHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const candidatesResult = ctx.dependencyResults.generate_candidates;
	const candidates = candidatesResult?.candidates as
		| StoryCandidate[]
		| undefined;

	if (!candidates || candidates.length === 0) {
		return {
			success: false,
			error: "No candidates to check for duplicates",
			retryable: false,
		};
	}

	ctx.log(`Running duplicate detection on ${candidates.length} candidates`);

	try {
		const result = await postJson(`${STORY_SERVICE_URL}/duplicates`, {
			channelId: ctx.channelId,
			runId: ctx.runId,
			candidates,
			stepId: ctx.stepId,
			skipAdjudication: !ctx.channelConfig.duplicateAdjudicationEnabled,
			...stepLlm(ctx, "duplicate_adjudication"),
		});

		const results = result.results as Array<{
			candidateIndex: number;
			candidateTitle: string;
			classification: string;
			bestCandidate: boolean;
			checks: unknown[];
		}>;

		ctx.log(
			`Duplicate detection complete: ${results.map((r) => `${r.candidateTitle}=${r.classification}`).join(", ")}`,
		);

		return {
			success: true,
			outputData: { results },
			provider: (result.provider as string) ?? "gemini",
			model: (result.model as string) ?? "gemini-3.6-flash",
			costUsd: result.costUsd as number | undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

// === Phase 4: Image pipeline handlers ===

/** scene_plan — call image-service /scene-plan to break the approved story into 4-8 scenes. */
export const scenePlanHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// The story_approval step stores the approved storyId in its approval payload.
	// The workflow engine stores approval data in the step's result_data.
	const storyApproval = ctx.dependencyResults.story_approval;
	let storyId =
		(storyApproval?.storyId as string | undefined) ??
		(ctx.inputData.storyId as string | undefined);
	const selectedCandidateIndex = storyApproval?.candidateIndex as
		| number
		| undefined;

	// Track DNA extraction cost (story DNA is extracted during /version, which may
	// be called below if no storyId was provided in the approval)
	let dnaCostUsd = 0;

	// If no storyId was provided in the approval, create a story from the best candidate
	// (or the user-selected candidate if candidateIndex was provided in editedData).
	if (!storyId) {
		// scene_plan only depends on story_approval, so we need to fetch
		// generate_candidates and duplicate_detection results from the DB directly.
		const db = getDb();
		const candidatesRow = await db.prepare(`
      SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'generate_candidates' AND status = 'completed'
    `)
			.get(ctx.runId) as { result_data: string } | null;
		const candidatesResult = candidatesRow?.result_data
			? (JSON.parse(candidatesRow.result_data) as {
					candidates?: StoryCandidate[];
				})
			: {};
		const candidates = candidatesResult.candidates;

		const dupRow = await db.prepare(`
      SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'duplicate_detection' AND status = 'completed'
    `)
			.get(ctx.runId) as { result_data: string } | null;
		const dupResult = dupRow?.result_data
			? (JSON.parse(dupRow.result_data) as {
					results?: Array<{ candidateIndex: number; bestCandidate: boolean }>;
				})
			: {};
		const dupResults = dupResult.results;
		const researchRow = await db.prepare(`
      SELECT result_data FROM workflow_steps
      WHERE run_id = ? AND step_type = 'research' AND status IN ('completed', 'skipped')
    `)
			.get(ctx.runId) as { result_data: string | null } | null;
		const researchResult = researchRow?.result_data
			? JSON.parse(researchRow.result_data) as ResearchOutput
			: undefined;

		if (!candidates || candidates.length === 0) {
			return {
				success: false,
				error: "No storyId and no candidates to create a story from",
				retryable: false,
			};
		}

		// Use user-selected candidate if provided, otherwise find the best candidate
		// (marked by duplicate detection, or default to first)
		let bestIdx = selectedCandidateIndex ?? 0;
		if (selectedCandidateIndex === undefined && dupResults) {
			const best = dupResults.find((r) => r.bestCandidate);
			if (best) bestIdx = best.candidateIndex;
		}
		const bestCandidate = candidates[bestIdx];
		if (!bestCandidate) {
			return {
				success: false,
				error: "Best candidate not found",
				retryable: false,
			};
		}

		ctx.log(
			`No storyId from approval — creating story from candidate ${bestIdx}: "${bestCandidate.title}"`,
		);

		// Look up the channel's active character versions from the junction table
		const charVersions = await db.prepare(
				`SELECT cv.id as version_id, cv.character_id
				 FROM channel_characters cc
				 JOIN character_versions cv ON cv.character_id = cc.character_id
				 WHERE cc.channel_id = ? AND cc.is_active = 1 AND cv.status = 'frozen'
				 ORDER BY cc.added_at ASC`,
			)
			.all(ctx.channelId) as Array<{
			version_id: string;
			character_id: string;
		}>;
		const characterVersionIds = charVersions.map((r) => r.version_id);
		// For backward compat with story-service (which expects a single characterVersionId),
		// pass the first active version. Future: pass the full array for multi-character stories.
		const characterVersionId = characterVersionIds[0] ?? undefined;

		// Create a story version via story-service
		try {
			const versionResult = await postJson(`${STORY_SERVICE_URL}/version`, {
				channelId: ctx.channelId,
				runId: ctx.runId,
				candidate: bestCandidate,
				research: researchResult,
				characterVersionId,
				...stepLlm(ctx, "story_dna"),
			});
			storyId = versionResult.storyId as string | undefined;
			if (!storyId) {
				return {
					success: false,
					error: "Failed to create story version: no storyId returned",
					retryable: true,
				};
			}
			// Capture DNA extraction cost (story DNA is extracted during versioning)
			dnaCostUsd = (versionResult.dnaCostUsd as number) ?? 0;
			ctx.log(`Story created with ID: ${storyId}`);
		} catch (err) {
			return {
				success: false,
				error: `Failed to create story version: ${err instanceof Error ? err.message : String(err)}`,
				retryable: true,
			};
		}
	}

	ctx.log(`Planning scenes for story: ${storyId}`);

	// D017: Pass the template's scenePlan config so the scene planner can
	// adapt its prompt for image scenes vs video clip scenes.
	const tmpl = getTemplate(ctx);
	const scenePlanConfig = tmpl?.scenePlan ?? undefined;

	try {
		const result = await postJson(`${IMAGE_SERVICE_URL}/scene-plan`, {
			storyId,
			runId: ctx.runId,
			stepId: ctx.stepId,
			scenePlanConfig,
			...stepLlm(ctx, "scene_planning"),
		});

		const sceneCount = result.sceneCount as number;
		const scenes = result.scenes as Array<{ id: string; order: number }>;
		ctx.log(`Scene plan complete: ${sceneCount} scenes`);

		return {
			success: true,
			outputData: { storyId, sceneCount, scenes },
			provider: (result.provider as string) ?? "gemini",
			model: (result.model as string) ?? "gemini-3.6-flash",
			costUsd: ((result.costUsd as number) ?? 0) + (dnaCostUsd ?? 0),
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** image_prompt_compilation — compile prompts for all scenes (no Gemini call, just prompt assembly). */
export const imagePromptCompilationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// image_prompt_compilation depends on script_approval, not scene_plan.
	// Fetch scene_plan results from the DB directly.
	const db = getDb();
	const scenePlanRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as {
				scenes?: Array<{ id: string; order: number }>;
			})
		: {};
	const scenes = scenePlan.scenes;

	if (!scenes || scenes.length === 0) {
		return {
			success: false,
			error: "No scenes found — scene_plan must complete first",
			retryable: false,
		};
	}

	// Read aspect ratio from channel config (now in ctx.channelConfig)
	const aspectRatio = ctx.channelConfig.aspectRatio;

	ctx.log(
		`Compiling prompts for ${scenes.length} scenes (aspect: ${aspectRatio})`,
	);

	try {
		const compiledPrompts: Array<{
			sceneId: string;
			order: number;
			promptId: string;
			isCharacterScene: boolean;
			model: string;
		}> = [];

		for (const scene of scenes) {
			const result = await postJson(`${IMAGE_SERVICE_URL}/compile-prompt`, {
				sceneId: scene.id,
				aspectRatio,
			});

			compiledPrompts.push({
				sceneId: scene.id,
				order: scene.order,
				promptId: result.promptId as string,
				isCharacterScene: result.isCharacterScene as boolean,
				model: result.model as string,
			});
		}

		ctx.log(`Compiled ${compiledPrompts.length} prompts`);

		return {
			success: true,
			outputData: { prompts: compiledPrompts },
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** image_generation — call image-service /generate-batch to generate all scene images. */
export const imageGenerationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// image_generation depends on image_prompt_compilation, not scene_plan.
	// Fetch scene_plan results from the DB directly to get the storyId.
	const db = getDb();
	const scenePlanRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as { storyId?: string })
		: {};
	const storyId = scenePlan.storyId;

	if (!storyId) {
		return {
			success: false,
			error: "No storyId found — scene_plan must complete first",
			retryable: false,
		};
	}

	// Read aspect ratio from channel config (now available in ctx.channelConfig)
	const aspectRatio = ctx.channelConfig.aspectRatio;

	ctx.log(`Generating images for story: ${storyId} (aspect: ${aspectRatio})`);

	try {
		const result = await postJson(`${IMAGE_SERVICE_URL}/generate-batch`, {
			storyId,
			runId: ctx.runId,
			stepId: ctx.stepId,
			aspectRatio,
			temperature: 0.85,
			imageProvider: ctx.channelConfig.imageProvider || undefined,
			imageModelCharacter: ctx.channelConfig.imageModelCharacter ?? undefined,
			imageModelNonCharacter: ctx.channelConfig.imageModelNonCharacter ?? undefined,
		});

		const generated = result.generated as number;
		const errors = result.errors as Array<{
			sceneId: string;
			order: number;
			error: string;
		}>;
		const results = result.results as Array<Record<string, unknown>>;

		ctx.log(
			`Image generation complete: ${generated} generated, ${errors.length} errors`,
		);

		if (errors.length > 0 && generated === 0) {
			return {
				success: false,
				error: `All image generations failed: ${errors.map((e) => `scene ${e.order}: ${e.error}`).join("; ")}`,
				retryable: true,
			};
		}

		return {
			success: true,
			outputData: {
				storyId,
				generated,
				errors,
				results,
			},
			provider: process.env.IMAGE_PROVIDER ?? "fal",
			model:
				process.env.IMAGE_MODEL_CHARACTER ??
				(process.env.IMAGE_PROVIDER === "gemini"
					? "gemini-3.1-flash-image"
					: "fal-ai/flux-2/klein/9b/edit"),
			costUsd: (results as Array<{ costUsd?: number }>).reduce(
				(sum, r) => sum + (r.costUsd ?? 0),
				0,
			),
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

// === Phase 5: Voice, timing, and export handlers ===

/** voice_generation — call voice-service /synthesize to generate voice-over from scene narration. */
export const voiceGenerationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// D017: Skip if the template has voiceover disabled (e.g. ai-video-clips with no commentary)
	const tmpl = getTemplate(ctx);
	if (tmpl && tmpl.assets.voiceover && !tmpl.assets.voiceover.required) {
		// Voiceover is optional — check if the user disabled it via override
		// For now, we run it by default when enabled. The "default" field in the
		// asset spec controls this ("enabled" = run, "disabled" = skip).
		const voiceDefault = tmpl.assets.voiceover.default;
		if (voiceDefault === "disabled") {
			ctx.log("Skipping voice generation — template has voiceover disabled by default");
			return {
				success: true,
				skip: true,
				skipReason: "Voiceover disabled by template default",
				outputData: { skipped: true },
			};
		}
	}

	// voice_generation depends on script_approval, not scene_plan.
	// Fetch scene_plan results from the DB directly to get the storyId.
	const db = getDb();
	const scenePlanRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as { storyId?: string })
		: {};
	const storyId = scenePlan.storyId;

	if (!storyId) {
		return {
			success: false,
			error: "No storyId found — scene_plan must complete first",
			retryable: false,
		};
	}

	ctx.log(`Generating voice-over for story: ${storyId}`);

	// TTS provider selection: use channel config if set, otherwise fall back to env var.
	// Options: "auto" (kokoro → gemini fallback), "kokoro", "chatterbox", "gemini".
	const channelTts = ctx.channelConfig.ttsProvider;
	const ttsProvider = (channelTts && channelTts !== "auto" ? channelTts : (process.env.TTS_PROVIDER ?? "auto")) as
		| "auto"
		| "kokoro"
		| "chatterbox"
		| "gemini";
	const ttsVoiceId = ctx.channelConfig.ttsVoiceId || undefined;

	try {
		const result = await postJson(`${VOICE_SERVICE_URL}/synthesize`, {
			storyId,
			runId: ctx.runId,
			stepId: ctx.stepId,
			provider: ttsProvider,
			voiceId: ttsVoiceId,
			interSegmentPauseMs: 300,
		});

		const voiceoverId = result.voiceoverId as string;
		const durationMs = result.durationMs as number;
		const provider = result.provider as string;
		const model = result.model as string;
		const warning = result.warning as string | null;

		ctx.log(
			`Voice-over complete: ${durationMs}ms via ${provider}/${model}${warning ? ` — WARNING: ${warning}` : ""}`,
		);

		return {
			success: true,
			outputData: {
				storyId,
				voiceoverId,
				durationMs,
				provider,
				model,
				warning,
				timings: result.timings,
			},
			provider,
			model,
			costUsd: result.costUsd as number | undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

/** audio_timing — call voice-service /gameplay-cut to cut a muted gameplay video matching audio duration. */
export const audioTimingHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// D017: If voice generation was skipped (optional voiceover), skip timing too
	const voiceGen = ctx.dependencyResults.voice_generation;
	if (voiceGen?.skipped) {
		ctx.log("Skipping audio timing — voice generation was skipped (no voiceover)");
		return {
			success: true,
			skip: true,
			skipReason: "Voiceover was skipped",
			outputData: { skipped: true },
		};
	}

	const voiceoverId = voiceGen?.voiceoverId as string | undefined;

	if (!voiceoverId) {
		return {
			success: false,
			error: "No voiceoverId found — voice_generation must complete first",
			retryable: false,
		};
	}

	// D017: Skip gameplay cutting if the template doesn't use gameplay video
	const tmpl = getTemplate(ctx);
	if (tmpl && tmpl.assets.gameplayVideo && !tmpl.assets.gameplayVideo.required) {
		ctx.log("Skipping gameplay cut — template doesn't use gameplay video");
		// Still record timing from the voiceover (needed for clip timing)
		return {
			success: true,
			outputData: { skipped: true, gameplayCut: false },
		};
	}

	ctx.log(`Cutting gameplay video for voiceover: ${voiceoverId}`);

	try {
		const result = await postJson(`${VOICE_SERVICE_URL}/gameplay-cut`, {
			voiceoverId,
			runId: ctx.runId,
		});

		const gameplayInfo = result.gameplayVideo as {
			sourceFile: string;
			startSec: string;
			durationSec: string;
			muted: boolean;
		};

		ctx.log(
			`Gameplay video cut: ${gameplayInfo.sourceFile} @ ${gameplayInfo.startSec}s for ${gameplayInfo.durationSec}s (muted: ${gameplayInfo.muted})`,
		);

		return {
			success: true,
			outputData: {
				voiceoverId,
				gameplayVideo: gameplayInfo,
			},
		};
	} catch (err) {
		// Gameplay video cut is non-critical — continue without it
		ctx.log(
			`Gameplay video cut failed (continuing without): ${err instanceof Error ? err.message : String(err)}`,
		);
		return {
			success: true,
			outputData: {
				voiceoverId,
				gameplayVideo: null,
				warning: "Gameplay video cut failed",
			},
		};
	}
};

/** package_assembly — call voice-service /package to assemble the full export package. */
export const packageAssemblyHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// package_assembly depends on image_review and audio_timing, not scene_plan.
	// Fetch scene_plan results from the DB directly to get the storyId.
	const db = getDb();
	const scenePlanRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as { storyId?: string })
		: {};
	const storyId = scenePlan.storyId;

	if (!storyId) {
		return {
			success: false,
			error: "No storyId found — scene_plan must complete first",
			retryable: false,
		};
	}

	ctx.log(`Assembling export package for story: ${storyId}`);

	const tmpl = getTemplate(ctx);
	const isClipTemplate = tmpl?.scenePlan.sceneType === "video-clip-scene";
	const isFlowTemplate = tmpl?.scenePlan.sceneType === "flow-hybrid";
	const hasGameplay = tmpl?.assets.gameplayVideo?.required === true;

	try {
		let result: Record<string, unknown>;
		let hasVoiceover = true;

		// Try to assemble the package via voice-service. If voiceover is
		// disabled (skipped), the voice-service returns 404 — in that case
		// we build a clip-only package without voiceover/timing data.
		try {
			result = await postJson(`${VOICE_SERVICE_URL}/package`, {
				runId: ctx.runId,
				storyId,
				includeGameplay: hasGameplay,
			});
		} catch (pkgErr) {
			const pkgMsg = pkgErr instanceof Error ? pkgErr.message : String(pkgErr);
			if (pkgMsg.includes("404") && (pkgMsg.includes("No voiceover") || pkgMsg.includes("No timing"))) {
				ctx.log(`No voiceover found — building clip-only package (voiceover disabled)`);
				hasVoiceover = false;
				result = { packagePath: null, manifest: {}, files: [] };
			} else {
				throw pkgErr;
			}
		}

		const packagePath = result.packagePath as string | null;
		const manifest = result.manifest as Record<string, unknown>;

		// D017: For clip-based templates, copy clips into the export directory
		// and add clip info to the manifest so the video-service /render-clips
		// endpoint can find them.
		if (isClipTemplate) {
			// Fetch clip_generation results from the DB
			const clipGenRow = await db
				.prepare(`
          SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'clip_generation' AND status IN ('completed', 'skipped')
        `)
				.get(ctx.runId) as { result_data: string } | null;

			if (clipGenRow?.result_data) {
				const clipData = JSON.parse(clipGenRow.result_data) as {
					clips?: Array<{
						sceneId: string;
						order: number;
						clipFile: string;
						durationSec: number;
						width: number;
						height: number;
						costUsd: number;
					}>;
					exportDir?: string;
				};

				if (clipData.clips && clipData.clips.length > 0) {
					const artifactBase = process.env.ARTIFACT_STORE_PATH ?? "./data/artifacts";
					const clipsDir = `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/clips`;
					const exportDir = `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/export`;

					// Ensure export directory exists
					const fs = await import("node:fs/promises");
					await fs.mkdir(exportDir, { recursive: true });

					// Copy clips into the export directory
					try {
						const { execSync } = await import("node:child_process");
						execSync(`cp "${clipsDir}"/*.mp4 "${exportDir}/" 2>/dev/null || true`);
						ctx.log(`Copied ${clipData.clips.length} clips into export directory`);
					} catch {
						ctx.log("WARNING: Failed to copy clips into export directory");
					}

					// Build manifest with clip info
					const scenes = (manifest.scenes as Record<string, unknown>) ?? {};
					scenes.clips = clipData.clips.map((c) => ({
						order: c.order,
						file: c.clipFile,
						durationSec: String(c.durationSec),
					}));
					scenes.clipTimeline = clipData.clips.map((c) => ({
						scene: c.order,
						clipFile: c.clipFile,
						durationSec: String(c.durationSec),
					}));
					manifest.scenes = scenes;
					manifest.hasVoiceover = hasVoiceover;

					// Write manifest.json and create/update the export ZIP
					try {
						const { execSync } = await import("node:child_process");
						await fs.writeFile(
							`${exportDir}/manifest.json`,
							JSON.stringify(manifest, null, 2),
						);
						const zipPath = packagePath ?? `${exportDir}/export.zip`;
						// Remove old zip if exists, then create new one
						try { await fsUnlink(zipPath); } catch { /* ok if not exists */ }
						execSync(`cd "${exportDir}" && zip -r -0 "${zipPath}" .`, {
							maxBuffer: 200 * 1024 * 1024,
						});
						ctx.log(`Built export package with clips: ${zipPath}`);
						return {
							success: true,
							outputData: {
								storyId,
								packagePath: zipPath,
								manifest,
								files: result.files,
							},
						};
					} catch (zipErr) {
						ctx.log(`WARNING: Failed to build export ZIP: ${zipErr}`);
						// Return success anyway — clips are in the export dir
						return {
							success: true,
							outputData: {
								storyId,
								packagePath: null,
								exportDir: `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/export`,
								manifest,
								files: result.files,
							},
						};
					}
				}
			}
		}

		// D021: For Flow templates, copy uploaded clips/images into the export
		// directory and add them to the manifest. The flow_upload step result
		// contains { clipOrder: number[], uploadedAssetIds: string[] }.
		// The assets are stored in the `assets` table with file_path pointing
		// to the artifact store.
		if (isFlowTemplate) {
			const flowUploadRow = await db
				.prepare(`
					SELECT result_data FROM workflow_steps
					WHERE run_id = ? AND step_type = 'flow_upload' AND status = 'completed'
				`)
				.get(ctx.runId) as { result_data: string } | null;

			if (flowUploadRow?.result_data) {
				const flowData = JSON.parse(flowUploadRow.result_data) as {
					clipOrder?: number[];
					uploadedAssetIds?: string[];
				};

				if (flowData.uploadedAssetIds && flowData.uploadedAssetIds.length > 0) {
					const artifactBase = process.env.ARTIFACT_STORE_PATH ?? "./data/artifacts";
					const exportDir = `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/export`;

					const fs = await import("node:fs/promises");
					await fs.mkdir(exportDir, { recursive: true });

					// Fetch asset file paths from the DB
					const placeholders = flowData.uploadedAssetIds.map(() => "?").join(",");
					const assetRows = await db.prepare(
						`SELECT id, scene_id, type, file_path FROM assets WHERE id IN (${placeholders})`,
					).all(...flowData.uploadedAssetIds) as Array<{
						id: string;
						scene_id: string;
						type: string;
						file_path: string;
					}>;

					// Build a map of sceneId → asset for manifest
					const sceneAssetMap = new Map<string, { type: string; filePath: string }>();
					for (const row of assetRows) {
						sceneAssetMap.set(row.scene_id, { type: row.type, filePath: row.file_path });
					}

					// Copy assets into the export directory
					const clips: Array<{ order: number; file: string; type: string }> = [];
					const images: Array<{ order: number; file: string }> = [];

					// Get scenes to map sceneId → order
					const scenes = await db.prepare(
						`SELECT id, "order" FROM scenes WHERE story_id = ? ORDER BY "order" ASC`,
					).all(storyId) as Array<{ id: string; order: number }>;

					for (const scene of scenes) {
						const asset = sceneAssetMap.get(scene.id);
						if (!asset) continue;

						const ext = asset.filePath.split(".").pop()?.toLowerCase() ?? "bin";
						const fileName = `scene-${String(scene.order).padStart(2, "0")}.${ext}`;
						const destPath = `${exportDir}/${fileName}`;

						try {
							await fs.copyFile(asset.filePath, destPath);
						} catch {
							ctx.log(`WARNING: Failed to copy asset for scene ${scene.order}`);
						}

						if (asset.type === "video_clip") {
							clips.push({ order: scene.order, file: fileName, type: "video-clip" });
						} else {
							images.push({ order: scene.order, file: fileName });
						}
					}

					// Apply clip order from the flow_upload approval data
					const orderedClips = (flowData.clipOrder ?? clips.map((c) => c.order))
						.map((order) => clips.find((c) => c.order === order))
						.filter((c): c is { order: number; file: string; type: string } => c !== undefined);

					// Build a sceneOrder → durationSec map from the imageTimeline
					// (produced by voice-service with timing for all scenes)
					const imageTimeline = (manifest.scenes as Record<string, unknown>)?.imageTimeline as
						Array<{ scene: number; imageDurationSec: string }> | undefined;
					const durationMap = new Map<number, string>();
					if (imageTimeline) {
						for (const t of imageTimeline) {
							durationMap.set(t.scene, t.imageDurationSec);
						}
					}

					// Update manifest
					const manifestScenes = (manifest.scenes as Record<string, unknown>) ?? {};
					manifestScenes.clips = orderedClips.map((c) => ({
						order: c.order,
						file: c.file,
						type: c.type,
					}));
					manifestScenes.images = images.map((i) => ({
						order: i.order,
						file: i.file,
					}));
					manifestScenes.clipTimeline = orderedClips.map((c) => ({
						scene: c.order,
						clipFile: c.file,
						durationSec: durationMap.get(c.order) ?? "4",
					}));
					manifest.scenes = manifestScenes;
					manifest.hasVoiceover = hasVoiceover;

					// Write manifest.json and create/update the export ZIP
					try {
						const { execSync } = await import("node:child_process");
						await fs.writeFile(
							`${exportDir}/manifest.json`,
							JSON.stringify(manifest, null, 2),
						);
						const zipPath = packagePath ?? `${exportDir}/export.zip`;
						try { await fsUnlink(zipPath); } catch { /* ok if not exists */ }
						execSync(`cd "${exportDir}" && zip -r -0 "${zipPath}" .`, {
							maxBuffer: 200 * 1024 * 1024,
						});
						ctx.log(`Built export package with Flow clips/images: ${zipPath}`);
						return {
							success: true,
							outputData: {
								storyId,
								packagePath: zipPath,
								manifest,
								files: result.files,
							},
						};
					} catch (zipErr) {
						ctx.log(`WARNING: Failed to build export ZIP: ${zipErr}`);
						return {
							success: true,
							outputData: {
								storyId,
								packagePath: null,
								exportDir,
								manifest,
								files: result.files,
							},
						};
					}
				}
			}
		}

		// D022: For Remotion-based templates (documentary), generate the
		// render.tsx composition entry file and copy assets to public/.
		// The video-service /render-documentary endpoint will use these
		// to render the final MP4 via the Remotion CLI.
		const isRemotionTemplate = tmpl?.render.renderer === "remotion";
		if (isRemotionTemplate && tmpl) {
			ctx.log("Remotion template detected — generating documentary composition");

			try {
				const { setupRemotionComposition } = await import("./remotion-composition.ts");

				const artifactBase = process.env.ARTIFACT_STORE_PATH ?? "./data/artifacts";
				const exportDir = `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/export`;

				const compLlm = stepLlm(ctx, "scene_planning");
				const compResult = await setupRemotionComposition(
					ctx.runId,
					storyId,
					ctx.channelId,
					exportDir,
					manifest as unknown as ManifestRow,
					tmpl,
					compLlm.llmProvider,
					compLlm.llmModel,
				);

				ctx.log(
					`Documentary composition generated: ${compResult.compositionId} (${compResult.totalFrames} frames)`,
				);

				// Update the export ZIP to include render.tsx + public/
				try {
					const { execSync } = await import("node:child_process");
					const zipPath = packagePath ?? `${exportDir}/export.zip`;
					try { await fsUnlink(zipPath); } catch { /* ok if not exists */ }
					execSync(`cd "${exportDir}" && zip -r -0 "${zipPath}" .`, {
						maxBuffer: 200 * 1024 * 1024,
					});
					ctx.log(`Rebuilt export ZIP with Remotion composition: ${zipPath}`);
				} catch (zipErr) {
					ctx.log(`WARNING: Failed to rebuild export ZIP with Remotion files: ${zipErr}`);
				}
			} catch (compErr) {
				ctx.log(
					`WARNING: Failed to generate Remotion composition: ${compErr instanceof Error ? compErr.message : String(compErr)} — falling back to FFmpeg render`,
				);
			}
		}

		ctx.log(`Export package assembled: ${packagePath}`);

		return {
			success: true,
			outputData: {
				storyId,
				packagePath,
				manifest,
				files: result.files,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

// === Phase 7: Video generation handler ===

/** video_generation — call video-service to render a vertical MP4. */
export const videoGenerationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	// Skip if the channel has video generation disabled
	if (!ctx.channelConfig.videoGenerationEnabled) {
		ctx.log("Skipping video generation — channel has video generation disabled");
		return {
			success: true,
			skip: true,
			skipReason: "Video generation disabled on this channel",
			outputData: { skipped: true },
		};
	}

	ctx.log(`Generating video for run: ${ctx.runId}`);

	// D017: Dispatch to the right render endpoint based on the template.
	// Documentary templates use Remotion (render.renderer === "remotion"),
	// clip templates use /render-clips, Flow templates use /render-flow,
	// and everything else falls back to the FFmpeg /generate endpoint.
	const tmpl = getTemplate(ctx);
	const sceneType = tmpl?.scenePlan.sceneType;
	const isRemotionTemplate = tmpl?.render.renderer === "remotion";
	const isClipTemplate = sceneType === "video-clip-scene";
	const isFlowTemplate = sceneType === "flow-hybrid";
	const renderEndpoint = isRemotionTemplate
		? "/render-documentary"
		: isFlowTemplate
			? "/render-flow"
			: isClipTemplate
				? "/render-clips"
				: "/generate";

	// For clip/flow/remotion templates, pass the template config so the renderer knows the layout
	const requestBody: Record<string, unknown> = {
		runId: ctx.runId,
		apiGatewayUrl: API_GATEWAY_URL,
	};
	if ((isClipTemplate || isFlowTemplate || isRemotionTemplate) && tmpl) {
		requestBody.templateConfig = tmpl;
		// Check if voiceover was generated
		const voiceGen = ctx.dependencyResults.voice_generation;
		requestBody.hasVoiceover = !voiceGen?.skipped;
	}

	// D020: Pass background audio URL if the channel has one configured
	if (ctx.channelConfig.backgroundAudioPath) {
		requestBody.backgroundAudioUrl = `${requestBody.apiGatewayUrl}/api/channels/${ctx.channelId}/background-audio`;
		ctx.log(`Channel has background audio — will be mixed into the video`);
	}

	try {
		const result = await postJson(`${VIDEO_SERVICE_URL}${renderEndpoint}`, requestBody);

		const assetId = result.assetId as string;
		const filePath = result.filePath as string;
		const durationSec = result.durationSec as number;
		const fps = result.fps as string;
		const sizeMB = result.sizeMB as number;
		const sceneCount = result.sceneCount as number;
		const storyTitle = result.storyTitle as string;

		ctx.log(
			`Video rendered: ${durationSec}s at ${fps}fps, ${sizeMB}MB — "${storyTitle}" (${sceneCount} scenes)`,
		);

		return {
			success: true,
			outputData: {
				assetId,
				filePath,
				durationSec,
				fps,
				sizeMB,
				sceneCount,
				storyTitle,
				audioLufs: result.audioLufs,
				audioTruePeak: result.audioTruePeak,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			retryable: true,
		};
	}
};

// === D017: Clip-based template handlers (ai-video-clips) ===

/**
 * clip_prompt_compilation — compile video clip prompts for all scenes.
 *
 * For clip-based templates, each scene needs a motion-focused prompt instead
 * of an image prompt. This handler reads the scene plan and builds clip prompts
 * using the template's scenePlan.clipPromptFields config.
 */
export const clipPromptCompilationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const tmpl = getTemplate(ctx);
	if (!tmpl) {
		return {
			success: false,
			error: "No template assigned to channel — clip prompt compilation requires a template",
			retryable: false,
		};
	}

	// Fetch scene_plan results from the DB to get the storyId and scene IDs.
	// The step result only stores { storyId, sceneCount, scenes: [{id, order}] } —
	// the full scene data (narration, visualEvent, environment, camera, lighting)
	// lives in the `scenes` table, which we query below.
	const db = getDb();
	const scenePlanRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as {
				storyId?: string;
				scenes?: Array<{ id: string; order: number }>;
			})
		: {};
	const sceneRefs = scenePlan.scenes;
	const storyId = scenePlan.storyId;

	if (!sceneRefs || sceneRefs.length === 0) {
		return {
			success: false,
			error: "No scenes found — scene_plan must complete first",
			retryable: false,
		};
	}

	// Query the scenes table for the full scene data (narration, visual event,
	// environment, camera framing, lighting, duration). The scene_plan step
	// only stores {id, order} in its result_data — the rich fields are
	// persisted by image-service when it inserts scenes into the DB.
	const scenes: Array<{
		id: string;
		order: number;
		narrationText?: string;
		visualEvent?: string;
		environment?: string;
		cameraFraming?: string;
		lightingAndMood?: string;
		characterRole?: string;
		expectedDurationSeconds?: number;
	}> = [];
	for (const ref of sceneRefs) {
		const row = await db.prepare(
			`SELECT id, "order", narration_text, visual_event, environment,
			        camera_framing, lighting_and_mood, character_role,
			        expected_duration_seconds
			   FROM scenes WHERE id = ?`,
		).get(ref.id) as {
			id: string;
			order: number;
			narration_text: string | null;
			visual_event: string | null;
			environment: string | null;
			camera_framing: string | null;
			lighting_and_mood: string | null;
			character_role: string | null;
			expected_duration_seconds: number | null;
		} | null;
		if (row) {
			scenes.push({
				id: row.id,
				order: row.order,
				narrationText: row.narration_text ?? undefined,
				visualEvent: row.visual_event ?? undefined,
				environment: row.environment ?? undefined,
				cameraFraming: row.camera_framing ?? undefined,
				lightingAndMood: row.lighting_and_mood ?? undefined,
				characterRole: row.character_role ?? undefined,
				expectedDurationSeconds: row.expected_duration_seconds ?? undefined,
			});
		}
	}

	if (scenes.length === 0) {
		return {
			success: false,
			error: "No scene records found in database — scene_plan must complete first",
			retryable: false,
		};
	}

	const clipDurationRange = tmpl.scenePlan.clipDurationSeconds;
	const clipFields = tmpl.scenePlan.clipPromptFields ?? [
		"visualEvent",
		"environment",
		"cameraMovement",
		"lightingAndMood",
		"motionDescription",
	];

	ctx.log(`Compiling clip prompts for ${scenes.length} scenes (fields: ${clipFields.join(", ")})`);

	// Get channel visual style for consistency
	const channelRow = await db
			.prepare("SELECT visual_style FROM channels WHERE id = ?")
		.get(ctx.channelId) as { visual_style: string } | null;
	const visualStyle = channelRow?.visual_style ?? "";

	// Build a clip prompt for each scene by combining the relevant fields
	// into a motion-focused text prompt for the video generation model.
	// For scenes with characters, also fetch character bible info and mark
	// the clip as a character scene — clip_generation will generate a
	// scene image first and use fal.ai's image-to-video endpoint for
	// character consistency.
	const compiledClips: Array<{
		sceneId: string;
		order: number;
		clipPrompt: string;
		durationSec: number;
		isCharacterScene: boolean;
		characterVersionIds: string[];
	}> = [];

	for (const scene of scenes) {
		const parts: string[] = [];

		// Add channel visual style first for consistency
		if (visualStyle) {
			parts.push(visualStyle);
		}

		// Check if this scene has characters assigned (scene_characters table)
		const sceneChars = await db.prepare(
			'SELECT * FROM scene_characters WHERE scene_id = ? ORDER BY "order" ASC',
		).all(scene.id) as Array<{
			character_version_id: string | null;
			character_name: string;
			role_in_scene: string;
			pose_and_expression: string;
		}>;

		const isCharacterScene = sceneChars.length > 0;
		const characterVersionIds: string[] = [];

		// For character scenes, include character identity info in the prompt
		// so the image-to-video model has a text description to anchor identity.
		if (isCharacterScene) {
			const characterBlocks: string[] = [];
			for (const sc of sceneChars.slice(0, 3)) {
				if (sc.character_version_id) {
					characterVersionIds.push(sc.character_version_id);
					// Fetch the character bible for identity details
					const versionRow = await db.prepare(
						"SELECT bible FROM character_versions WHERE id = ?",
					).get(sc.character_version_id) as { bible: string } | null;
					if (versionRow?.bible) {
						try {
							const bible = JSON.parse(versionRow.bible) as Record<string, unknown>;
							const name = typeof bible.name === "string" ? bible.name : sc.character_name;
							const traits: string[] = [];
							const add = (label: string, value: unknown) => {
								if (typeof value === "string" && value.trim()) traits.push(`${label}: ${value.trim()}`);
							};
							add("age", bible.age);
							add("gender", bible.gender);
							add("heritage", bible.heritage ?? bible.ethnicity);
							add("skin tone", bible.skinTone);
							add("hair", bible.hairColor);
							add("hairstyle", bible.hairStyle);
							add("build", bible.build);
							add("canonical wardrobe", bible.wardrobe);
							add("visual style", bible.visualStyle);
							characterBlocks.push(
								`${name} — ${traits.join("; ")}. Role: ${sc.role_in_scene}. Pose: ${sc.pose_and_expression || "natural"}`,
							);
						} catch {
							characterBlocks.push(`${sc.character_name} — Role: ${sc.role_in_scene}. Pose: ${sc.pose_and_expression || "natural"}`);
						}
					} else {
						characterBlocks.push(`${sc.character_name} — Role: ${sc.role_in_scene}. Pose: ${sc.pose_and_expression || "natural"}`);
					}
				} else {
					characterBlocks.push(`${sc.character_name} — Role: ${sc.role_in_scene}. Pose: ${sc.pose_and_expression || "natural"}`);
				}
			}
			parts.push(`CHARACTERS in this scene:\n${characterBlocks.join("\n")}`);
		}

		// Build prompt from the scene's visual fields — structured as a
		// cinematic shot description so the video model gets clear, layered
		// direction rather than a flat comma-separated list.
		const visualParts: string[] = [];
		if (clipFields.includes("visualEvent") && scene.visualEvent) {
			visualParts.push(scene.visualEvent);
		}
		if (clipFields.includes("environment") && scene.environment) {
			visualParts.push(`Setting: ${scene.environment}`);
		}
		if (clipFields.includes("cameraMovement")) {
			if (scene.cameraFraming) {
				visualParts.push(`Camera: ${scene.cameraFraming}`);
			}
		}
		if (clipFields.includes("lightingAndMood") && scene.lightingAndMood) {
			visualParts.push(`Lighting: ${scene.lightingAndMood}`);
		}
		if (clipFields.includes("motionDescription") && scene.narrationText) {
			visualParts.push(`Action context: ${scene.narrationText}`);
		}

		// Assemble: visual style first (consistency), then scene-specific
		// visual direction, then character info. This gives the video model
		// a clear hierarchy: look → action → who.
		if (visualParts.length > 0) {
			parts.push(visualParts.join(". "));
		}

		const clipPrompt = parts.join(".\n");

		// Determine clip duration
		let durationSec = scene.expectedDurationSeconds ?? 6;
		if (clipDurationRange) {
			durationSec = Math.max(
				clipDurationRange.min,
				Math.min(clipDurationRange.max, durationSec),
			);
		}

		compiledClips.push({
			sceneId: scene.id,
			order: scene.order,
			clipPrompt,
			durationSec,
			isCharacterScene,
			characterVersionIds,
		});
	}

	const characterSceneCount = compiledClips.filter((c) => c.isCharacterScene).length;
	ctx.log(`Compiled ${compiledClips.length} clip prompts (${characterSceneCount} character scenes → image-to-video, ${compiledClips.length - characterSceneCount} non-character → text-to-video)`);

	return {
		success: true,
		outputData: {
			clipPrompts: compiledClips,
			clipCount: compiledClips.length,
			storyId,
		},
	};
};

/**
 * clip_generation — call video-service /generate-clip for each scene's clip.
 *
 * For character scenes: generates a scene image first (via image-service
 * with character reference images), then passes it to fal.ai's
 * image-to-video endpoint for character visual consistency.
 *
 * For non-character scenes: uses fal.ai's text-to-video endpoint directly.
 *
 * Uses the template's configured video model (default: fal-ai/ltx-video).
 */
export const clipGenerationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const tmpl = getTemplate(ctx);
	if (!tmpl) {
		return {
			success: false,
			error: "No template assigned to channel — clip generation requires a template",
			retryable: false,
		};
	}

	// Fetch clip_prompt_compilation results from the DB
	const db = getDb();
	const clipPromptRow = await db
			.prepare(`
    SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'clip_prompt_compilation' AND status = 'completed'
  `)
		.get(ctx.runId) as { result_data: string } | null;
	const clipPromptsResult = clipPromptRow?.result_data
		? (JSON.parse(clipPromptRow.result_data) as {
				storyId?: string;
				clipPrompts?: Array<{
					sceneId: string;
					order: number;
					clipPrompt: string;
					durationSec: number;
					isCharacterScene?: boolean;
					characterVersionIds?: string[];
				}>;
			})
		: {};
	const clipPrompts = clipPromptsResult.clipPrompts;

	if (!clipPrompts || clipPrompts.length === 0) {
		return {
			success: false,
			error: "No clip prompts found — clip_prompt_compilation must complete first",
			retryable: false,
		};
	}

	const videoModel = tmpl.providers.video?.defaultModel ?? "fal-ai/ltx-video";
	const aspectRatio = tmpl.layout.aspectRatio;
	const storyId = clipPromptsResult.storyId;

	const characterSceneCount = clipPrompts.filter((c) => c.isCharacterScene).length;
	ctx.log(`Generating ${clipPrompts.length} video clips via ${videoModel} (aspect: ${aspectRatio}) — ${characterSceneCount} character scenes (image-to-video), ${clipPrompts.length - characterSceneCount} non-character (text-to-video)`);

	// Determine the export directory for clips
	const artifactBase = process.env.ARTIFACT_STORE_PATH ?? "./data/artifacts";
	const exportDir = `${artifactBase}/channels/${ctx.channelId}/runs/${ctx.runId}/clips`;

	const generatedClips: Array<{
		sceneId: string;
		order: number;
		clipFile: string;
		durationSec: number;
		width: number;
		height: number;
		costUsd: number;
	}> = [];

	let totalCost = 0;
	let prevSceneImagePath: string | null = null;

	for (const clip of clipPrompts) {
		const clipFilename = `clip-${String(clip.order).padStart(2, "0")}.mp4`;
		const isCharacterScene = clip.isCharacterScene ?? false;

		ctx.log(`  Generating clip ${clip.order}/${clipPrompts.length} (${clip.durationSec}s, ${isCharacterScene ? "character/image-to-video" : "text-to-video"})...`);

		try {
			let imageUrl: string | undefined;

			// For character scenes: generate a scene image first via image-service,
			// then use fal.ai's image-to-video endpoint to animate it.
			// This gives the video model a visual reference of the character(s)
			// for consistency, just like the image_generation pipeline does.
			if (isCharacterScene && storyId) {
				ctx.log(`    Generating scene image for character scene ${clip.order}...`);
				try {
					const imgResult = await postJson(`${IMAGE_SERVICE_URL}/generate`, {
						sceneId: clip.sceneId,
						runId: ctx.runId,
						stepId: ctx.stepId,
						aspectRatio,
						temperature: 0.85,
						imageProvider: ctx.channelConfig.imageProvider || undefined,
						imageModelCharacter: ctx.channelConfig.imageModelCharacter ?? undefined,
						imageModelNonCharacter: ctx.channelConfig.imageModelNonCharacter ?? undefined,
						prevSceneImagePath: prevSceneImagePath ?? undefined,
					});

					// The image-service returns a filePath on the Docker volume.
					// The video-service runs on the HOST and can't reach Docker-internal
					// URLs, so we pass the assetId and let the video-service construct
					// the URL with its own API_GATEWAY_URL (localhost:3000 on the host).
					const imgFilePath = imgResult.filePath as string | undefined;
					const imgAssetId = imgResult.assetId as string | undefined;
					if (imgFilePath && imgAssetId) {
						imageUrl = `asset:${imgAssetId}`;
						prevSceneImagePath = imgFilePath;
						ctx.log(`    Scene image generated: ${imgFilePath} (cost: $${(imgResult.costUsd as number ?? 0).toFixed(4)})`);
						totalCost += imgResult.costUsd as number ?? 0;
					}
				} catch (imgErr) {
					ctx.log(`    WARNING: Scene image generation failed for clip ${clip.order}, falling back to text-to-video: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
					// Fall back to text-to-video if image generation fails
				}
			}

			const result = await postJson(`${VIDEO_SERVICE_URL}/generate-clip`, {
				prompt: clip.clipPrompt,
				outputDir: exportDir,
				outputFilename: clipFilename,
				model: videoModel,
				aspectRatio,
				durationSec: clip.durationSec,
				runId: ctx.runId,
				stepId: ctx.stepId,
				sceneIndex: clip.order,
				imageUrl,
			});

			generatedClips.push({
				sceneId: clip.sceneId,
				order: clip.order,
				clipFile: clipFilename,
				durationSec: result.durationSec as number,
				width: result.width as number,
				height: result.height as number,
				costUsd: result.costUsd as number,
			});

			totalCost += result.costUsd as number;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			// If budget is exceeded, stop generating but keep the clips we have.
			// Retrying would waste more money re-generating the same clips.
			if (errMsg.includes("Budget exceeded") || errMsg.includes("budget")) {
				ctx.log(`Budget exceeded after ${generatedClips.length}/${clipPrompts.length} clips — stopping (partial success)`);
				break;
			}
			// For other errors (socket closed, timeout, etc.), also stop rather
			// than retrying — retrying re-generates all clips from scratch,
			// wasting money on clips that were already generated.
			ctx.log(`Clip ${clip.order} failed: ${errMsg} — stopping (partial success with ${generatedClips.length} clips)`);
			break;
		}
	}

	ctx.log(`Generated ${generatedClips.length}/${clipPrompts.length} clips (total cost: $${totalCost.toFixed(4)})`);

	// If zero clips were generated, that's a real failure
	if (generatedClips.length === 0) {
		return {
			success: false,
			error: "All clip generations failed",
			retryable: true,
		};
	}

	return {
		success: true,
		outputData: {
			clips: generatedClips,
			clipCount: generatedClips.length,
			exportDir,
			totalCostUsd: totalCost,
		},
		costUsd: totalCost,
	};
};

// === Phase 9 — Google Flow Templates (D021) ===

/**
 * flow_prompt_compilation — compile Flow-optimized prompts for all scenes.
 *
 * Calls image-service /flow-scene-prompts to compile concise, visual prompts
 * optimized for Google Flow. Stores the compiled prompts in step_data.
 * Not a paid step (no API call — just prompt compilation).
 */
export const flowPromptCompilationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const scenePlanRow = await getDb()
		.prepare(`
			SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'scene_plan' AND status = 'completed'
		`)
		.get(ctx.runId) as { result_data: string } | null;
	const scenePlan = scenePlanRow?.result_data
		? (JSON.parse(scenePlanRow.result_data) as { storyId?: string })
		: {};
	const storyId = scenePlan.storyId;

	if (!storyId) {
		return {
			success: false,
			error: "No storyId found — scene_plan must complete first",
			retryable: false,
		};
	}

	ctx.log(`Compiling Flow prompts for story ${storyId}`);

	const result = await postJson(`${IMAGE_SERVICE_URL}/flow-scene-prompts`, {
		storyId,
		aspectRatio: ctx.channelConfig.aspectRatio,
	});

	const prompts = result.prompts as Array<{
		sceneId: string;
		order: number;
		prompt: string;
		mediaType: string;
		expectedFilename: string;
		isCharacterScene: boolean;
		characterNames: string[];
	}>;

	if (!prompts || prompts.length === 0) {
		return {
			success: false,
			error: "No Flow prompts compiled — no scenes found",
			retryable: false,
		};
	}

	ctx.log(`Compiled ${prompts.length} Flow prompts`);

	return {
		success: true,
		outputData: {
			storyId,
			prompts,
			promptCount: prompts.length,
		},
	};
};

/**
 * flow_generation — automated generation via FlowAdapter (CDP).
 *
 * D021: Drives Chrome via CDP to generate 4s video clips and/or images per scene.
 * Iterates scenes serially with delays (per D020). Failed generations are logged
 * and the user can manually upload during flow_upload.
 *
 * This handler calls image-service which hosts the FlowAdapter. The adapter
 * connects to a signed-in Chrome instance via CDP, navigates to the Flow project
 * URL, selects characters, configures settings, types the prompt, submits,
 * intercepts the response, and downloads the media.
 */
export const flowGenerationHandler: StepHandler = async (
	ctx: StepHandlerContext,
): Promise<StepHandlerResult> => {
	const flowProjectUrl = ctx.channelConfig.flowProjectUrl;
	const flowCdpEndpoint = ctx.channelConfig.flowCdpEndpoint ?? "http://127.0.0.1:9222";
	const interRequestDelayMs = ctx.channelConfig.flowInterRequestDelayMs ?? 5000;

	if (!flowProjectUrl) {
		return {
			success: false,
			error: "No flowProjectUrl configured for channel — required for auto generation",
			retryable: false,
		};
	}

	// Get compiled Flow prompts from the previous step
	const flowPromptRow = await getDb()
		.prepare(`
			SELECT result_data FROM workflow_steps WHERE run_id = ? AND step_type = 'flow_prompt_compilation' AND status = 'completed'
		`)
		.get(ctx.runId) as { result_data: string } | null;
	const flowPromptResult = flowPromptRow?.result_data
		? (JSON.parse(flowPromptRow.result_data) as {
				prompts?: Array<{
					sceneId: string;
					order: number;
					prompt: string;
					mediaType: string;
					expectedFilename: string;
					isCharacterScene?: boolean;
					characterNames?: string[];
				}>;
			})
		: {};

	const prompts = flowPromptResult.prompts;
	if (!prompts || prompts.length === 0) {
		return {
			success: false,
			error: "No Flow prompts found — flow_prompt_compilation must complete first",
			retryable: false,
		};
	}

	ctx.log(`Generating ${prompts.length} scenes via Flow CDP (project: ${flowProjectUrl})`);

	const results: Array<{
		sceneId: string;
		order: number;
		mediaType: string;
		status: "generated" | "failed";
		assetId?: string;
		error?: string;
	}> = [];

	let generated = 0;
	let failed = 0;

	for (const prompt of prompts) {
		ctx.log(`Generating scene ${prompt.order}/${prompts.length} (${prompt.mediaType})`);

		try {
			const genResult = await postJson(`${IMAGE_SERVICE_URL}/flow-generate`, {
				sceneId: prompt.sceneId,
				runId: ctx.runId,
				prompt: prompt.prompt,
				mediaType: prompt.mediaType,
				flowProjectUrl,
				cdpEndpoint: flowCdpEndpoint,
				// Pass the first character name so the FlowAdapter can select
				// the character in the Flow UI before generating.
				characterName: prompt.characterNames?.[0],
			});

			const assetId = genResult.assetId as string;
			results.push({
				sceneId: prompt.sceneId,
				order: prompt.order,
				mediaType: prompt.mediaType,
				status: "generated",
				assetId,
			});
			generated++;
			ctx.log(`Scene ${prompt.order} generated (asset: ${assetId})`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			results.push({
				sceneId: prompt.sceneId,
				order: prompt.order,
				mediaType: prompt.mediaType,
				status: "failed",
				error: errMsg,
			});
			failed++;
			ctx.log(`Scene ${prompt.order} failed: ${errMsg}`);
		}

		// Inter-request delay (serialized generation per D020)
		if (prompt.order < prompts.length) {
			ctx.log(`Waiting ${interRequestDelayMs}ms before next generation...`);
			await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
		}
	}

	ctx.log(`Flow generation complete: ${generated} generated, ${failed} failed`);

	// If all scenes failed, that's a real failure
	if (generated === 0) {
		return {
			success: false,
			error: "All Flow generations failed",
			retryable: true,
		};
	}

	return {
		success: true,
		outputData: {
			results,
			generated,
			failed,
			totalCostUsd: 0, // D020: Flow uses subscription credits, cost = 0
		},
		costUsd: 0,
	};
};

/**
 * flow_upload — human approval checkpoint for uploading Flow-generated media.
 *
 * D021: Pauses the run. The frontend shows:
 *   - Compiled Flow prompts for each scene (copy buttons)
 *   - Upload dropzone per scene (mp4/png/jpg)
 *   - Drag-to-reorder clip list
 *   - For auto mode: shows which scenes were auto-generated + failed scenes
 *
 * When the user approves, uploaded files are saved as assets and the run resumes.
 * The approval result data (clipOrder, uploadedAssetIds) is stored as
 * result_data on the workflow_steps table by decideApproval, so downstream
 * steps (voice_generation, package_assembly) can read it.
 *
 * This step is registered as a stub handler — the engine pauses the run
 * before the handler would run, and decideApproval marks the step as
 * completed with the editedData from the frontend. No handler logic needed.
 */

