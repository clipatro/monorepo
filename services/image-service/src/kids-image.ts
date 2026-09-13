// === Kids-template image generation helpers ===
//
// Ported from spikes/s23-kids-runware-deepseek.ts — the spike's proven
// prompt structure, negative prompt, text-safe composition instructions,
// and subtitle-position conflict safeguard.
//
// These helpers are ONLY used for kids templates (kids-9x16, kids-16x9).
// Other templates use the generic prompt compiler path unchanged.

import type { ChannelRow, SceneRow } from "@automation/database";

// === Constants ===

/**
 * Base negative prompt for kids scene images — identical to the spike.
 * Reinforces the no-text rule and blocks quality/anatomy failures.
 */
export const KIDS_NEGATIVE_PROMPT =
	"text, words, letters, numbers, labels, captions, titles, subtitles, speech bubbles, signs, logos, watermarks, studio name, brand name, written characters, typography, font, handwriting, printed text, any text at all, blurry, low quality, deformed, extra limbs, bad anatomy, scary, dark, horror, flat lighting, washed out, cartoon, anime, 2d illustration, rough sketch, noisy, grainy, distorted face, mismatched eyes, extra fingers, malformed hands";

/** Fixed seed for all kids generations — character consistency via prompt + seed. */
export const KIDS_FIXED_SEED = 42;

/** Kids image dimensions — 1024x1536 portrait (2:3 vertical, multiples of 16). */
export const KIDS_IMAGE_WIDTH = 1024;
export const KIDS_IMAGE_HEIGHT = 1536;
export const KIDS_IMAGE_QUALITY = 95;

// === Text placement (mirrors kids capabilities in @automation/remotion-templates) ===
//
// These must stay in sync with the textPlacement configs in
// packages/remotion-templates/src/kids/capabilities.ts. The image service
// cannot import that package (it would pull in Remotion/React), so the
// placements for the five story-video components are mirrored here.

export interface KidsTextPlacement {
	zone: "top" | "bottom" | "center" | "left" | "right" | "full" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
	description: string;
	verticalExtent: { from: number; to: number };
	horizontalExtent: { from: number; to: number };
	/**
	 * When true, the component renders text in a dedicated caption band that
	 * is physically separate from the image window (KidsLetterboxCanvas) —
	 * the image model does NOT need to reserve a clear region. Compose the
	 * scene naturally with the subject fully visible.
	 */
	separateFromImage?: boolean;
}

// All kids components use KidsLetterboxCanvas — text always lives in a
// dedicated caption band OUTSIDE the image window, so every placement has
// separateFromImage: true and the image model composes scenes naturally.
const KIDS_TEXT_PLACEMENTS: Record<string, KidsTextPlacement> = {
	"kids-title-card": {
		zone: "bottom",
		description:
			"The label pill, hook, title, and subtitle appear in a dedicated caption BAND at the bottom of the frame, physically separate from the image window.",
		verticalExtent: { from: 0.58, to: 1.0 },
		horizontalExtent: { from: 0.08, to: 0.92 },
		separateFromImage: true,
	},
	"kids-ending": {
		zone: "bottom",
		description:
			"The label pill, message, and encouragement appear in a dedicated caption BAND at the bottom of the frame, physically separate from the image window.",
		verticalExtent: { from: 0.67, to: 1.0 },
		horizontalExtent: { from: 0.08, to: 0.92 },
		separateFromImage: true,
	},
	"kids-end-card": {
		zone: "bottom",
		description:
			"The final question, subscribe CTA button, and channel name appear in a dedicated caption BAND at the bottom of the frame, physically separate from the image window.",
		verticalExtent: { from: 0.67, to: 1.0 },
		horizontalExtent: { from: 0.08, to: 0.92 },
		separateFromImage: true,
	},
	"kids-subtitle-top-scene": {
		zone: "top",
		description:
			"The subtitle speech bubble appears in a dedicated caption BAND at the TOP of the frame, physically separate from the image window below.",
		verticalExtent: { from: 0.0, to: 0.28 },
		horizontalExtent: { from: 0.1, to: 0.9 },
		separateFromImage: true,
	},
	"kids-subtitle-bottom-scene": {
		zone: "bottom",
		description:
			"The subtitle speech bubble appears in a dedicated caption BAND at the BOTTOM of the frame, physically separate from the image window above.",
		verticalExtent: { from: 0.67, to: 1.0 },
		horizontalExtent: { from: 0.1, to: 0.9 },
		separateFromImage: true,
	},
};

