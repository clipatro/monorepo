/**
 * Remotion composition generator for documentary templates.
 *
 * When a channel uses a Remotion-based template (render.renderer === "remotion"),
 * the package_assembly step calls this module to:
 *
 * 1. Read the scenes from the DB (narration, visual_event, story_purpose, etc.)
 * 2. Use an LLM to assign a documentary component slug + data to each scene
 * 3. Generate a render.tsx Remotion entry file in the export directory
 * 4. Copy images + audio to a public/ folder for Remotion
 *
 * The video-service /render-documentary endpoint then renders the final MP4
 * using the Remotion CLI.
 */

import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "@automation/database";
import { getLlmComponentCatalog } from "@automation/remotion-templates";
import { createLlmClient } from "@automation/llm-provider";
import { loadConfig } from "@automation/config";
import type { LlmProviderName } from "@automation/contracts";
import type { TemplateConfig } from "@automation/contracts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SceneRow {
	id: string;
	order: number;
	story_purpose: string;
	narration_text: string | null;
	visual_event: string | null;
	environment: string | null;
	camera_framing: string | null;
	lighting_and_mood: string | null;
	expected_duration_seconds: number | null;
}

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

interface ComponentAssignment {
	sceneId: string;
	order: number;
	componentSlug: string;
	data: Record<string, unknown>;
	imageTreatment?: string;
}

// ─── LLM-based component selection ───────────────────────────────────────────

/**
 * Use an LLM to assign a documentary component to each scene based on its
 * narrative role, content, and available images.
 *
 * Returns an array of { sceneId, componentSlug, data } assignments.
 */
export async function assignDocumentaryComponents(
	runId: string,
	storyId: string,
	channelId: string,
	manifest: ManifestRow,
	llmProvider?: string,
	llmModel?: string,
): Promise<ComponentAssignment[]> {
	const db = getDb();

	// Fetch scenes from the DB
	const scenes = await db
		.prepare(
			`SELECT id, "order", story_purpose, narration_text, visual_event, environment, camera_framing, lighting_and_mood, expected_duration_seconds
			 FROM scenes WHERE story_id = $1 ORDER BY "order"`,
		)
		.all(storyId) as SceneRow[];

	if (!scenes || scenes.length === 0) {
		throw new Error("No scenes found for story — cannot assign documentary components");
	}

	// Get the documentary component catalog
	const catalog = getLlmComponentCatalog();
	const catalogCompact = catalog.components.map((c) => ({
		slug: c.slug,
		name: c.name,
		purpose: c.purpose,
		narrativeRoles: c.narrativeRoles,
		informationShapes: c.informationShapes,
		tones: c.tones,
		media: c.media,
		inputs: c.inputs,
		textBudget: c.textBudget,
		selectionHint: c.selectionHint,
	}));

	// Build scene summaries for the LLM
	const sceneSummaries = scenes.map((s, i) => ({
		index: i,
		sceneId: s.id,
		order: s.order,
		storyPurpose: s.story_purpose,
		narration: s.narration_text ?? "",
		visualEvent: s.visual_event ?? "",
		environment: s.environment ?? "",
		imageFile: `scene-${String(s.order).padStart(2, "0")}.jpg`,
		durationSec: manifest.scenes.imageTimeline[i]?.imageDurationSec ?? "5",
	}));

	const totalDurationSec = parseFloat(manifest.audio.durationSec);
	const storyTitle = manifest.storyTitle;

	// Construct the LLM prompt
	const prompt = `You are assigning documentary visual components to scenes for a short-form documentary video.

STORY TITLE: "${storyTitle}"
TOTAL DURATION: ${totalDurationSec} seconds
SCENE COUNT: ${scenes.length}

DOCUMENTARY COMPONENT CATALOG (choose one for each scene):
${JSON.stringify(catalogCompact, null, 2)}

SCENES (assign a component to each):
${JSON.stringify(sceneSummaries, null, 2)}

ASSIGNMENT RULES:
- Scene 1 MUST use "title-card" (with title and subtitle from the story)
- Last scene MUST use "end-card"
- Second-to-last scene MUST use "conclusion-card" (with a conclusion and takeaway)
- For middle scenes, choose the component that best fits the scene's story_purpose:
  - "hook" → "hook-headline" or "hero-image-story" (if image is strong)
  - "essential context" → "location-card" or "captioned-image" or "person-profile"
  - "escalation" → "evidence-card" or "key-fact" or "statistic-spotlight"
  - "turn" → "myth-fact" or "comparison-split" or "before-after"
  - "climax" → "evidence-card" or "document-reveal" or "image-quote"
  - "resolution" → "conclusion-card" or "captioned-image"
- Each scene has an image (scene-XX.jpg) — set imageUrl in the data
- Set imageTreatment: "documentary" | "archive" | "monochrome" | "clean"
- Fill in ALL required inputs for each component from the scene's narration and visual data
- The data must match the component's expected input fields

Return ONLY valid JSON (no markdown) in this format:
{
  "assignments": [
    {
      "sceneId": "uuid",
      "order": 1,
      "componentSlug": "title-card",
      "data": { "title": "...", "subtitle": "..." },
      "imageTreatment": "documentary"
    }
  ]
}`;

	// Call the LLM via the provider factory (supports Gemini and DeepSeek)
	const cfg = loadConfig("workflow-service");
	const provider = (llmProvider as LlmProviderName | undefined) ?? cfg.llmProvider;
	const client = createLlmClient(cfg, provider);
	const model = llmModel ?? (provider === "deepseek" ? "deepseek-v4-flash" : "gemini-3.6-flash");

	const result = await client.call({
		model,
		prompt,
		systemInstruction:
			"You are a documentary video editor. You select the right visual component for each scene beat based on its narrative role and content. You fill in all required data fields precisely.",
		responseJson: true,
		temperature: 0.7,
		maxOutputTokens: 8192,
		capability: "documentary.component_assignment",
	});

	const text = result.text ?? "";
	let parsed: { assignments?: ComponentAssignment[] };

	try {
		// Strip markdown code fences if present
		const cleanText = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
		parsed = JSON.parse(cleanText);
	} catch {
		// Try to extract JSON from the text
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			parsed = JSON.parse(jsonMatch[0]);
		} else {
			throw new Error("LLM returned non-JSON response for component assignment");
		}
	}

	const assignments = parsed.assignments;
	if (!assignments || assignments.length === 0) {
		throw new Error("LLM returned no component assignments");
	}

	return assignments;
}

