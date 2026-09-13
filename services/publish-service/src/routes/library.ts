/**
 * Library routes — browse rendered videos.
 *
 * - GET /library/:channelId — list rendered videos for a channel
 * - GET /library/all        — list all rendered videos across channels
 * - GET /library/video/:assetId — stream a video file
 */

import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { AssetRow, WorkflowRunRow, StoryRow } from "@automation/database";
import { existsSync } from "node:fs";

export function registerLibraryRoutes(app: Hono, _config: AppConfig): void {
  const db = getDb();

  // === GET /library/all — list all rendered videos across channels ===

  app.get("/library/all", async (c) => {
    const search = c.req.query("search");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);

    let sql = `
      SELECT a.*, wr.topic as run_topic, wr.status as run_status, s.title as story_title,
             ch.name as channel_name
      FROM assets a
      LEFT JOIN workflow_runs wr ON a.run_id = wr.id
      LEFT JOIN stories s ON wr.id = s.run_id
      LEFT JOIN channels ch ON a.channel_id = ch.id
      WHERE a.type IN ('video', 'rendered_video', 'final_video')
    `;
    const params: (string | number)[] = [];

    if (search) {
      sql += ` AND (wr.topic LIKE ? OR s.title LIKE ? OR ch.name LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.prepare(sql).all(...params) as Array<
      AssetRow & {
        run_topic: string | null;
        run_status: string | null;
        story_title: string | null;
        channel_name: string | null;
      }
    >;

    // Get total count
    let countSql = `
      SELECT COUNT(*) as count FROM assets a
      LEFT JOIN workflow_runs wr ON a.run_id = wr.id
      LEFT JOIN stories s ON wr.id = s.run_id
      LEFT JOIN channels ch ON a.channel_id = ch.id
      WHERE a.type IN ('video', 'rendered_video', 'final_video')
    `;
    if (search) {
      countSql += ` AND (wr.topic LIKE ? OR s.title LIKE ? OR ch.name LIKE ?)`;
    }
    const countParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
    const totalRow = await db.prepare(countSql).get(...countParams) as { count: number };

    return c.json({
      videos: rows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        runId: r.run_id,
        storyTitle: r.story_title,
        runTopic: r.run_topic,
        runStatus: r.run_status,
        channelName: r.channel_name,
        filePath: r.file_path,
        mimeType: r.mime_type,
        width: r.width,
        height: r.height,
        durationMs: r.duration_ms,
        checksum: r.checksum,
        provider: r.provider,
        model: r.model,
        costUsd: r.cost_usd,
        createdAt: r.created_at,
      })),
      total: totalRow.count,
    });
  });

  // === GET /library/:channelId — list rendered videos for a channel ===

  app.get("/library/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const search = c.req.query("search");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);

    let sql = `
      SELECT a.*, wr.topic as run_topic, wr.status as run_status, s.title as story_title
      FROM assets a
      LEFT JOIN workflow_runs wr ON a.run_id = wr.id
      LEFT JOIN stories s ON wr.id = s.run_id
      WHERE a.channel_id = ? AND a.type IN ('video', 'rendered_video', 'final_video')
    `;
    const params: (string | number)[] = [channelId];

    if (search) {
      sql += ` AND (wr.topic LIKE ? OR s.title LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.prepare(sql).all(...params) as Array<
      AssetRow & {
        run_topic: string | null;
        run_status: string | null;
        story_title: string | null;
      }
    >;

    // Get total count
    let countSql = `
      SELECT COUNT(*) as count FROM assets a
      LEFT JOIN workflow_runs wr ON a.run_id = wr.id
      LEFT JOIN stories s ON wr.id = s.run_id
      WHERE a.channel_id = ? AND a.type IN ('video', 'rendered_video', 'final_video')
    `;
    const countParams: (string | number)[] = [channelId];
    if (search) {
      countSql += ` AND (wr.topic LIKE ? OR s.title LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    const totalRow = await db.prepare(countSql).get(...countParams) as { count: number };

    return c.json({
      videos: rows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        runId: r.run_id,
        storyTitle: r.story_title,
        runTopic: r.run_topic,
        runStatus: r.run_status,
        filePath: r.file_path,
        mimeType: r.mime_type,
        width: r.width,
        height: r.height,
        durationMs: r.duration_ms,
        checksum: r.checksum,
        provider: r.provider,
        model: r.model,
        costUsd: r.cost_usd,
        createdAt: r.created_at,
      })),
      total: totalRow.count,
    });
  });

  // === GET /library/video/:assetId — stream a video file ===

  app.get("/library/video/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const asset = await db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as AssetRow | null;

    if (!asset) return c.json({ error: "Video not found" }, 404);
    if (!existsSync(asset.file_path))
      return c.json({ error: "Video file not found on disk" }, 404);

    const file = Bun.file(asset.file_path);
    const range = c.req.header("range");

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match && match[1]) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
        const chunk = await file.slice(start, end + 1).arrayBuffer();
        return new Response(chunk, {
          status: 206,
          headers: {
            "Content-Type": asset.mime_type || "video/mp4",
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${file.size}`,
            "Cache-Control": "public, max-age=3600",
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    const buffer = await file.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": asset.mime_type || "video/mp4",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  });
}