const FALLBACK_PLACEMENT: KidsTextPlacement = KIDS_TEXT_PLACEMENTS["kids-subtitle-bottom-scene"]!;

/**
 * Select the kids component for a scene based on its position in the story
 * and the scene planner's subtitlePosition. Mirrors the selection logic in
 * the kids render route so image generation knows which text region to protect.
 */
export function kidsComponentSlugForScene(
	order: number,
	lastOrder: number,
	subtitlePosition: string | null,
): string {
	if (order === 1) return "kids-title-card";
	if (order === lastOrder) return "kids-end-card";
	if (order === lastOrder - 1) return "kids-ending";
	return subtitlePosition === "top"
		? "kids-subtitle-top-scene"
		: "kids-subtitle-bottom-scene";
}

export function getKidsTextPlacement(componentSlug: string): KidsTextPlacement {
	return KIDS_TEXT_PLACEMENTS[componentSlug] ?? FALLBACK_PLACEMENT;
}

/**
 * Build a concise, image-model-friendly composition directive from a
 * component's text placement. Ported from
 * packages/remotion-templates/src/kids/capabilities.ts.
 */
export function textPlacementToImageInstructions(tp: KidsTextPlacement): string {
	const vFromPct = Math.round(tp.verticalExtent.from * 100);
	const vToPct = Math.round(tp.verticalExtent.to * 100);
	const hFromPct = Math.round(tp.horizontalExtent.from * 100);
	const hToPct = Math.round(tp.horizontalExtent.to * 100);

	// Letterboxed components render text in a dedicated band that is physically
	// separate from the image — the image model does NOT need to reserve any
	// region. Just compose the scene naturally with the subject fully visible.
	if (tp.separateFromImage) {
		return [
			`COMPOSITION: A text caption will be rendered in a dedicated band OUTSIDE this image (at the ${tp.zone} of the frame) — no text or captions appear inside the image itself.`,
			`Compose the scene naturally: subject centered and fully visible, nothing cropped or pushed against any edge. Leave a little breathing room around the subject.`,
		].join(" ");
	}

	let safeZone: string;
	if (tp.zone === "top") {
		safeZone = `Place all characters and important objects in the LOWER ${100 - vToPct}% of the frame (below ${vToPct}% down).`;
	} else if (tp.zone === "bottom") {
		safeZone = `Place all characters and important objects in the UPPER ${vFromPct}% of the frame (above ${vFromPct}% down).`;
	} else if (tp.zone === "center") {
		safeZone = `Place all characters and important objects near the TOP (above ${vFromPct}% down) and BOTTOM (below ${vToPct}% down) edges — keep the vertical center clear.`;
	} else if (tp.zone === "left") {
		safeZone = `Place all characters and important objects on the RIGHT side (right of ${hToPct}% across).`;
	} else if (tp.zone === "right") {
		safeZone = `Place all characters and important objects on the LEFT side (left of ${hFromPct}% across).`;
	} else {
		safeZone = `Place all characters and important objects away from the ${tp.zone} region of the frame.`;
	}

	return [
		`COMPOSITION / TEXT-SAFE AREA: A text caption overlay will appear in the ${tp.zone.toUpperCase()} region of the frame (vertically ${vFromPct}%-${vToPct}% down, horizontally ${hFromPct}%-${hToPct}% across).`,
		safeZone,
		`Keep that ${tp.zone.toUpperCase()} text region clear of characters, faces, hands, and important objects — leave negative spacing so the caption never overlaps them. Nothing cropped or pushed against any edge.`,
	].join(" ");
}