// ─── render.tsx generation ───────────────────────────────────────────────────

/**
 * Generate the Remotion render entry file (render.tsx) for a documentary video.
 *
 * This file imports all documentary components from @automation/remotion-templates
 * and maps each scene to its assigned component via a switch statement.
 */
export function generateRenderEntry(
	config: {
		fps: number;
		width: number;
		height: number;
		totalFrames: number;
		titleCard: { title: string; subtitle: string; startFrame: number; endFrame: number };
		scenes: Array<{
			id: string;
			componentSlug: string;
			startFrame: number;
			endFrame: number;
			durationFrames: number;
			data: Record<string, unknown>;
			imageUrl?: string;
			imageTreatment?: string;
		}>;
		endCard: { startFrame: number; endFrame: number };
	},
): string {
	const scenes = config.scenes;

	const sceneRenders = scenes
		.map((s) => {
			const dataStr = JSON.stringify(s.data);
			const imageProp = s.imageUrl ? `imageUrl={staticFile("${s.imageUrl}")}` : "";
			const treatmentProp = s.imageTreatment ? `imageTreatment="${s.imageTreatment}"` : "";
			return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <DocumentarySceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={archiveTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
		})
		.join("\n");

	return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import {
  archiveTheme,
  TitleCard,
  EndCard,
  HookHeadline,
  ChapterCard,
  QuestionCard,
  QuoteCard,
  ConclusionCard,
  KeyFact,
  StatisticSpotlight,
  MythFact,
  ComparisonSplit,
  BeforeAfter,
  EvidenceCard,
  SourceCitation,
  DocumentReveal,
  Timeline,
  EventCountdown,
  PersonProfile,
  LocationCard,
  MapRoute,
  ProcessSteps,
  CauseEffect,
  HeroImageStory,
  ArchivalPhoto,
  PhotoStack,
  ImageComparison,
  ImageQuote,
  EvidenceZoom,
  ImageMosaic,
  CaptionedImage,
  BarChart,
  LineChart,
  PieChart,
  CircularProgress,
  AnimatedList,
} from "@automation/remotion-templates";

const DocumentarySceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment } : data;
  switch (slug) {
    case "hook-headline": return <HookHeadline data={fullData} theme={theme} />;
    case "chapter-card": return <ChapterCard data={fullData} theme={theme} />;
    case "question-card": return <QuestionCard data={fullData} theme={theme} />;
    case "quote-card": return <QuoteCard data={fullData} theme={theme} />;
    case "conclusion-card": return <ConclusionCard data={fullData} theme={theme} />;
    case "key-fact": return <KeyFact data={fullData} theme={theme} />;
    case "statistic-spotlight": return <StatisticSpotlight data={fullData} theme={theme} />;
    case "myth-fact": return <MythFact data={fullData} theme={theme} />;
    case "comparison-split": return <ComparisonSplit data={fullData} theme={theme} />;
    case "before-after": return <BeforeAfter data={fullData} theme={theme} />;
    case "evidence-card": return <EvidenceCard data={fullData} theme={theme} />;
    case "source-citation": return <SourceCitation data={fullData} theme={theme} />;
    case "document-reveal": return <DocumentReveal data={fullData} theme={theme} />;
    case "timeline": return <Timeline data={fullData} theme={theme} />;
    case "event-countdown": return <EventCountdown data={fullData} theme={theme} />;
    case "person-profile": return <PersonProfile data={fullData} theme={theme} />;
    case "location-card": return <LocationCard data={fullData} theme={theme} />;
    case "map-route": return <MapRoute data={fullData} theme={theme} />;
    case "process-steps": return <ProcessSteps data={fullData} theme={theme} />;
    case "cause-effect": return <CauseEffect data={fullData} theme={theme} />;
    case "hero-image-story": return <HeroImageStory data={fullData} theme={theme} />;
    case "archival-photo": return <ArchivalPhoto data={fullData} theme={theme} />;
    case "photo-stack": return <PhotoStack data={fullData} theme={theme} />;
    case "image-comparison": return <ImageComparison data={fullData} theme={theme} />;
    case "image-quote": return <ImageQuote data={fullData} theme={theme} />;
    case "evidence-zoom": return <EvidenceZoom data={fullData} theme={theme} />;
    case "image-mosaic": return <ImageMosaic data={fullData} theme={theme} />;
    case "captioned-image": return <CaptionedImage data={fullData} theme={theme} />;
    case "bar-chart": return <BarChart data={fullData} theme={theme} />;
    case "line-chart": return <LineChart data={fullData} theme={theme} />;
    case "pie-chart": return <PieChart data={fullData} theme={theme} />;
    case "circular-progress": return <CircularProgress data={fullData} theme={theme} />;
    case "animated-list": return <AnimatedList data={fullData} theme={theme} />;
    default: return <AbsoluteFill style={{ background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#e85d3f" }}><p>Unknown: {slug}</p></AbsoluteFill>;
  }
};

const DocumentaryVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      <Sequence from={${config.titleCard.startFrame}} durationInFrames={${config.titleCard.endFrame - config.titleCard.startFrame}}>
        <TitleCard title={${JSON.stringify(config.titleCard.title)}} subtitle={${JSON.stringify(config.titleCard.subtitle)}} theme={archiveTheme} />
      </Sequence>
${sceneRenders}
      <Sequence from={${config.endCard.startFrame}} durationInFrames={${config.endCard.endFrame - config.endCard.startFrame}}>
        <EndCard theme={archiveTheme} />
      </Sequence>
      <Audio src={staticFile("mixed-audio.wav")} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="DocumentaryVideo" component={DocumentaryVideo} durationInFrames={${config.totalFrames}} fps={${config.fps}} width={${config.width}} height={${config.height}} />
);

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
`;
}

// ─── Full composition setup ──────────────────────────────────────────────────

/**
 * Set up the Remotion composition in the export directory for a documentary run.
 *
 * This is called by the package_assembly handler when the channel uses a
 * Remotion-based template. It:
 * 1. Assigns documentary components to each scene via LLM
 * 2. Computes scene timings from the manifest
 * 3. Generates render.tsx
 * 4. Copies images + audio to a public/ folder
 *
 * Returns the path to the generated render.tsx and the composition config.
 */
export async function setupRemotionComposition(
	runId: string,
	storyId: string,
	channelId: string,
	exportDir: string,
	manifest: ManifestRow,
	tmpl: TemplateConfig,
	llmProvider?: string,
	llmModel?: string,
): Promise<{
	renderEntryPath: string;
	compositionId: string;
	totalFrames: number;
}> {
	const fps = tmpl.render.fps ?? 30;
	const width = tmpl.layout.width;
	const height = tmpl.layout.height;

	// 1. Assign components to scenes
	const assignments = await assignDocumentaryComponents(
		runId,
		storyId,
		channelId,
		manifest,
		llmProvider,
		llmModel,
	);

	// 2. Compute scene timings from the manifest
	const titleCardFrames = Math.round(3 * fps); // 3s title card
	const endCardFrames = Math.round(3 * fps); // 3s end card

	const totalDurationSec = parseFloat(manifest.audio.durationSec);
	const contentDurationSec = Math.max(10, totalDurationSec - (titleCardFrames + endCardFrames) / fps);

	// Map assignments to scene timings
	const contentAssignments = assignments.filter(
		(a) => a.componentSlug !== "title-card" && a.componentSlug !== "end-card",
	);

	const totalSegments = contentAssignments.length || 1;
	let currentFrame = 0;

	const scenes = contentAssignments.map((a) => {
		const durationSec = contentDurationSec / totalSegments;
		const durationFrames = Math.round(durationSec * fps);
		const startFrame = currentFrame;
		currentFrame += durationFrames;

		const imageOrder = a.order;
		const imageFile = `scene-${String(imageOrder).padStart(2, "0")}.jpg`;

		return {
			id: a.sceneId,
			componentSlug: a.componentSlug,
			startFrame: titleCardFrames + startFrame,
			endFrame: titleCardFrames + currentFrame,
			durationFrames,
			data: a.data,
			imageUrl: `images/${imageFile}`,
			imageTreatment: a.imageTreatment,
		};
	});

	const totalFrames = titleCardFrames + currentFrame + endCardFrames;

	// Get title/subtitle from the first assignment (title-card) or from manifest
	const titleAssignment = assignments.find((a) => a.componentSlug === "title-card");
	const title = (titleAssignment?.data?.title as string) ?? manifest.storyTitle;
	const subtitle = (titleAssignment?.data?.subtitle as string) ?? "";

	const config = {
		fps,
		width,
		height,
		totalFrames,
		titleCard: { title, subtitle, startFrame: 0, endFrame: titleCardFrames },
		scenes,
		endCard: { startFrame: titleCardFrames + currentFrame, endFrame: totalFrames },
	};

	// 3. Generate render.tsx
	const renderEntryPath = join(exportDir, "render.tsx");
	const componentCode = generateRenderEntry(config);
	await writeFile(renderEntryPath, componentCode);

	// 4. Copy images + audio to public/ folder
	const publicDir = join(exportDir, "public");
	await mkdir(publicDir, { recursive: true });
	await mkdir(join(publicDir, "images"), { recursive: true });

	// Copy voiceover as mixed-audio.wav (Remotion expects this filename)
	const voiceoverPath = join(exportDir, "voiceover.wav");
	const mixedAudioPath = join(publicDir, "mixed-audio.wav");
	try {
		await copyFile(voiceoverPath, mixedAudioPath);
	} catch {
		// If voiceover doesn't exist, the video will have no audio
	}

	// Copy scene images
	for (const scene of scenes) {
		const srcImage = join(exportDir, `scene-${String(scene.id ? getSceneOrder(assignments, scene.id) : 1).padStart(2, "0")}.jpg`);
		const destImage = join(publicDir, "images", `scene-${String(getSceneOrder(assignments, scene.id)).padStart(2, "0")}.jpg`);
		try {
			await copyFile(srcImage, destImage);
		} catch {
			// If copy fails, the component will show without an image
		}
	}

	// Also copy all scene-*.jpg files from export to public/images/
	// (in case the naming doesn't match exactly)
	const allImages = await readDirSafe(exportDir);
	for (const file of allImages) {
		if (file.match(/^scene-\d+\.jpg$/)) {
			const src = join(exportDir, file);
			const dest = join(publicDir, "images", file);
			try {
				await copyFile(src, dest);
			} catch {
				// non-critical
			}
		}
	}

	// Write composition config
	const configPath = join(exportDir, "composition-config.json");
	await writeFile(configPath, JSON.stringify(config, null, 2));

	return {
		renderEntryPath,
		compositionId: "DocumentaryVideo",
		totalFrames,
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSceneOrder(assignments: ComponentAssignment[], sceneId: string): number {
	const a = assignments.find((x) => x.sceneId === sceneId);
	return a?.order ?? 1;
}

async function readDirSafe(dir: string): Promise<string[]> {
	try {
		const { readdir } = await import("node:fs/promises");
		return await readdir(dir);
	} catch {
		return [];
	}
}
