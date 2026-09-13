/**
 * Video staging routes — lets the host-side video-service access the Docker
 * volume's export packages and store rendered videos without direct filesystem
 * or database access.
 *
 * Storage architecture: local disk is primary. R2 is a fire-and-forget backup.
 * - Writes go to local disk first, then R2 upload fires in the background.
 * - Reads use local disk. R2 is only a fallback if local files are missing.
 *
 * Endpoints:
 * - GET  /api/runs/:runId/export-bundle  — returns a ZIP of the export directory
 * - POST /api/runs/:runId/video-upload    — accepts the rendered MP4, stores it
 * - POST /api/runs/:runId/clip-upload     — accepts a single clip MP4, stores it
 * - GET  /api/runs/:runId/video-file      — streams the stored MP4 (supports range)
 * - GET  /api/runs/:runId/video-download  — downloads the stored MP4
 */

import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { WorkflowRunRow, AssetRow } from "@automation/database";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getStorage, pathToKey, storageKey, backupToR2, backupBufferToR2 } from "../storage.ts";

const execAsync = promisify(exec);

export function registerVideoStagingRoutes(app: Hono, config: AppConfig): void {
  const storage = getStorage();

  // GET /api/runs/:runId/export-bundle — return a ZIP of the export directory
  // Uses LOCAL filesystem only — this is a pipeline-critical read.
  app.get("/api/runs/:runId/export-bundle", async (c) => {
    const runId = c.req.param("runId");
    const db = getDb();
    const run = await db
      .prepare("SELECT * FROM workflow_runs WHERE id = ?")
      .get(runId) as WorkflowRunRow | null;
    if (!run) return c.json({ error: "Run not found" }, 404);

    const exportDir = join(
      config.artifactStorePath,
      "channels",
      run.channel_id,
      "runs",
      runId,
      "export",
    );
    if (!existsSync(exportDir)) {
      return c.json({ error: `Export directory not found: ${exportDir}` }, 404);
    }

    const tmpZip = `/tmp/export-${runId}.zip`;
    try {
      await execAsync(`cd "${exportDir}" && zip -r -0 "${tmpZip}" .`, {
        maxBuffer: 100 * 1024 * 1024,
      });
    } catch (err) {
      return c.json({ error: "Failed to create export bundle", details: String(err) }, 500);
    }

    const data = await readFile(tmpZip);
    try { await execAsync(`rm -f "${tmpZip}"`); } catch { /* non-critical */ }

    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="export-${runId.slice(0, 8)}.zip"`,
      },
    });
  });

  // POST /api/runs/:runId/video-upload — accept the rendered MP4 and store it
  // Writes to local disk first, then fires background R2 backup.
  app.post("/api/runs/:runId/video-upload", async (c) => {
    const runId = c.req.param("runId");
    const db = getDb();
    const run = await db
      .prepare("SELECT * FROM workflow_runs WHERE id = ?")
      .get(runId) as WorkflowRunRow | null;
    if (!run) return c.json({ error: "Run not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("video") as File | null;
    const durationSec = parseFloat(formData.get("durationSec") as string || "0");
    const fps = formData.get("fps") as string || "";
    const sizeBytes = parseInt(formData.get("sizeBytes") as string || "0", 10);
    const audioLufs = parseFloat(formData.get("audioLufs") as string || "0");
    const audioTruePeak = parseFloat(formData.get("audioTruePeak") as string || "0");
    const sceneCount = parseInt(formData.get("sceneCount") as string || "0", 10);
    const storyTitle = formData.get("storyTitle") as string || "";

    if (!file) return c.json({ error: "No video file in form data" }, 400);

    // Store the MP4 on local disk (primary)
    const videoDir = join(
      config.artifactStorePath,
      "channels",
      run.channel_id,
      "runs",
      runId,
      "video",
    );
    await mkdir(videoDir, { recursive: true });
    const renderOutput = join(videoDir, "render.mp4");
    await Bun.write(renderOutput, file);

    // Fire-and-forget R2 backup (non-blocking)
    const videoKey = storageKey("channels", run.channel_id, "runs", runId, "video", "render.mp4");
    backupToR2(renderOutput, videoKey, "video/mp4");

    // Record the video as an asset in the database
    const assetId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO assets (id, channel_id, run_id, scene_id, type, file_path, mime_type, duration_ms, checksum, created_at)
      VALUES (?, ?, ?, NULL, 'video', ?, 'video/mp4', ?, '', now())
    `).run(
      assetId,
      run.channel_id,
      runId,
      renderOutput,
      Math.round(durationSec * 1000),
    );

    return c.json({
      runId,
      assetId,
      filePath: renderOutput,
      durationSec,
      fps,
      sizeBytes,
      sizeMB: Math.round(sizeBytes / 1024 / 1024),
      audioLufs,
      audioTruePeak,
      sceneCount,
      storyTitle,
    }, 201);
  });

  // POST /api/runs/:runId/clip-upload — accept a single clip MP4 and store it
  // Writes to local disk first, then fires background R2 backup.
  app.post("/api/runs/:runId/clip-upload", async (c) => {
    const runId = c.req.param("runId");
    const db = getDb();
    const run = await db
      .prepare("SELECT * FROM workflow_runs WHERE id = ?")
      .get(runId) as WorkflowRunRow | null;
    if (!run) return c.json({ error: "Run not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("clip") as File | null;
    const filename = (formData.get("filename") as string) || "clip.mp4";
    const durationSec = parseFloat(formData.get("durationSec") as string || "0");
    const width = parseInt(formData.get("width") as string || "0", 10);
    const height = parseInt(formData.get("height") as string || "0", 10);
    const sceneIndex = parseInt(formData.get("sceneIndex") as string || "0", 10);

    if (!file) return c.json({ error: "No clip file in form data" }, 400);

    // Store the clip on local disk (primary)
    const clipsDir = join(
      config.artifactStorePath,
      "channels",
      run.channel_id,
      "runs",
      runId,
      "clips",
    );
    await mkdir(clipsDir, { recursive: true });
    const clipPath = join(clipsDir, filename);
    await Bun.write(clipPath, file);

    // Fire-and-forget R2 backup (non-blocking)
    const clipKey = storageKey("channels", run.channel_id, "runs", runId, "clips", filename);
    backupToR2(clipPath, clipKey, "video/mp4");

    return c.json({
      runId,
      filename,
      clipPath,
      durationSec,
      width,
      height,
      sizeBytes: file.size,
      sceneIndex,
    }, 201);
  });

  // GET /api/runs/:runId/video-file — stream the stored MP4 (supports range)
  // Reads from local disk first, falls back to R2 if local file is missing.
  app.get("/api/runs/:runId/video-file", async (c) => {
    const runId = c.req.param("runId");
    const db = getDb();
    const asset = await db
      .prepare(`
        SELECT * FROM assets WHERE run_id = ? AND type = 'video'
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(runId) as AssetRow | null;
    if (!asset) {
      return c.json({ error: "Video not found for this run" }, 404);
    }

    // Try local filesystem first (fast)
    if (existsSync(asset.file_path)) {
      const data = await readFile(asset.file_path);
      const range = c.req.header("range");
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match && match[1]) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : data.byteLength - 1;
          const chunk = data.subarray(start, end + 1);
          return new Response(chunk as BodyInit, {
            status: 206,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Range": `bytes ${start}-${end}/${data.byteLength}`,
              "Content-Length": String(chunk.byteLength),
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
      return new Response(data as BodyInit, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(data.byteLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Fallback: try R2 if local file is missing
    const key = pathToKey(asset.file_path, config);
    const exists = await storage.exists(key);
    if (!exists) {
      return c.json({ error: "Video not found for this run" }, 404);
    }

    const data = await storage.get(key);
    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(data.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  // GET /api/runs/:runId/video-download — download the stored MP4
  // Reads from local disk first, falls back to R2 if local file is missing.
  app.get("/api/runs/:runId/video-download", async (c) => {
    const runId = c.req.param("runId");
    const db = getDb();
    const asset = await db
      .prepare(`
        SELECT * FROM assets WHERE run_id = ? AND type = 'video'
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(runId) as AssetRow | null;
    if (!asset) {
      return c.json({ error: "Video not found for this run" }, 404);
    }

    // Try local filesystem first (fast)
    if (existsSync(asset.file_path)) {
      const data = await readFile(asset.file_path);
      return new Response(data as BodyInit, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="video-${runId.slice(0, 8)}.mp4"`,
        },
      });
    }

    // Fallback: try R2 if local file is missing
    const key = pathToKey(asset.file_path, config);
    const exists = await storage.exists(key);
    if (!exists) {
      return c.json({ error: "Video not found for this run" }, 404);
    }

    const data = await storage.get(key);
    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="video-${runId.slice(0, 8)}.mp4"`,
      },
    });
  });

  // GET /api/assets/:assetId/file — serve an asset file by its ID.
  // Reads from local disk first, falls back to R2 if local file is missing.
  app.get("/api/assets/:assetId/file", async (c) => {
    const assetId = c.req.param("assetId");
    const db = getDb();
    const asset = await db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as AssetRow | null;

    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    // Try local filesystem first (fast)
    if (existsSync(asset.file_path)) {
      const data = await readFile(asset.file_path);
      return new Response(data as BodyInit, {
        headers: {
          "Content-Type": asset.mime_type || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Fallback: try R2 if local file is missing
    const key = pathToKey(asset.file_path, config);
    const exists = await storage.exists(key);
    if (!exists) {
      return c.json({ error: "Asset file not found" }, 404);
    }

    const data = await storage.get(key);
    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": asset.mime_type || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
}
