import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
	VoiceoverRow,
	StoryRow,
	ChannelRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { join, extname } from "node:path";
import { readdir } from "node:fs/promises";

import { gameplayCutSchema } from "../schemas";
import { uuid, ensureDir, fileChecksum } from "../utils";
import { cutGameplayVideo } from "../gameplay";

// === POST /gameplay-cut — cut a muted gameplay video matching audio duration ===

export function registerGameplayRoutes(app: Hono, config: AppConfig): void {
	const db = getDb();

	app.post(
		"/gameplay-cut",
		zValidator("json", gameplayCutSchema),
		async (c) => {
			const { voiceoverId, runId } = c.req.valid("json");

			const voiceover = await db
				.prepare("SELECT * FROM voiceovers WHERE id = ?")
				.get(voiceoverId) as VoiceoverRow | null;
			if (!voiceover) return c.json({ error: "Voiceover not found" }, 404);

			const story = await db
				.prepare("SELECT * FROM stories WHERE id = ?")
				.get(voiceover.story_id) as StoryRow | null;
			if (!story) return c.json({ error: "Story not found" }, 404);

			const channel = await db
				.prepare("SELECT * FROM channels WHERE id = ?")
				.get(story.channel_id) as ChannelRow | null;
			if (!channel) return c.json({ error: "Channel not found" }, 404);

			const durationSec = voiceover.duration_ms / 1000;
			const effectiveRunId = runId ?? voiceover.run_id;

			// Output path for the gameplay clip
			const outputDir = join(
				config.artifactStorePath,
				"channels",
				channel.id,
				"runs",
				effectiveRunId,
				"gameplay",
			);
			await ensureDir(outputDir);
			const outputPath = join(outputDir, "gameplay-background.mp4");

			try {
				const { resolve } = await import("node:path");
				const absGameplayDir = resolve(config.gameplayVideoPath);
				const result = await cutGameplayVideo(
					absGameplayDir,
					durationSec,
					outputPath,
				);

				// Record as an asset
				const assetId = uuid();
				const checksum = await fileChecksum(outputPath);
				await db.prepare(`
        INSERT INTO assets (id, channel_id, run_id, scene_id, type, file_path, mime_type, checksum, provider, model, cost_usd)
        VALUES (?, ?, ?, NULL, 'gameplay_video', ?, 'video/mp4', ?, 'local', 'gameplay-cut', 0)
      `).run(assetId, channel.id, effectiveRunId, outputPath, checksum);

				return c.json(
					{
						assetId,
						voiceoverId,
						gameplayVideo: {
							sourceFile: result.sourceFile,
							startSec: result.startSec.toFixed(2),
							durationSec: result.durationSec.toFixed(2),
							muted: true,
							filePath: outputPath,
						},
					},
					201,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error("[voice-service] Gameplay cut error:", msg);
				return c.json(
					{ error: "Gameplay video cut failed", details: msg },
					500,
				);
			}
		},
	);

	// === GET /gameplay-videos — list available gameplay videos ===

	app.get("/gameplay-videos", async (c) => {
		try {
			const files = await readdir(config.gameplayVideoPath);
			const videoFiles = files.filter((f) => {
				const ext = extname(f).toLowerCase();
				return [".mp4", ".mkv", ".webm", ".mov", ".avi"].includes(ext);
			});
			return c.json({ videos: videoFiles, path: config.gameplayVideoPath });
		} catch {
			return c.json({
				videos: [],
				path: config.gameplayVideoPath,
				error: "Directory not found",
			});
		}
	});
}
