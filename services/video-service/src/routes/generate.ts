/**
 * POST /generate — render a vertical video from an export package.
 *
 * The video-service runs on the HOST (for GPU access) and has no direct access
 * to the Docker named volume. Instead, it downloads the export bundle from the
 * api-gateway, renders in a temp directory, and uploads the result back.
 *
 * Flow:
 * 1. Download export ZIP from `${apiGatewayUrl}/api/runs/:runId/export-bundle`
 * 2. Extract to a temp directory
 * 3. Read manifest.json + build scene entries
 * 4. Normalize the voiceover (EBU R128 loudnorm)
 * 5. Render with FFmpeg (GPU-accelerated via NVENC + CUDA when available)
 * 6. Upload the MP4 to `${apiGatewayUrl}/api/runs/:runId/video-upload`
 *
 * If `exportDir` is provided explicitly (host filesystem path), steps 1 and 6
 * are skipped — the service reads from the directory directly and returns the
 * file path. This is the legacy mode for when the video-service has direct
 * filesystem access.
 */

import type { Hono, AppConfig } from "@automation/server";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";
import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

import { generateSchema } from "../schemas";
import { type Manifest, type SceneEntry } from "../types";
import { normalizeVoiceover } from "../audio";
import { renderVideo, type RenderScene } from "../ffmpeg-renderer";

const execAsync = promisify(exec);

async function runCmd(
  cmd: string,
  opts?: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, ...opts });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function registerGenerateRoutes(app: Hono, config: AppConfig): void {
  app.post("/generate", zValidator("json", generateSchema), async (c) => {
    const { runId, apiGatewayUrl, exportDir: explicitDir, fps, quality, backgroundAudioUrl } = c.req.valid("json");

    // === Resolve the export directory ===
    let exportDir: string;
    let useGatewayUpload = false;

    if (explicitDir) {
      // Legacy mode: direct filesystem access
      exportDir = explicitDir;
    } else if (apiGatewayUrl) {
      // Gateway mode: download export bundle from api-gateway
      useGatewayUpload = true;
      const tmpBase = join(tmpdir(), `clipatro-video-${runId}`);
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

      // Extract
      exportDir = join(tmpBase, "export");
      await mkdir(exportDir, { recursive: true });
      try {
        await runCmd(`unzip -o "${zipPath}" -d "${exportDir}"`, { timeout: 30000 });
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

    // === 1. Read manifest ===
    const manifestPath = join(exportDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      return c.json({ error: "manifest.json not found in export directory" }, 404);
    }
    const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const totalDuration = parseFloat(manifest.audio.durationSec);

    // Build scene entries from imageTimeline
    const scenes: SceneEntry[] = manifest.scenes.imageTimeline.map((t, i) => ({
      index: i,
      imageFile: manifest.scenes.images[i]?.file ?? `scene-${String(i + 1).padStart(2, "0")}.jpg`,
      startSec: parseFloat(t.imageStartSec),
      endSec: parseFloat(t.imageEndSec),
      durationSec: parseFloat(t.imageDurationSec),
    }));

    if (scenes.length === 0) {
      return c.json({ error: "No scenes found in manifest" }, 400);
    }

    // === 2. Prepare working directory ===
    const workDir = join(exportDir, "..", "ffmpeg-work");
    const outputPath = join(exportDir, "..", "render.mp4");

    // === 3. Normalize voiceover ===
    const voiceoverSrc = join(exportDir, "voiceover.wav");
    const voiceoverDst = join(workDir, "voiceover-normalized.wav");
    if (!existsSync(voiceoverSrc)) {
      return c.json({ error: "voiceover.wav not found in export directory" }, 404);
    }
    await mkdir(workDir, { recursive: true });
    const audioMetrics = await normalizeVoiceover(voiceoverSrc, voiceoverDst);

    // === 3b. Download background audio if provided ===
    let backgroundAudioPath: string | null = null;
    if (backgroundAudioUrl) {
      ctx_log(c, `Downloading background audio from ${backgroundAudioUrl}`);
      try {
        const bgRes = await fetch(backgroundAudioUrl);
        if (bgRes.ok) {
          const bgBuffer = await bgRes.arrayBuffer();
          const contentType = bgRes.headers.get("Content-Type") ?? "audio/mpeg";
          const ext = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
          backgroundAudioPath = join(workDir, `background.${ext}`);
          await writeFile(backgroundAudioPath, Buffer.from(bgBuffer));
          ctx_log(c, `Background audio downloaded (${Math.round(bgBuffer.byteLength / 1024)} KB)`);
        } else {
          ctx_log(c, `WARNING: Failed to download background audio: ${bgRes.status} — continuing without it`);
        }
      } catch (bgErr) {
        ctx_log(c, `WARNING: Background audio download failed: ${bgErr instanceof Error ? bgErr.message : String(bgErr)} — continuing without it`);
      }
    }

    // === 4. Render with FFmpeg ===
    ctx_log(c, `Rendering with FFmpeg (fps=${fps}, quality=${quality})...`);

    const renderScenes: RenderScene[] = scenes.map((s) => ({
      index: s.index,
      imageFile: s.imageFile,
      startSec: s.startSec,
      endSec: s.endSec,
      durationSec: s.durationSec,
    }));

    const result = await renderVideo({
      exportDir,
      voiceoverPath: voiceoverDst,
      totalDuration,
      scenes: renderScenes,
      gameplayFile: manifest.gameplay?.file,
      backgroundAudioPath,
      workDir,
      outputPath,
      log: (msg) => ctx_log(c, msg),
    });

    if (!result.success) {
      return c.json(
        {
          error: "FFmpeg render failed",
          details: result.error,
          renderLog: result.log,
          gpuUsed: result.gpuUsed,
        },
        500,
      );
    }

    ctx_log(
      c,
      `Render complete: ${result.width}x${result.height}, ${result.durationSec.toFixed(2)}s, ${result.fps} fps, ${result.codec}, ${Math.round(result.sizeBytes / 1024 / 1024)} MB (GPU: ${result.gpuUsed})`,
    );

    // === 5. Return or upload the result ===
    if (useGatewayUpload && apiGatewayUrl) {
      // Upload the MP4 back to the api-gateway
      ctx_log(c, `Uploading rendered MP4 (${result.sizeBytes} bytes) to api-gateway`);
      const mp4Buffer = await readFile(result.outputPath);
      const formData = new FormData();
      formData.append("video", new Blob([mp4Buffer], { type: "video/mp4" }), "render.mp4");
      formData.append("durationSec", String(result.durationSec));
      formData.append("fps", result.fps);
      formData.append("sizeBytes", String(result.sizeBytes));
      formData.append("audioLufs", String(audioMetrics.lufs));
      formData.append("audioTruePeak", String(audioMetrics.truePeak));
      formData.append("sceneCount", String(scenes.length));
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

      // Clean up temp directory
      const tmpBase = join(exportDir, "..", "..");
      try {
        await rm(tmpBase, { recursive: true, force: true });
      } catch {
        /* non-critical */
      }

      return c.json(uploadResult, 201);
    } else {
      // Legacy mode: return file path directly
      return c.json(
        {
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
          audioLufs: audioMetrics.lufs,
          audioTruePeak: audioMetrics.truePeak,
          sceneCount: scenes.length,
          storyTitle: manifest.storyTitle,
        },
        201,
      );
    }
  });
}

// Helper: log via response header (since we don't have ctx.log in routes)
function ctx_log(_c: any, msg: string): void {
  console.log(`[video-service] ${msg}`);
}
