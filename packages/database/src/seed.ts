/**
 * Shared seed logic — creates all default channels and characters.
 *
 * Imported by:
 *   - scripts/seed.ts (CLI: `bun run seed`)
 *   - api-gateway POST /api/seed endpoint
 *
 * Channels:
 *   1. "Emily's Mediterranean Life" — short stories with 3 characters (Emily, George, Noah)
 *   2. "Unsolved & Unexplained" — historical mysteries, no characters, image + narration only
 *
 * Idempotent: skips channels that already exist (unless reset=true).
 */

import { getDb, closeDb } from "./connection.ts";
import type { Database } from "./connection.ts";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadConfig } from "@automation/config";

// === Character bibles ===

const NOAH_BIBLE = {
	name: "Noah",
	age: 30,
	gender: "male",
	background: "mixed European and Mediterranean",
	skinTone: "light olive, neutral undertones",
	eyeColor: "hazel-green",
	hairColor: "chestnut-brown",
	hairStyle: "medium-short, softly wavy, side-parted",
	facialHair: "subtle one-day brown stubble",
	build: "lean, average",
	faceShape: "angular oval",
	personality: [
		"intelligent",
		"observant",
		"calm",
		"trustworthy",
		"emotionally perceptive",
	],
	wardrobe: {
		overshirt: "deep forest-green cotton, open, sleeves rolled",
		tshirt: "warm off-white crew-neck",
	},
	visualStyle: "photorealistic, natural, unretouched editorial photography",
	expression: "relaxed, neutral, slightly curious",
	role: "recurring visual host for short-form storytelling",
};

const EMILY_BIBLE = {
	name: "Emily",
	age: 28,
	gender: "female",
	background: "mixed European and Mediterranean",
	skinTone: "light olive, neutral-warm undertones",
	eyeColor: "warm hazel-brown",
	hairColor: "dark chestnut-brown",
	hairStyle:
		"medium-length, naturally wavy, loosely parted slightly off-center",
	facialHair: "none",
	build: "slim, average",
	faceShape: "softly angular oval",
	personality: [
		"intelligent",
		"observant",
		"emotionally perceptive",
		"composed",
		"curious",
	],
	wardrobe: {
		cardigan: "muted deep-burgundy lightweight knit, worn open",
		top: "plain warm ivory crew-neck",
	},
	visualStyle: "photorealistic, natural, unretouched editorial photography",
	expression: "neutral, relaxed, slight hint of warmth",
	role: "recurring visual host for short-form storytelling",
};

const GEORGE_BIBLE = {
	name: "George",
	age: 58,
	gender: "male",
	background: "mixed European and Mediterranean",
	skinTone: "weathered light-olive, neutral-warm undertones",
	eyeColor: "deep-set warm brown",
	hairColor: "salt-and-pepper gray",
	hairStyle: "short, close-cropped, slightly thinning at temples",
	facialHair: "neatly trimmed short gray-flecked beard",
	build: "solidly built, average",
	faceShape: "square-ish oval, naturally asymmetrical",
	personality: [
		"steady",
		"thoughtful",
		"guarded",
		"quietly authoritative",
		"perceptive",
	],
	wardrobe: {
		sweater: "heather-charcoal lightweight quarter-zip, worn over top",
		top: "plain slate-gray crew-neck",
		accessory: "plain thin silver band on left hand",
	},
	visualStyle: "photorealistic, natural, unretouched editorial photography",
	expression: "neutral, relaxed, faint trace of weariness around the eyes",
	role: "recurring visual host for short-form storytelling",
};

