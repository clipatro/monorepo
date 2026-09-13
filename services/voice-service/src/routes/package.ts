import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
	StoryRow,
	VoiceoverRow,
	TimingRow,
	AssetRow,
	ChannelRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { join, extname, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { packageSchema } from "../schemas";
import { ensureDir } from "../utils";
import { generateSrt } from "../captions";
import { buildManifest, buildTimelineCsv, createZip } from "../package-builder";
import { getStorage, storageKey, pathToKey, readFileAny, backupToR2, backupBufferToR2 } from "../storage";

// === POST /package — assemble the full export package ===

export function registerPackageRoutes(app: Hono, config: AppConfig): void {
	const db = getDb();

	app.post("/package", zValidator("json", packageSchema), async (c) => {
		const { runId, storyId, includeGameplay } = c.req.valid("json");

		const story = await db
			.prepare("SELECT * FROM stories WHERE id = ?")
			.get(storyId) as StoryRow | null;
		if (!story) return c.json({ error: "Story not found" }, 404);

		const channel = await db
			.prepare("SELECT * FROM channels WHERE id = ?")
			.get(story.channel_id) as ChannelRow | null;
		if (!channel) return c.json({ error: "Channel not found" }, 404);

		// Get the voiceover
		const voiceover = await db
			.prepare(
				"SELECT * FROM voiceovers WHERE run_id = ? AND story_id = ? ORDER BY created_at DESC LIMIT 1",
			)
			.get(runId, storyId) as VoiceoverRow | null;
		if (!voiceover)
			return c.json({ error: "No voiceover found for this run" }, 404);

		// Get timings (join scenes for subtitle_position + emotion for kids templates)
		const timings = await db
			.prepare(`
      SELECT t.*, s."order" as scene_order, s.subtitle_position, s.emotion
      FROM timings t JOIN scenes s ON t.scene_id = s.id
      WHERE t.voiceover_id = ? ORDER BY s."order" ASC
    `)
			.all(voiceover.id) as Array<TimingRow & { scene_order: number; subtitle_position: string | null; emotion: string | null }>;

		if (timings.length === 0)
			return c.json({ error: "No timing records found" }, 404);

		// Get accepted images for each scene (fall back to 'image' if none accepted)
		const imageAssets: Array<{ sceneId: string; filePath: string }> = [];
		for (const t of timings) {
			let asset = await db
				.prepare(`
        SELECT * FROM assets WHERE scene_id = ? AND type = 'image_accepted'
        ORDER BY created_at DESC LIMIT 1
      `)
				.get(t.scene_id) as AssetRow | null;
			// Fallback: if no accepted image, use the latest pending image
			if (!asset) {
				asset = await db
					.prepare(`
          SELECT * FROM assets WHERE scene_id = ? AND type = 'image'
          ORDER BY created_at DESC LIMIT 1
        `)
					.get(t.scene_id) as AssetRow | null;
			}
			if (asset) {
				imageAssets.push({ sceneId: t.scene_id, filePath: asset.file_path });
			}
		}

		// Check for gameplay video
		let gameplayAsset: AssetRow | null = null;
		if (includeGameplay) {
			gameplayAsset = await db
				.prepare(`
        SELECT * FROM assets WHERE run_id = ? AND type = 'gameplay_video'
        ORDER BY created_at DESC LIMIT 1
      `)
				.get(runId) as AssetRow | null;
		}

		// Build the export package directory
		const pkgDir = join(
			config.artifactStorePath,
			"channels",
			channel.id,
			"runs",
			runId,
			"export",
		);
		await ensureDir(pkgDir);

		// Track missing artifacts for graceful degradation
		const missingArtifacts: string[] = [];
		const warnings: string[] = [];

		// Copy voiceover (graceful handling if file is missing)
		const voiceoverPkgPath = join(pkgDir, "voiceover.wav");
		const voiceoverData = await readFileAny(voiceover.master_path, config);
		if (voiceoverData) {
			await writeFile(voiceoverPkgPath, voiceoverData);
			// Fire-and-forget R2 backup (non-blocking)
			backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", "voiceover.wav"), voiceoverData, "audio/wav");
		} else {
			missingArtifacts.push("voiceover.wav");
			warnings.push(`Voiceover file missing: ${voiceover.master_path}`);
		}

		// Copy scene images with zero-padded names (graceful handling per image)
		const imageFiles: Array<{ name: string; path: string }> = [];
		for (const img of imageAssets) {
			const timing = timings.find((t) => t.scene_id === img.sceneId);
			const order = timing?.scene_order ?? 0;
			const paddedName = `scene-${String(order).padStart(2, "0")}${extname(img.filePath)}`;
			const destPath = join(pkgDir, paddedName);
			const data = await readFileAny(img.filePath, config);
			if (data) {
				await writeFile(destPath, data);
				imageFiles.push({ name: paddedName, path: destPath });
				// Fire-and-forget R2 backup (non-blocking)
				backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", paddedName), data);
			} else {
				missingArtifacts.push(paddedName);
				warnings.push(`Image missing: ${img.filePath}`);
			}
		}

		// Copy gameplay video (graceful handling)
		let gameplayInfo: {
			sourceFile: string;
			startSec: number;
			durationSec: number;
		} | null = null;
		if (gameplayAsset) {
			const gameplayData = await readFileAny(gameplayAsset.file_path, config);
			if (gameplayData) {
				const gameplayPkgPath = join(pkgDir, "gameplay-background.mp4");
				await writeFile(gameplayPkgPath, gameplayData);
				gameplayInfo = {
					sourceFile: basename(gameplayAsset.file_path),
					startSec: 0,
					durationSec: voiceover.duration_ms / 1000,
				};
				// Fire-and-forget R2 backup (non-blocking)
				backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", "gameplay-background.mp4"), gameplayData, "video/mp4");
			} else {
				missingArtifacts.push("gameplay-background.mp4");
				warnings.push(`Gameplay video missing: ${gameplayAsset.file_path}`);
			}
		}

		// Generate SRT captions
		const srtContent = generateSrt(
			timings.map((t) => ({
				sceneId: t.scene_id,
				order: t.scene_order,
				startMs: t.narration_start_ms,
				endMs: t.narration_end_ms,
				narrationText: t.narration_text,
			})),
		);
		const srtPath = join(pkgDir, "captions.srt");
		await writeFile(srtPath, srtContent, "utf-8");
		// Fire-and-forget R2 backup (non-blocking)
		backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", "captions.srt"), srtContent, "text/plain");

		// Generate timeline CSV (with image display windows)
		const csvContent = buildTimelineCsv(
			timings.map((t) => ({
				order: t.scene_order,
				sceneId: t.scene_id,
				narrationStartMs: t.narration_start_ms,
				narrationEndMs: t.narration_end_ms,
				imageStartMs: t.recommended_image_start_ms,
				imageEndMs: t.recommended_image_end_ms,
				narrationText: t.narration_text,
				subtitlePosition: t.subtitle_position,
				emotion: t.emotion,
			})),
			imageAssets,
		);
		const csvPath = join(pkgDir, "scene-timeline.csv");
		await writeFile(csvPath, csvContent, "utf-8");
		// Fire-and-forget R2 backup (non-blocking)
		backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", "scene-timeline.csv"), csvContent, "text/csv");

		// Generate manifest (with image timeline)
		const manifest = buildManifest({
			runId,
			channelId: channel.id,
			channelName: channel.name,
			storyId,
			storyTitle: story.title,
			voiceoverId: voiceover.id,
			audioDurationMs: voiceover.duration_ms,
			sceneCount: timings.length,
			sceneImages: imageFiles.map((f) => ({
				order: parseInt(f.name.match(/scene-(\d+)/)?.[1] ?? "0", 10),
				file: f.name,
			})),
			sceneTimings: timings.map((t) => ({
				order: t.scene_order,
				sceneId: t.scene_id,
				narrationStartMs: t.narration_start_ms,
				narrationEndMs: t.narration_end_ms,
				imageStartMs: t.recommended_image_start_ms,
				imageEndMs: t.recommended_image_end_ms,
			})),
			gameplayVideo: gameplayInfo ?? undefined,
			provider: voiceover.provider,
			model: voiceover.model,
			voiceId: voiceover.voice_id,
		});
		const manifestPath = join(pkgDir, "manifest.json");
		const manifestJson = JSON.stringify(manifest, null, 2);
		await writeFile(manifestPath, manifestJson, "utf-8");
		// Fire-and-forget R2 backup (non-blocking)
		backupBufferToR2(storageKey("channels", channel.id, "runs", runId, "export", "manifest.json"), manifestJson, "application/json");

		// Create ZIP archive — only include files that exist
		const zipPath = join(
			config.artifactStorePath,
			"channels",
			channel.id,
			"runs",
			runId,
			"export-package.zip",
		);
		const filesToZip: Array<{ name: string; path: string }> = [
			{ name: "manifest.json", path: manifestPath },
			{ name: "scene-timeline.csv", path: csvPath },
			{ name: "captions.srt", path: srtPath },
		];
		if (existsSync(voiceoverPkgPath)) {
			filesToZip.push({ name: "voiceover.wav", path: voiceoverPkgPath });
		}
		filesToZip.push(...imageFiles);
		if (gameplayAsset && existsSync(join(pkgDir, "gameplay-background.mp4"))) {
			filesToZip.push({
				name: "gameplay-background.mp4",
				path: join(pkgDir, "gameplay-background.mp4"),
			});
		}

		await createZip(filesToZip, zipPath);

		// Fire-and-forget R2 backup (non-blocking)
		backupToR2(zipPath, storageKey("channels", channel.id, "runs", runId, "export-package.zip"), "application/zip");

		return c.json(
			{
				runId,
				storyId,
				warnings: warnings.length > 0 ? warnings : undefined,
				missingArtifacts:
					missingArtifacts.length > 0 ? missingArtifacts : undefined,
				packagePath: zipPath,
				packageDir: pkgDir,
				files: filesToZip.map((f) => f.name),
				manifest,
			},
			201,
		);
	});

	// === GET /download/:runId — download the export package ZIP ===

	app.get("/download/:runId", async (c) => {
		const runId = c.req.param("runId");

		// Find the channel for this run
		const run = await db
			.prepare("SELECT * FROM workflow_runs WHERE id = ?")
			.get(runId) as { channel_id: string } | null;
		if (!run) return c.json({ error: "Run not found" }, 404);

		const zipPath = join(
			config.artifactStorePath,
			"channels",
			run.channel_id,
			"runs",
			runId,
			"export-package.zip",
		);
		// Try local filesystem first, then R2
		if (existsSync(zipPath)) {
			const data = await readFile(zipPath);
			return new Response(data as BodyInit, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename="export-package-${runId.slice(0, 8)}.zip"`,
				},
			});
		}

		// Try R2 if enabled
		const storage = getStorage();
		if (storage.backend === "r2") {
			const key = storageKey("channels", run.channel_id, "runs", runId, "export-package.zip");
			if (await storage.exists(key)) {
				const data = await storage.get(key);
				return new Response(data as BodyInit, {
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": `attachment; filename="export-package-${runId.slice(0, 8)}.zip"`,
					},
				});
			}
		}

		return c.json(
			{ error: "Export package not found — assemble it first" },
			404,
		);
	});
}