/** Negative-prompt fragment reinforcing the text-safe area. */
export function textPlacementToNegativeHint(tp: KidsTextPlacement): string {
	// Letterboxed components keep text outside the image entirely — the
	// negative prompt only needs to guard against a cropped/edge-pressed subject.
	if (tp.separateFromImage) {
		return `cropped subject, subject touching frame edge, text, captions, letters, words, labels`;
	}
	const vFromPct = Math.round(tp.verticalExtent.from * 100);
	const vToPct = Math.round(tp.verticalExtent.to * 100);
	return `characters or important objects in the ${tp.zone} text region (${vFromPct}%-${vToPct}% down), text overlap, cropped subject, subject touching frame edge`;
}

// === Subtitle-position composition safeguard (ported from the spike) ======
//
// Runs AFTER the scene plan is generated but BEFORE image generation. For
// each scene, it analyzes the visualEvent for character/subject position
// cues and checks them against the chosen subtitlePosition. With the
// letterbox layout the caption band is physically separate from the image,
// so overlap is impossible — but matching the band to the subject's
// position still produces better composition (a character looking up reads
// naturally with the caption above). If the subject is described in the
// SAME region the band would occupy, the position is flipped.

const STRONG_UPPER_CUES = [
	"arms stretched upward",
	"arms stretched up",
	"arms raised",
	"reaching up",
	"reaching upward",
	"lifted high",
	"held high",
	"held up",
	"held above",
	"stretched upward",
	"stretched up",
	"looking up",
	"up into the sky",
	"floating up",
	"rising into",
	"rising up",
	"climbing up",
	"ascending",
	"standing tall",
	"towering over",
	"from above",
	"aerial view",
	"overhead",
];

const STRONG_LOWER_CUES = [
	"kneeling",
	"kneeling down",
	"lying down",
	"on the ground",
	"crouching",
	"sitting down",
	"looking up at",
	"underground",
	"in the valley",
	"down low",
	"at the bottom",
	"bottom of the frame",
];

function detectOccupiedRegions(imagePrompt: string): { upper: boolean; lower: boolean } {
	const prompt = imagePrompt.toLowerCase();
	let upperScore = 0;
	let lowerScore = 0;
	for (const cue of STRONG_UPPER_CUES) {
		if (prompt.includes(cue)) upperScore++;
	}
	for (const cue of STRONG_LOWER_CUES) {
		if (prompt.includes(cue)) lowerScore++;
	}
	return { upper: upperScore > 0, lower: lowerScore > 0 };
}

function hasSubtitleConflict(
	occupied: { upper: boolean; lower: boolean },
	subtitleZone: "top" | "bottom",
): boolean {
	if (subtitleZone === "top" && occupied.upper) return true;
	if (subtitleZone === "bottom" && occupied.lower) return true;
	return false;
}

/**
 * Validate and correct each scene's subtitlePosition against the
 * character/object positions described in its visualEvent. If a conflict is
 * detected, flip the subtitlePosition to the opposite side.
 *
 * Special scenes (first = title card, last = end card, second-to-last =
 * ending) are skipped — they use fixed-layout components whose text
 * placement doesn't depend on subtitlePosition.
 *
 * Mutates the scenes in place and returns corrections for logging.
 */
export function validateSubtitlePositions(
	scenes: Array<{ order: number; visualEvent: string; subtitlePosition?: "top" | "bottom" }>,
): Array<{ order: number; original: string; corrected: string; reason: string }> {
	const corrections: Array<{ order: number; original: string; corrected: string; reason: string }> = [];
	const lastIndex = scenes.length - 1;

	for (let i = 0; i < scenes.length; i++) {
		const scene = scenes[i]!;
		if (i === 0 || i === lastIndex || i === lastIndex - 1) continue;

		const chosen = scene.subtitlePosition ?? "bottom";
		const occupied = detectOccupiedRegions(scene.visualEvent);

		if (hasSubtitleConflict(occupied, chosen)) {
			const flipped = chosen === "top" ? "bottom" : "top";
			const regionCues = [
				occupied.upper ? "upper" : null,
				occupied.lower ? "lower" : null,
			]
				.filter(Boolean)
				.join("+");
			corrections.push({
				order: scene.order,
				original: chosen,
				corrected: flipped,
				reason: `Subject occupies the ${regionCues} region, caption band was at ${chosen} — flipped to ${flipped} for better composition`,
			});
			scene.subtitlePosition = flipped;
		}
	}

	return corrections;
}