const MARTA_BIBLE = {
	name: "Marta",
	age: 18,
	gender: "female",
	background: "Eastern/Central European village, traditional folk culture",
	skinTone: "fair, naturally rosy cheeks",
	eyeColor: "warm brown",
	hairColor: "honey-blonde",
	hairStyle:
		"one thick braid or two braids pinned up, adult styling, a few loose strands framing the face",
	build: "average adult female build, natural proportions",
	faceShape:
		"oval, mature adult features — defined cheekbones, adult jawline",
	personality: [
		"warm",
		"calm",
		"nurturing",
		"patient",
		"a little old-fashioned",
		"attentive to detail",
	],
	wardrobe: {
		dress: "modest, long-sleeved, high-necked dress in muted rust-red or deep green, mid-calf to ankle length",
		apron: "cream-colored pinafore or waist apron with hand-stitched floral trim, practical for cooking",
		headwear:
			"simple embroidered kerchief or hair tied back, practical for kitchen work",
		sleeves: "rolled or pushed up at the forearm for cooking tasks",
		shoes: "simple flat shoes, not visible in most shots",
	},
	visualStyle:
		"2D animated / stylized illustration, warm hand-painted look, storybook-realistic aesthetic",
	expression:
		"calm, focused, gently warm — the demeanor of someone comfortable and unhurried in a kitchen",
	role: "recurring adult character, host of a cooking/ASMR-style animated series set in a village kitchen",
};

// D021: Musachi — character for the Flow auto-generation channel.
// The character exists in the Google Flow project (not as local reference images).
// The bible is used by the story/scene planner to generate consistent prompts;
// the FlowAdapter selects the character by name in the Flow UI.
const MUSACHI_BIBLE = {
	name: "Musachi",
	age: 25,
	gender: "male",
	background: "Japanese, urban creative",
	skinTone: "light, neutral undertones",
	eyeColor: "dark brown",
	hairColor: "black, slightly tousled",
	hairStyle: "medium-short, textured, casual",
	build: "slim, average height",
	faceShape: "oval, soft jawline",
	personality: [
		"curious",
		"calm",
		"observant",
		"thoughtful",
		"quietly confident",
	],
	wardrobe: {
		top: "minimalist black or white t-shirt, occasionally a light jacket",
		bottom: "dark slim trousers or jeans",
		shoes: "clean white sneakers",
	},
	visualStyle: "cinematic, natural light, shallow depth of field, film-like color grade",
	expression: "relaxed, contemplative, faintly curious",
	role: "recurring character for cinematic short-form videos generated via Google Flow",
};

// === Channel definitions ===

interface CharacterSeed {
	name: string;
	role: string;
	bible: Record<string, unknown>;
}

interface ChannelSeed {
	name: string;
	slug: string;
	niche: string;
	locale: string;
	contentTypes: string[];
	targetDurationSeconds: number;
	sceneMin: number;
	sceneMax: number;
	storyStyle: string;
	visualStyle: string;
	imageProvider: string;
	ttsProvider: string;
	ttsVoiceId: string;
	aspectRatio: string;
	approvalEnabled: boolean;
	llmConfig: Record<string, { provider: string; model: string }>;
	imageModelCharacter: string;
	imageModelNonCharacter: string;
	researchEnabled: boolean;
	duplicateAdjudicationEnabled: boolean;
	videoGenerationEnabled: boolean;
	videoTemplate: string;
	/** D020: Optional background audio file to copy from media/ into the artifact store. */
	backgroundAudioFile?: string;
	/** D021: Flow project URL for auto-generation via CDP. */
	flowProjectUrl?: string;
	/** D021: CDP endpoint (default http://127.0.0.1:9222). */
	flowCdpEndpoint?: string;
	/** D021: Inter-request delay in ms (default 5000). */
	flowInterRequestDelayMs?: number;
	characters: CharacterSeed[];
	activeCharacterName?: string;
}

const DEEPSEEK_LLM_CONFIG = {
	classification: { provider: "deepseek", model: "deepseek-v4-flash" },
	research: { provider: "deepseek", model: "deepseek-v4-flash" },
	research_structuring: { provider: "deepseek", model: "deepseek-v4-flash" },
	story_candidates: { provider: "deepseek", model: "deepseek-v4-flash" },
	scene_planning: { provider: "deepseek", model: "deepseek-v4-flash" },
	story_dna: { provider: "deepseek", model: "deepseek-v4-flash" },
	story_generation: { provider: "deepseek", model: "deepseek-v4-flash" },
	duplicate_adjudication: { provider: "deepseek", model: "deepseek-v4-flash" },
	scene_plan: { provider: "deepseek", model: "deepseek-v4-flash" },
};

