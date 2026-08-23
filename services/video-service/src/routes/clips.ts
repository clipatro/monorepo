/**
 * D017: Clip generation + clip-based render routes.
 *
 * - POST /generate-clip — generate a single AI video clip for a scene
 * - POST /render-clips  — render a final video from pre-generated clips
 *
 * These are the clip-based equivalents of the image-based /generate route.
 * Used by the clip_prompt_compilation + clip_generation workflow steps.
 */

import type { Hono, AppConfig } from "@automation/server";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";
import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

import { generateClipSchema, renderClipsSchema } from "../schemas";
import { generateVideoClip } from "../fal-video";
import { renderClipsVideo, templateToRenderParams, type RenderParams } from "../ffmpeg-renderer";
import { normalizeVoiceover, probeDuration } from "../audio";
import type { TemplateConfig } from "@automation/contracts";
import { isDryRun } from "@automation/contracts";

const execAsync = promisify(exec);

function ctx_log(_c: any, msg: string): void {
  console.log(`[video-service] ${msg}`);
}

export function registerClipRoutes(app: Hono, _config: AppConfig): void {
  // POST /generate-clip — generate a single AI video clip
  app.post("/generate-clip", zValidator("json", generateClipSchema), async (c) => {
    const data = c.req.valid("json");
    const apiKey = process.env.FAL_KEY ?? "";
    if (!apiKey && !isDryRun()) {
      return c.json({ error: "FAL_KEY is not set and dry-run mode is not enabled" }, 500);
    }

    // The video service runs on the HOST, not in Docker. The workflow handler
    // (in Docker) sends a Docker-internal outputDir like
    // "/app/data/artifacts/channels/.../clips" — that path is not writable
    // here. Instead, we write the clip to a local temp directory, then upload
    // it to the api-gateway's /api/runs/:runId/clip-upload endpoint so it
    // lands in the Docker volume where the workflow service can find it.
    const apiGatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
    const localClipDir = join(tmpdir(), `clipatro-clips-${data.runId ?? "tmp"}`);
    await mkdir(localClipDir, { recursive: true });

    try {
      const result = await generateVideoClip({
        prompt: data.prompt,
        outputDir: localClipDir,
        outputFilename: data.outputFilename,
        apiKey,
        model: data.model,
        aspectRatio: data.aspectRatio,
        durationSec: data.durationSec,
        runId: data.runId,
        stepId: data.stepId,
        sceneIndex: data.sceneIndex,
        imageUrl: data.imageUrl,
      });

      // Upload the clip to the api-gateway so it lands in the Docker volume
      if (data.runId) {
        try {
          const clipBuffer = await readFile(result.clipPath);
          const formData = new FormData();
          formData.append("clip", new Blob([clipBuffer], { type: "video/mp4" }), data.outputFilename);
          formData.append("filename", data.outputFilename);
          formData.append("durationSec", String(result.durationSec));
          formData.append("width", String(result.width));
          formData.append("height", String(result.height));
          formData.append("sceneIndex", String(data.sceneIndex ?? 0));

          const uploadRes = await fetch(`${apiGatewayUrl}/api/runs/${data.runId}/clip-upload`, {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) {
            const errText = await uploadRes.text().catch(() => uploadRes.statusText);
            ctx_log(c, `WARNING: clip-upload failed (${uploadRes.status} ${errText}) — clip is at ${result.clipPath} but not in Docker volume`);
          } else {
            ctx_log(c, `Clip uploaded to api-gateway: ${data.outputFilename}`);
            // Clean up the local temp file
            try { await rm(result.clipPath, { force: true }); } catch { /* non-critical */ }
          }
        } catch (uploadErr) {
          ctx_log(c, `WARNING: clip-upload error: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)} — clip is at ${result.clipPath} but not in Docker volume`);
        }
      }

      return c.json({
        clipPath: result.clipPath,
        durationSec: result.durationSec,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
        costUsd: result.costUsd,
        model: result.model,
        remoteRequestId: result.remoteRequestId,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Clip generation failed", details: msg }, 500);
    }
  });

  // POST /render-clips — render a final video from pre-generated clips
  app.post("/render-clips", zValidator("json", renderClipsSchema), async (c) => {
    const { runId, apiGatewayUrl, exportDir: explicitDir, templateConfig: tmplConfigRaw, hasVoiceover } = c.req.valid("json");

    // === Resolve the export directory ===
    let exportDir: string;
    let useGatewayUpload = false;

    if (explicitDir) {
      exportDir = explicitDir;
    } else if (apiGatewayUrl) {
      useGatewayUpload = true;
      const tmpBase = join(tmpdir(), `clipatro-clips-${runId}`);
      await rm(tmpBase, { recursive: true, force: true });
      await mkdir(tmpBase, { recursive: true });

      const zipPath = join(tmpBase, "export.zip");
      ctx_log(c, `Downloading export bundle from ${apiGatewayUrl}/api/runs/${runId}/export-bundle`);
      const res = await fetch(`${apiGatewayUrl}/api/runs/${runId}/export-bundle`);
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return c.json({ error: `Failed to download export bundle: ${res.status} ${errText}` }, 502);
      }
      const zipBuffer = await res.arrayBuffer();
      await writeFile(zipPath, Buffer.from(zipBuffer));

      exportDir = join(tmpBase, "export");
      await mkdir(exportDir, { recursive: true });
      try {
        await execAsync(`unzip -o "${zipPath}" -d "${exportDir}"`, { timeout: 30000 });
      } catch (err) {
        return c.json({ error: "Failed to extract export bundle", details: String(err) }, 500);
      }
      ctx_log(c, `Export bundle extracted to ${exportDir}`);
    } else {
      return c.json({ error: "Either apiGatewayUrl or exportDir must be provided" }, 400);
    }

    if (!existsSync(exportDir)) {
      return c.json({ error: `Export directory not found: ${exportDir}` }, 404);
    }

    // === Read manifest for clip list ===
    const manifestPath = join(exportDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      return c.json({ error: "manifest.json not found in export directory" }, 404);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
      audio?: { durationSec: string };
      scenes?: {
        count: number;
        clips?: Array<{ order: number; file: string; durationSec?: string }>;
        clipTimeline?: Array<{ scene: number; clipFile: string; durationSec: string }>;
      };
      storyTitle?: string;
    };

    const totalDuration = manifest.audio?.durationSec
      ? parseFloat(manifest.audio.durationSec)
      : 0;

    // Build clip entries from clipTimeline or clips array
    const clipTimeline = manifest.scenes?.clipTimeline;
    const clipsArray = manifest.scenes?.clips;
    const clips: Array<{ index: number; clipFile: string; durationSec: number }> = [];

    if (clipTimeline && clipTimeline.length > 0) {
      for (const t of clipTimeline) {
        clips.push({
          index: t.scene - 1,
          clipFile: t.clipFile,
          durationSec: parseFloat(t.durationSec),
        });
      }
    } else if (clipsArray && clipsArray.length > 0) {
      for (const c of clipsArray) {
        clips.push({
          index: c.order - 1,
          clipFile: c.file,
          durationSec: c.durationSec ? parseFloat(c.durationSec) : 5,
        });
      }
    } else {
      return c.json({ error: "No clips found in manifest" }, 400);
    }

    // === Template config → render params ===
    let renderParams: RenderParams;
    if (tmplConfigRaw) {
      renderParams = templateToRenderParams(tmplConfigRaw as TemplateConfig);
    } else {
      // Default to ai-video-clips template params
      renderParams = {
        fps: 30,
        width: 1080,
        height: 1920,
        topHeight: 1920,
        xfadeDur: 0.5,
        fadeInDur: 1.0,
        fadeOutDur: 1.0,
        kenBurnsVariants: 0,
      };
    }

    // === Working directory ===
    const workDir = join(exportDir, "..", "ffmpeg-work");
    const outputPath = join(exportDir, "..", "render.mp4");
    await mkdir(workDir, { recursive: true });

    // === Normalize voiceover (if present) ===
    let voiceoverPath: string | null = null;
    if (hasVoiceover) {
      const voiceoverSrc = join(exportDir, "voiceover.wav");
      if (existsSync(voiceoverSrc)) {
        voiceoverPath = join(workDir, "voiceover-normalized.wav");
        await normalizeVoiceover(voiceoverSrc, voiceoverPath);
      }
    }

    // === Render ===
    ctx_log(c, `Rendering clips video (${clips.length} clips, ${totalDuration}s)...`);

    const result = await renderClipsVideo({
      exportDir,
      voiceoverPath,
      totalDuration: totalDuration || clips.reduce((s, c) => s + c.durationSec, 0),
      clips,
      workDir,
      outputPath,
      templateParams: renderParams,
      log: (msg) => ctx_log(c, msg),
    });

    if (!result.success) {
      return c.json({
        error: "FFmpeg clip render failed",
        details: result.error,
        renderLog: result.log,
        gpuUsed: result.gpuUsed,
      }, 500);
    }

    ctx_log(c, `Render complete: ${result.width}x${result.height}, ${result.durationSec.toFixed(2)}s, ${result.fps} fps`);

    // === Return or upload ===
    if (useGatewayUpload && apiGatewayUrl) {
      const mp4Buffer = await readFile(result.outputPath);
      const formData = new FormData();
      formData.append("video", new Blob([mp4Buffer], { type: "video/mp4" }), "render.mp4");
      formData.append("durationSec", String(result.durationSec));
      formData.append("fps", result.fps);
      formData.append("sizeBytes", String(result.sizeBytes));
      formData.append("sceneCount", String(clips.length));
      formData.append("storyTitle", manifest.storyTitle ?? "");

      const uploadRes = await fetch(`${apiGatewayUrl}/api/runs/${runId}/video-upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => uploadRes.statusText);
        return c.json({ error: `Failed to upload video: ${uploadRes.status} ${errText}` }, 502);
      }

      const uploadResult = (await uploadRes.json()) as Record<string, unknown>;
      const tmpBase = join(exportDir, "..", "..");
      try { await rm(tmpBase, { recursive: true, force: true }); } catch { /* non-critical */ }

      return c.json(uploadResult, 201);
    } else {
      return c.json({
        runId,
        assetId: crypto.randomUUID(),
        filePath: result.outputPath,
        durationSec: result.durationSec,
        fps: result.fps,
        sizeBytes: result.sizeBytes,
        sizeMB: Math.round(result.sizeBytes / 1024 / 1024),
        width: result.width,
        height: result.height,
        codec: result.codec,
        gpuUsed: result.gpuUsed,
        sceneCount: clips.length,
        storyTitle: manifest.storyTitle,
      }, 201);
    }
  });
}