// === Kids prompt builder (ported from the spike) ==========================

/**
 * Build the kids art-style prefix — the consistent header for every scene
 * prompt. Uses the character's lockedIdentity verbatim (from the bible) so
 * the exact same character description appears in every image, combined
 * with the fixed seed for maximum consistency.
 */
export function buildKidsArtStylePrefix(
	channel: ChannelRow,
	bible: Record<string, unknown> | null,
	characterIdentity: string | null,
): string {
	const palette = channel.visual_style?.trim()
		? `${channel.visual_style.trim().replace(/\.$/, "")}.`
		: "Warm golden palette (oranges, ambers, soft browns). Cozy atmosphere.";

	const name =
		(typeof bible?.name === "string" && bible.name.trim()) || "the main character";
	const locked =
		typeof bible?.lockedIdentity === "string" && bible.lockedIdentity.trim()
			? bible.lockedIdentity.trim()
			: characterIdentity;

	const identityBlock = locked
		? `${String(name).toUpperCase()} (same character in every image): ${locked}. Keep their face, hair, skin tone, clothing, and proportions EXACTLY consistent across every scene.`
		: "";

	return `HIGH-QUALITY 3D ANIMATED MOVIE STYLE — like a modern Pixar/Disney animated film. Warm, cinematic children's animation with soft volumetric lighting, rich textures. ${palette} Sharp focus, high detail, professional quality.

${identityBlock}

ART STYLE: 3D animated movie style, warm cinematic lighting, rich textures, sharp focus. Vertical portrait composition.

ABSOLUTELY NO TEXT: 100% text-free image. No words, letters, numbers, labels, captions, titles, subtitles, speech bubbles, signs, logos, watermarks, or written characters. Only pure visual artwork — characters, objects, environment. All text is added separately as overlays.`;
}

/**
 * Build the full kids image prompt for a scene — mirrors the spike's
 * structure exactly:
 *
 *   ART_STYLE_PREFIX (style + locked identity + no-text rules)
 *   SCENE: <stripped visual event>
 *   EMOTION: <scene emotion>
 *   <text-safe composition instructions from the selected component>
 *   Vertical portrait composition. Absolutely no text in image.
 *
 * Returns the positive prompt and the scene-specific negative prompt.
 */
export function buildKidsImagePrompt(params: {
	channel: ChannelRow;
	scene: SceneRow;
	lastOrder: number;
	bible: Record<string, unknown> | null;
	characterIdentity: string | null;
	cleanedVisualEvent: string;
}): { prompt: string; negativePrompt: string; componentSlug: string } {
	const { channel, scene, lastOrder, bible, characterIdentity, cleanedVisualEvent } = params;

	const componentSlug = kidsComponentSlugForScene(
		scene.order,
		lastOrder,
		scene.subtitle_position,
	);
	const textPlacement = getKidsTextPlacement(componentSlug);
	const textSafeInstructions = textPlacementToImageInstructions(textPlacement);
	const textSafeNegative = textPlacementToNegativeHint(textPlacement);
	const artStylePrefix = buildKidsArtStylePrefix(channel, bible, characterIdentity);

	const prompt = `${artStylePrefix}

SCENE: ${cleanedVisualEvent}

EMOTION: ${scene.emotion ?? "warmth"}

${textSafeInstructions}

Vertical portrait composition. Absolutely no text in image.`;

	return {
		prompt,
		negativePrompt: `${KIDS_NEGATIVE_PROMPT}, ${textSafeNegative}`,
		componentSlug,
	};
}