const CHANNELS: ChannelSeed[] = [
	{
		name: "Emily's Mediterranean Life",
		slug: "emily-mediterranean-life",
		niche:
			"Short-form stories about Emily, a Mediterranean woman, and her family — relationships, tensions, and quiet moments of recognition.",
		locale: "en-US",
		contentTypes: ["fictional_story", "psychology_concept_story", "motivational"],
		targetDurationSeconds: 45,
		sceneMin: 4,
		sceneMax: 8,
		storyStyle:
			"direct, observant, emotionally restrained — show the moment, not the moral",
		visualStyle:
			"Authentic documentary photography with natural available light. Realistic skin, ordinary imperfections, no glossy advertising finish. Warm Mediterranean tones where applicable.",
		imageProvider: "fal",
		ttsProvider: "gemini",
		ttsVoiceId: "Erinome",
		aspectRatio: "1:1",
		approvalEnabled: false,
		llmConfig: DEEPSEEK_LLM_CONFIG,
		imageModelCharacter: "fal-ai/flux-2/klein/9b/edit",
		imageModelNonCharacter: "fal-ai/flux-2/klein/4b/edit",
		researchEnabled: false,
		duplicateAdjudicationEnabled: false,
		videoGenerationEnabled: true,
		videoTemplate: "gameplay-with-image-scenes",
		characters: [
			{ name: "Emily", role: "protagonist", bible: EMILY_BIBLE },
			{ name: "George", role: "supporting", bible: GEORGE_BIBLE },
			{ name: "Noah", role: "recurring host", bible: NOAH_BIBLE },
		],
		activeCharacterName: "Emily",
	},
	{
		name: "Unsolved & Unexplained",
		slug: "unsolved-unexplained",
		niche:
			"Short-form historical mysteries — each video unpacks an unsolved event, vanished civilization, strange artifact, or unexplained phenomenon from the historical record. Pure narration over evocative imagery. No host, no characters, no dramatization — just the facts, the gaps, and the questions that remain.",
		locale: "en-US",
		contentTypes: ["historical_event", "documentary_style", "true_case"],
		targetDurationSeconds: 60,
		sceneMin: 5,
		sceneMax: 10,
		storyStyle:
			"measured, investigative, evidence-first — lead with the mystery, layer the known facts, acknowledge what's missing, end on the open question. No speculation presented as fact.",
		visualStyle:
			"Atmospheric historical illustration and documentary photography. Period-accurate textures, muted earth tones, dramatic natural light, weathered surfaces. No modern elements unless directly relevant. Evocative but grounded — no fantasy, no supernatural effects.",
		imageProvider: "fal",
		ttsProvider: "gemini",
		ttsVoiceId: "Algenib",
		aspectRatio: "16:9",
		approvalEnabled: false,
		llmConfig: DEEPSEEK_LLM_CONFIG,
		imageModelCharacter: "fal-ai/flux-2/klein/9b/edit",
		imageModelNonCharacter: "fal-ai/flux-2/klein/4b/edit",
		researchEnabled: true,
		duplicateAdjudicationEnabled: false,
		videoGenerationEnabled: true,
		videoTemplate: "gameplay-with-image-scenes",
		backgroundAudioFile: "background.mp3",
		characters: [],
	},
	{
		name: "Marta's Village Kitchen",
		slug: "marta-village-kitchen",
		niche:
			"Short-form cooking and ASMR-style animated stories set in a traditional Eastern European village kitchen. Marta, a warm and patient young woman, prepares rustic dishes with seasonal ingredients — breads, stews, preserves, pastries — while the narration weaves in folk wisdom, family memory, and the quiet rhythms of village life. No modern appliances, no rush, no spectacle — just hands, food, and hearth.",
		locale: "en-US",
		contentTypes: ["fictional_story", "educational_explainer", "tutorial"],
		targetDurationSeconds: 60,
		sceneMin: 5,
		sceneMax: 9,
		storyStyle:
			"gentle, sensory, unhurried — lead with the hands and the food, let the narration be warm and practical, weave in folk wisdom and family memory naturally. No urgency, no spectacle, no modern references.",
		visualStyle:
			"2D animated stylized illustration with a warm hand-painted storybook aesthetic. Soft natural light from a kitchen window, muted earth tones, textured surfaces (wood, clay, linen, copper). Period-accurate village kitchen — no modern appliances, no plastic, no chrome. The character should look like the same illustrated person across every scene.",
		imageProvider: "fal",
		ttsProvider: "gemini",
		ttsVoiceId: "Algenib",
		aspectRatio: "9:16",
		approvalEnabled: false,
		llmConfig: DEEPSEEK_LLM_CONFIG,
		imageModelCharacter: "fal-ai/flux-2/klein/9b/edit",
		imageModelNonCharacter: "fal-ai/flux-2/klein/4b/edit",
		researchEnabled: false,
		duplicateAdjudicationEnabled: false,
		videoGenerationEnabled: true,
		videoTemplate: "gameplay-with-image-scenes",
		characters: [
			{ name: "Marta", role: "protagonist", bible: MARTA_BIBLE },
		],
		activeCharacterName: "Marta",
	},
	{
		name: "Musachi Cinematic Shorts",
		slug: "musachi-cinematic-shorts",
		niche:
			"Cinematic short-form stories following Musachi, a young Japanese creative, through quiet moments of urban life — morning routines, walks through the city, encounters with strangers, reflections at golden hour. Each video is a 30-second mood piece with voice-over narration. Generated via Google Flow (auto CDP mode) as 4-second video clips with hybrid static images.",
		locale: "en-US",
		contentTypes: ["fictional_story", "motivational", "commentary"],
		targetDurationSeconds: 30,
		sceneMin: 4,
		sceneMax: 7,
		storyStyle:
			"cinematic, atmospheric, minimal — show the moment, let the image breathe, narration is sparse and evocative. No exposition, no conflict resolution, just mood and movement.",
		visualStyle:
			"Cinematic, natural light, shallow depth of field, film-like color grade. Golden hour, neon-lit evenings, rain-slicked streets. Japanese urban aesthetics — clean lines, soft textures, muted palette with warm highlights.",
		imageProvider: "flow",
		ttsProvider: "kokoro",
		ttsVoiceId: "af_heart",
		aspectRatio: "9:16",
		approvalEnabled: true,
		llmConfig: DEEPSEEK_LLM_CONFIG,
		imageModelCharacter: "flow",
		imageModelNonCharacter: "flow",
		researchEnabled: false,
		duplicateAdjudicationEnabled: false,
		videoGenerationEnabled: true,
		videoTemplate: "flow-auto",
		// D021: Flow config — the Musachi test project from S15 spike
		flowProjectUrl: "https://labs.google/fx/tools/flow/project/28a694c1-afc4-4327-b964-2d3416fc716c",
		flowCdpEndpoint: "http://127.0.0.1:9222",
		flowInterRequestDelayMs: 5000,
		characters: [
			{ name: "Musachi", role: "protagonist", bible: MUSACHI_BIBLE },
		],
		activeCharacterName: "Musachi",
	},
	{
		name: "Evidence Room",
		slug: "evidence-room",
		niche:
			"Short-form documentary shorts unpacking pivotal historical events, policy decisions, and social transformations. Each video leads with evidence — archival records, declassified documents, verified statistics — and builds a clear, authoritative narrative around what happened, why it mattered, and what remains uncertain. Pure narration over real imagery. No host, no characters, no dramatization — just the facts, the sources, and the consequences.",
		locale: "en-US",
		contentTypes: ["historical_event", "documentary_style", "true_case"],
		targetDurationSeconds: 75,
		sceneMin: 6,
		sceneMax: 10,
		storyStyle:
			"authoritative, evidence-first, measured — lead with the fact, layer the context, cite the source, acknowledge the uncertainty. No speculation presented as fact. Build toward a clear conclusion and a memorable takeaway.",
		visualStyle:
			"Editorial documentary photography and archival imagery. Period-accurate textures, muted earth tones, dramatic natural light, weathered surfaces. Real images from Wikipedia/Wikimedia when available; AI-generated fallbacks only when no real image fits. Treatments: documentary, archive, monochrome, clean.",
		imageProvider: "fal",
		ttsProvider: "gemini",
		ttsVoiceId: "Algenib",
		aspectRatio: "9:16",
		approvalEnabled: false,
		llmConfig: DEEPSEEK_LLM_CONFIG,
		imageModelCharacter: "fal-ai/flux-2/klein/9b/edit",
		imageModelNonCharacter: "fal-ai/flux-2/klein/4b/edit",
		researchEnabled: true,
		duplicateAdjudicationEnabled: false,
		videoGenerationEnabled: true,
		videoTemplate: "documentary-9x16",
		backgroundAudioFile: "background.mp3",
		characters: [],
	},
];

