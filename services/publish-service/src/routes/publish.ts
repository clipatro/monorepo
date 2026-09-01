/**
 * Publish routes — video publishing to social platforms.
 *
 * - POST /publish     — upload video and publish to selected platforms
 * - GET  /jobs/:channelId — list publish jobs for a channel
 * - GET  /job/:jobId  — get a single publish job with results
 */

import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type {
  PublishJobRow,
  AssetRow,
  ChannelRow,
} from "@automation/database";
import { zValidator } from "@hono/zod-validator";
import { existsSync } from "node:fs";
import { extname } from "node:path";

import { publishSchema } from "../schemas";
import { uuid } from "../utils";
import { ZernioAdapter } from "../adapters/zernio";

export function registerPublishRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  // === POST /publish — upload video and publish ===

  app.post("/publish", zValidator("json", publishSchema), async (c) => {
    const body = c.req.valid("json");

    if (!config.zernioApiKey) {
      return c.json(
        { error: "ZERNIO_API_KEY is not configured. Set it in .env" },
        500,
      );
    }

    // Resolve the video file path
    let videoFilePath: string | null = null;
    let videoMimeType = "video/mp4";

    if (body.videoAssetId) {
      const asset = await db
        .prepare("SELECT * FROM assets WHERE id = ?")
        .get(body.videoAssetId) as AssetRow | null;
      if (!asset) return c.json({ error: "Video asset not found" }, 404);
      videoFilePath = asset.file_path;
      videoMimeType = asset.mime_type || "video/mp4";
    } else if (body.runId) {
      // Try to find the rendered video asset for this run
      const asset = await db
        .prepare(
          "SELECT * FROM assets WHERE run_id = ? AND type IN ('video', 'rendered_video', 'final_video') ORDER BY created_at DESC LIMIT 1",
        )
        .get(body.runId) as AssetRow | null;
      if (asset) {
        videoFilePath = asset.file_path;
        videoMimeType = asset.mime_type || "video/mp4";
      }
    }

    if (!videoFilePath || !existsSync(videoFilePath)) {
      return c.json(
        { error: "Video file not found. Provide a videoAssetId or runId with a rendered video." },
        404,
      );
    }

    // Verify the channel exists
    const channel = await db
      .prepare("SELECT * FROM channels WHERE id = ?")
      .get(body.channelId) as ChannelRow | null;
    if (!channel) return c.json({ error: "Channel not found" }, 404);

    // Create a publish job record
    const jobId = uuid();
    await db.prepare(`
      INSERT INTO publish_jobs (id, channel_id, video_asset_id, run_id, status, platforms_json, metadata_json)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      jobId,
      body.channelId,
      body.videoAssetId ?? null,
      body.runId ?? null,
      JSON.stringify(body.platforms),
      JSON.stringify(body.metadata),
    );

    try {
      // Update status to uploading
      await db
        .prepare("UPDATE publish_jobs SET status = 'uploading' WHERE id = ?")
        .run(jobId);

      const adapter = new ZernioAdapter(config.zernioApiKey);
      const result = await adapter.publish({
        channelId: body.channelId,
        videoFilePath,
        videoMimeType,
        videoAssetId: body.videoAssetId ?? null,
        runId: body.runId ?? null,
        platforms: body.platforms,
        metadata: body.metadata,
      });

      // Update the job record with results
      await db.prepare(`
        UPDATE publish_jobs
        SET status = ?, provider_post_id = ?, result_json = ?, error = ?, completed_at = now()
        WHERE id = ?
      `).run(
        result.status,
        result.providerPostId,
        JSON.stringify(result.results),
        result.error,
        jobId,
      );

      return c.json({ ...result, jobId }, result.status === "failed" ? 500 : 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[publish-service] Publish error:", msg);

      await db.prepare(`
        UPDATE publish_jobs SET status = 'failed', error = ?, completed_at = now() WHERE id = ?
      `).run(msg, jobId);

      return c.json({ jobId, status: "failed", error: msg }, 500);
    }
  });

  // === GET /jobs/:channelId — list publish jobs for a channel ===

  app.get("/jobs/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    let sql = "SELECT * FROM publish_jobs WHERE channel_id = ? ORDER BY created_at DESC";
    const params: (string | number)[] = [channelId];

    if (limit) {
      const lim = Math.min(Number(limit), 200);
      const off = Number(offset ?? 0);
      sql += " LIMIT ? OFFSET ?";
      params.push(lim, off);
    }

    const rows = await db.prepare(sql).all(...params) as PublishJobRow[];
    return c.json({
      jobs: rows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        videoAssetId: r.video_asset_id,
        runId: r.run_id,
        status: r.status,
        platforms: JSON.parse(r.platforms_json),
        metadata: JSON.parse(r.metadata_json),
        providerPostId: r.provider_post_id,
        results: r.result_json ? JSON.parse(r.result_json) : [],
        error: r.error,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    });
  });

  // === GET /job/:jobId — get a single publish job ===

  app.get("/job/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const row = await db
      .prepare("SELECT * FROM publish_jobs WHERE id = ?")
      .get(jobId) as PublishJobRow | null;

    if (!row) return c.json({ error: "Publish job not found" }, 404);

    // If the job is still in publishing state and we have a provider post ID,
    // poll Zernio for the latest status
    if (
      row.status === "publishing" &&
      row.provider_post_id &&
      config.zernioApiKey
    ) {
      try {
        const adapter = new ZernioAdapter(config.zernioApiKey);
        const status = await adapter.getPostStatus({
          channelId: row.channel_id,
          jobId: row.provider_post_id,
        });

        if (status.status !== row.status) {
          await db.prepare(`
            UPDATE publish_jobs
            SET status = ?, result_json = ?, error = ?, completed_at = ${status.status === "published" || status.status === "failed" ? "now()" : "completed_at"}
            WHERE id = ?
          `).run(
            status.status,
            JSON.stringify(status.results),
            status.error,
            jobId,
          );

          return c.json({
            id: row.id,
            channelId: row.channel_id,
            videoAssetId: row.video_asset_id,
            runId: row.run_id,
            status: status.status,
            platforms: JSON.parse(row.platforms_json),
            metadata: JSON.parse(row.metadata_json),
            providerPostId: status.providerPostId ?? row.provider_post_id,
            results: status.results,
            error: status.error,
            createdAt: row.created_at,
            completedAt: row.completed_at,
          });
        }
      } catch (err) {
        console.warn(
          "[publish-service] Status poll failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return c.json({
      id: row.id,
      channelId: row.channel_id,
      videoAssetId: row.video_asset_id,
      runId: row.run_id,
      status: row.status,
      platforms: JSON.parse(row.platforms_json),
      metadata: JSON.parse(row.metadata_json),
      providerPostId: row.provider_post_id,
      results: row.result_json ? JSON.parse(row.result_json) : [],
      error: row.error,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    });
  });
}