// === Helpers ===

const REFERENCE_IMAGES = [
	{ file: "portrait.jpg", role: "front" },
	{ file: "three-quarter.jpg", role: "three-quarter" },
	{ file: "side-profile.jpg", role: "side" },
	{ file: "expressions.jpg", role: "expression" },
];

function uuid(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

function readJpegDimensions(buf: Buffer): { width: number; height: number } {
	if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i < buf.length - 8) {
			if (buf[i] !== 0xff) break;
			const marker = buf[i + 1] ?? 0;
			if (
				marker >= 0xc0 &&
				marker <= 0xcf &&
				marker !== 0xc4 &&
				marker !== 0xc8 &&
				marker !== 0xcc
			) {
				return {
					width: buf.readUInt16BE(i + 7),
					height: buf.readUInt16BE(i + 5),
				};
			}
			if (
				marker === 0xd8 ||
				marker === 0xd9 ||
				(marker >= 0xd0 && marker <= 0xd7)
			) {
				i += 2;
			} else {
				const len = buf.readUInt16BE(i + 2);
				i += 2 + len;
			}
		}
	}
	return { width: 512, height: 512 };
}

async function copyReferenceImages(
	characterName: string,
	characterId: string,
	versionId: string,
	channelId: string,
	artifactStore: string,
	charactersDir: string,
): Promise<
	Array<{
		role: string;
		filePath: string;
		checksum: string;
		mimeType: string;
		width: number;
		height: number;
	}>
> {
	const sourceDir = join(charactersDir, characterName, "optimized-512");
	const destDir = join(
		artifactStore,
		"channels",
		channelId,
		"characters",
		characterId,
		"versions",
		versionId,
	);

	if (!existsSync(destDir)) {
		await mkdir(destDir, { recursive: true });
	}

	const results: Array<{
		role: string;
		filePath: string;
		checksum: string;
		mimeType: string;
		width: number;
		height: number;
	}> = [];

	for (const ref of REFERENCE_IMAGES) {
		const sourcePath = join(sourceDir, ref.file);
		if (!existsSync(sourcePath)) {
			console.warn(`  WARNING: Reference image not found: ${sourcePath}`);
			continue;
		}

		const fileName = `${uuid()}.jpg`;
		const destPath = join(destDir, fileName);
		await copyFile(sourcePath, destPath);

		const fileBuffer = await Bun.file(destPath).arrayBuffer();
		const checksum = createHash("sha256")
			.update(Buffer.from(fileBuffer))
			.digest("hex");

		const dimensions = readJpegDimensions(Buffer.from(fileBuffer));

		results.push({
			role: ref.role,
			filePath: destPath,
			checksum,
			mimeType: "image/jpeg",
			width: dimensions.width,
			height: dimensions.height,
		});
	}

	return results;
}

// === Per-channel seed ===

async function deleteChannelData(
	db: Database,
	channelId: string,
): Promise<void> {
	// Delete character reference files
	const chars = await db
		.prepare("SELECT id FROM characters WHERE channel_id = ?")
		.all(channelId) as Array<{ id: string }>;
	for (const char of chars) {
		const versions = await db
			.prepare("SELECT id FROM character_versions WHERE character_id = ?")
			.all(char.id) as Array<{ id: string }>;
		for (const version of versions) {
			const refs = await db
				.prepare(
					"SELECT file_path FROM character_references WHERE character_version_id = ?",
				)
				.all(version.id) as Array<{ file_path: string }>;
			for (const ref of refs) {
				try {
					await Bun.file(ref.file_path).unlink?.();
				} catch {
					/* may not exist */
				}
			}
		}
	}
	await db.prepare(
		"DELETE FROM scene_characters WHERE scene_id IN (SELECT id FROM scenes WHERE story_id IN (SELECT id FROM stories WHERE channel_id = ?))",
	).run(channelId);
	await db.prepare(
		"DELETE FROM scenes WHERE story_id IN (SELECT id FROM stories WHERE channel_id = ?)",
	).run(channelId);
	await db.prepare("DELETE FROM stories WHERE channel_id = ?").run(channelId);
	await db.prepare("DELETE FROM channel_characters WHERE channel_id = ?").run(
		channelId,
	);
	await db.prepare(
		"DELETE FROM character_references WHERE character_version_id IN (SELECT id FROM character_versions WHERE character_id IN (SELECT id FROM characters WHERE channel_id = ?))",
	).run(channelId);
	await db.prepare(
		"DELETE FROM character_versions WHERE character_id IN (SELECT id FROM characters WHERE channel_id = ?)",
	).run(channelId);
	await db.prepare("DELETE FROM characters WHERE channel_id = ?").run(channelId);
	await db.prepare("DELETE FROM workflow_runs WHERE channel_id = ?").run(channelId);
	await db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
}

async function seedChannel(
	ch: ChannelSeed,
	reset: boolean,
	artifactStore: string,
	charactersDir: string,
): Promise<{ channelId: string; created: boolean; characters: number }> {
	const db = getDb();

	const existing = await db
		.prepare("SELECT id FROM channels WHERE slug = ?")
		.get(ch.slug) as { id: string } | null;

	if (existing && !reset) {
		console.log(
			`  Channel "${ch.name}" already exists — skipping (use reset=true to re-seed)`,
		);
		return { channelId: existing.id, created: false, characters: 0 };
	}

	if (existing && reset) {
		console.log(`  Resetting "${ch.name}"...`);
		await deleteChannelData(db, existing.id);
	}

	// === Create channel ===
	const channelId = uuid();
	const ts = now();

	console.log(`  Creating channel: "${ch.name}"`);
	await db.prepare(`
    INSERT INTO channels (
      id, name, slug, niche, locale, content_types,
      target_duration_seconds, scene_min, scene_max,
      story_style, visual_style, image_provider, tts_provider, tts_voice_id, aspect_ratio,
      approval_enabled, llm_config, image_model_character, image_model_non_character,
      research_enabled, duplicate_adjudication_enabled, video_generation_enabled, video_template,
      flow_project_url, flow_cdp_endpoint, flow_inter_request_delay_ms,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
		channelId,
		ch.name,
		ch.slug,
		ch.niche,
		ch.locale,
		JSON.stringify(ch.contentTypes),
		ch.targetDurationSeconds,
		ch.sceneMin,
		ch.sceneMax,
		ch.storyStyle,
		ch.visualStyle,
		ch.imageProvider,
		ch.ttsProvider,
		ch.ttsVoiceId,
		ch.aspectRatio,
		ch.approvalEnabled ? 1 : 0,
		JSON.stringify(ch.llmConfig),
		ch.imageModelCharacter,
		ch.imageModelNonCharacter,
		ch.researchEnabled ? 1 : 0,
		ch.duplicateAdjudicationEnabled ? 1 : 0,
		ch.videoGenerationEnabled ? 1 : 0,
		ch.videoTemplate,
		ch.flowProjectUrl ?? null,
		ch.flowCdpEndpoint ?? null,
		ch.flowInterRequestDelayMs ?? null,
		ts,
		ts,
	);

	// D020: Copy background audio file if specified
	if (ch.backgroundAudioFile) {
		const mediaDir = join(process.cwd(), "media");
		const bgSourcePath = join(mediaDir, ch.backgroundAudioFile);
		if (existsSync(bgSourcePath)) {
			const bgDir = join(artifactStore, "channels", channelId);
			if (!existsSync(bgDir)) {
				await mkdir(bgDir, { recursive: true });
			}
			const bgDestPath = join(bgDir, "background-audio.mp3");
			await copyFile(bgSourcePath, bgDestPath);
			await db.prepare("UPDATE channels SET background_audio_path = ? WHERE id = ?").run(bgDestPath, channelId);
			console.log(`    Background audio: ${ch.backgroundAudioFile} copied`);
		} else {
			console.warn(`    WARNING: Background audio file not found: ${bgSourcePath}`);
		}
	}

	// === Create characters ===
	for (const charSeed of ch.characters) {
		const characterId = uuid();
		const versionId = uuid();
		const charTs = now();

		console.log(`    Creating character: ${charSeed.name} (${charSeed.role})`);

		await db.prepare(`
      INSERT INTO characters (id, channel_id, name, role, auto_created, source_run_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(characterId, channelId, charSeed.name, charSeed.role, charTs, charTs);

		await db.prepare(`
      INSERT INTO character_versions (id, character_id, version, bible, status, created_at, frozen_at)
      VALUES (?, ?, 1, ?, 'frozen', ?, ?)
    `).run(
			versionId,
			characterId,
			JSON.stringify(charSeed.bible),
			charTs,
			charTs,
		);

		await db.prepare(`
      INSERT INTO channel_characters (id, channel_id, character_id, added_at, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid(), channelId, characterId, charTs, ch.activeCharacterName === charSeed.name ? 1 : 0);

		const refs = await copyReferenceImages(
			charSeed.name,
			characterId,
			versionId,
			channelId,
			artifactStore,
			charactersDir,
		);
		for (const ref of refs) {
			await db.prepare(`
        INSERT INTO character_references (id, character_version_id, role, file_path, checksum, mime_type, width, height)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
				uuid(),
				versionId,
				ref.role,
				ref.filePath,
				ref.checksum,
				ref.mimeType,
				ref.width,
				ref.height,
			);
		}
		console.log(`      ${refs.length} reference images copied`);
	}

	// Set active character version if specified
	if (ch.activeCharacterName) {
		const activeChar = await db
			.prepare(`
      SELECT c.id FROM characters c
      WHERE c.channel_id = ? AND c.name = ?
    `)
			.get(channelId, ch.activeCharacterName) as { id: string } | null;

		if (activeChar) {
			// Set is_active = 1 on the junction row
			await db.prepare(
				"UPDATE channel_characters SET is_active = 1 WHERE channel_id = ? AND character_id = ?",
			).run(channelId, activeChar.id);
			console.log(
				`    Active character: ${ch.activeCharacterName}`,
			);
		}

		// Also set the legacy column for backward compat
		const activeVersion = await db
			.prepare(`
      SELECT cv.id FROM character_versions cv
      JOIN characters c ON cv.character_id = c.id
      WHERE c.channel_id = ? AND c.name = ? AND cv.status = 'frozen'
      ORDER BY cv.version DESC LIMIT 1
    `)
			.get(channelId, ch.activeCharacterName) as { id: string } | null;

		if (activeVersion) {
			await db.prepare(
				"UPDATE channels SET active_character_version_id = ?, updated_at = now() WHERE id = ?",
			).run(activeVersion.id, channelId);
		}
	}

	return { channelId, created: true, characters: ch.characters.length };
}

// === Public API ===

export interface SeedResult {
	channels: Array<{
		name: string;
		slug: string;
		channelId: string;
		created: boolean;
		characters: number;
	}>;
}

/**
 * Seed all default channels and characters.
 * Idempotent — skips channels that already exist unless reset=true.
 *
 * D017: Also seeds video templates from JSON config files and creates
 * channel_templates rows for each channel (defaulting to the
 * gameplay-with-image-scenes template).
 */
export async function seedAll(reset = false): Promise<SeedResult> {
	const config = loadConfig("seed");
	const artifactStore = config.artifactStorePath;
	const charactersDir = join(process.cwd(), "characters");

	console.log(`\n${"=".repeat(60)}`);
	console.log(`  Seeding ${CHANNELS.length} channels${reset ? " (reset mode)" : ""}`);
	console.log(`${"=".repeat(60)}\n`);

	const results: SeedResult["channels"] = [];

	for (const ch of CHANNELS) {
		const result = await seedChannel(ch, reset, artifactStore, charactersDir);
		results.push({
			name: ch.name,
			slug: ch.slug,
			channelId: result.channelId,
			created: result.created,
			characters: result.characters,
		});
		console.log();
	}

	// D017: Seed video templates + channel_templates
	await seedVideoTemplates(reset, results);

	// === Summary ===
	console.log("=== Seed Complete ===\n");
	for (const r of results) {
		const status = r.created ? "CREATED" : "SKIPPED";
		console.log(
			`  ${status}  ${r.name}  (${r.characters} characters)`,
		);
	}
	console.log();

	await closeDb();
	return { channels: results };
}

/**
 * D017: Seed video templates from JSON config files and create channel_templates
 * rows for each channel.
 *
 * - Loads all templates from video-templates/*.json
 * - Upserts them into the video_templates table (is_system = 1)
 * - For each channel, creates a channel_templates row if one doesn't exist,
 *   using the channel's video_template column value (default: gameplay-with-image-scenes)
 */
async function seedVideoTemplates(reset: boolean, channelResults: SeedResult["channels"]): Promise<void> {
	const db = getDb();

	console.log("--- Video Templates ---");

	// Load templates from JSON files
	let templates: Array<{ id: string; name: string; description: string; version: number; config: string }>;
	try {
		const { loadAllTemplates } = await import("../../../video-templates/index.ts");
		const loaded = await loadAllTemplates();
		templates = loaded.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			version: t.version,
			config: JSON.stringify(t.config),
		}));
	} catch (err) {
		console.log(`  [!] Failed to load video templates: ${err instanceof Error ? err.message : String(err)}`);
		console.log("  [!] Skipping template seeding — templates can be added manually via API");
		return;
	}

	if (reset) {
		// Delete existing system templates + channel_templates
		await db.prepare("DELETE FROM channel_templates").run();
		await db.prepare("DELETE FROM video_templates WHERE is_system = 1").run();
		console.log("  Reset: cleared existing system templates + channel_templates");
	}

	// Upsert templates
	for (const tmpl of templates) {
		const existing = await db.prepare("SELECT id FROM video_templates WHERE id = ?").get(tmpl.id);
		if (existing) {
			// Update existing template config
			await db.prepare(`
				UPDATE video_templates
				SET name = ?, description = ?, version = ?, config = ?, updated_at = now()
				WHERE id = ?
			`).run(tmpl.name, tmpl.description, tmpl.version, tmpl.config, tmpl.id);
			console.log(`  UPDATED  ${tmpl.id} — ${tmpl.name}`);
		} else {
			await db.prepare(`
				INSERT INTO video_templates (id, name, description, version, config, is_system)
				VALUES (?, ?, ?, ?, ?, 1)
			`).run(tmpl.id, tmpl.name, tmpl.description, tmpl.version, tmpl.config);
			console.log(`  CREATED  ${tmpl.id} — ${tmpl.name}`);
		}
	}

	// Create channel_templates rows for each channel
	console.log("  --- Channel template assignments ---");
	for (const ch of channelResults) {
		// Check if the channel already has a template assignment
		const existing = await db.prepare("SELECT id FROM channel_templates WHERE channel_id = ?").get(ch.channelId);
		if (existing) {
			console.log(`  SKIPPED  ${ch.slug} — already has a template assignment`);
			continue;
		}

		// Get the channel's video_template column value
		const chRow = await db.prepare("SELECT video_template FROM channels WHERE id = ?").get(ch.channelId) as { video_template: string | null } | null;
		const templateId = chRow?.video_template ?? "gameplay-with-image-scenes";

		// Verify the template exists
		const tmplExists = await db.prepare("SELECT id FROM video_templates WHERE id = ?").get(templateId);
		if (!tmplExists) {
			console.log(`  [!] ${ch.slug}: template "${templateId}" not found — skipping`);
			continue;
		}

		await db.prepare(`
			INSERT INTO channel_templates (id, channel_id, template_id, config, is_active)
			VALUES (?, ?, ?, '{}', 1)
		`).run(crypto.randomUUID(), ch.channelId, templateId);

		console.log(`  ASSIGNED  ${ch.slug} → ${templateId}`);
	}
	console.log();
}
