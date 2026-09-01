/**
 * POST /render-documentary — render a documentary video using Remotion CLI.
 *
 * The documentary template uses Remotion (not FFmpeg) to render videos from
 * the @automation/remotion-templates documentary component catalog. The export
 * directory must contain a pre-generated `render.tsx` composition entry file
 * plus a `public/` folder with audio and images.
 *
 * Flow:
 * 1. Resolve the export directory (download from gateway or use explicit path)
 * 2. Verify render.tsx + public/ assets exist
 * 3. Run `bunx remotion render` to produce the MP4
 * 4. Upload the result back to the api-gateway (or return file path)
 */

import type { Hono, AppConfig } from "@automation/server";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";
import { readFile, writeFile, mkdir, rm, access, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

import { renderDocumentarySchema } from "../schemas";

const execAsync = promisify(exec);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function ctx_log(_c: any, msg: string): void {
  console.log(`[video-service] ${msg}`);
}

export function registerDocumentaryRoutes(app: Hono, _config: AppConfig): void {
  app.post(
    "/render-documentary",
    zValidator("json", renderDocumentarySchema),
    async (c) => {
      const {
        runId,
        apiGatewayUrl,
        exportDir: explicitDir,
        compositionId,
        hasVoiceover,
        backgroundAudioUrl,
      } = c.req.valid("json");

      // === Resolve the export directory ===
      let exportDir: string;
      let useGatewayUpload = false;

      if (explicitDir) {
        exportDir = explicitDir;
      } else if (apiGatewayUrl) {
        useGatewayUpload = true;
        const tmpBase = join(tmpdir(), `clipatro-doc-${runId}`);
        await rm(tmpBase, { recursive: true, force: true });
        await mkdir(tmpBase, { recursive: true });

        const zipPath = join(tmpBase, "export.zip");
        ctx_log(
          c,
          `Downloading export bundle from ${apiGatewayUrl}/api/runs/${runId}/export-bundle`,
        );
        const res = await fetch(
          `${apiGatewayUrl}/api/runs/${runId}/export-bundle`,
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          return c.json(
            { error: `Failed to download export bundle: ${res.status} ${errText}` },
            502,
          );
        }
        const zipBuffer = await res.arrayBuffer();
        await writeFile(zipPath, Buffer.from(zipBuffer));

        exportDir = join(tmpBase, "export");
        await mkdir(exportDir, { recursive: true });
        try {
          await execAsync(`unzip -o "${zipPath}" -d "${exportDir}"`, {
            timeout: 30000,
          });
        } catch (err) {
          return c.json(
            { error: "Failed to extract export bundle", details: String(err) },
            500,
          );
        }
        ctx_log(c, `Export bundle extracted to ${exportDir}`);
      } else {
        return c.json(
          { error: "Either apiGatewayUrl or exportDir must be provided" },
          400,
        );
      }

      if (!existsSync(exportDir)) {
        return c.json({ error: `Export directory not found: ${exportDir}` }, 404);
      }

      // === 1. Verify Remotion composition files ===
      const renderEntryPath = join(exportDir, "render.tsx");
      if (!existsSync(renderEntryPath)) {
        return c.json(
          { error: "render.tsx not found in export directory — documentary template requires a pre-generated Remotion composition" },
          404,
        );
      }

      const publicDir = join(exportDir, "public");
      if (!existsSync(publicDir)) {
        return c.json(
          { error: "public/ directory not found — documentary template requires audio and image assets in public/" },
          404,
        );
      }

      // === 1b. Symlink node_modules from /app so Remotion can resolve
      // @automation/remotion-templates and other workspace packages.
      // The render.tsx imports from workspace packages that only exist in
      // /app/node_modules — without this symlink, Remotion's bundler can't
      // resolve them from the temp export directory.
      const nodeModulesLink = join(exportDir, "node_modules");
      if (!existsSync(nodeModulesLink)) {
        try {
          await symlink("/app/node_modules", nodeModulesLink, "dir");
        } catch {
          // non-critical — if symlink fails, Remotion will fail with a
          // module resolution error that we'll surface in the response
        }
      }

      // === 2. Download background audio if provided ===
      if (backgroundAudioUrl) {
        ctx_log(c, `Downloading background audio from ${backgroundAudioUrl}`);
        try {
          const bgRes = await fetch(backgroundAudioUrl);
          if (bgRes.ok) {
            const bgBuffer = await bgRes.arrayBuffer();
            const contentType = bgRes.headers.get("Content-Type") ?? "audio/mpeg";
            const ext = contentType.includes("wav")
              ? "wav"
              : contentType.includes("ogg")
                ? "ogg"
                : "mp3";
            const bgPath = join(publicDir, `background.${ext}`);
            await writeFile(bgPath, Buffer.from(bgBuffer));
            ctx_log(
              c,
              `Background audio downloaded (${Math.round(bgBuffer.byteLength / 1024)} KB)`,
            );
          } else {
            ctx_log(
              c,
              `WARNING: Failed to download background audio: ${bgRes.status} — continuing without it`,
            );
          }
        } catch (bgErr) {
          ctx_log(
            c,
            `WARNING: Background audio download failed: ${bgErr instanceof Error ? bgErr.message : String(bgErr)} — continuing without it`,
          );
        }
      }

      // === 3. Render with Remotion CLI ===
      const outputPath = join(exportDir, "..", "documentary-render.mp4");
      ctx_log(
        c,
        `Rendering with Remotion CLI (composition: ${compositionId})...`,
      );

      const cmd = `bunx remotion render "${renderEntryPath}" "${compositionId}" "${outputPath}" --public-dir="${publicDir}" --log=verbose`;

      try {
        const { stdout, stderr } = await execAsync(cmd, {
          maxBuffer: 100 * 1024 * 1024,
          timeout: 600000, // 10 minutes max
        });
        if (stdout) {
          ctx_log(c, `Remotion stdout (last 300 chars): ${stdout.slice(-300)}`);
        }
        if (stderr && !stderr.toLowerCase().includes("warn")) {
          ctx_log(c, `Remotion stderr (first 500 chars): ${stderr.slice(0, 500)}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        ctx_log(c, `Remotion render FAILED: ${errMsg.slice(0, 500)}`);
        return c.json(
          {
            error: "Remotion render failed",
            details: errMsg.slice(0, 2000),
          },
          500,
        );
      }

      if (!existsSync(outputPath)) {
        return c.json(
          { error: "Remotion render completed but output file not found" },
          500,
        );
      }

      // === 4. Probe the output ===
      let durationSec = 0;
      let sizeBytes = 0;
      let width = 0;
      let height = 0;
      let fps = 30;
      try {
        const { stdout: probeOut } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
        );
        const probe = JSON.parse(probeOut);
        durationSec = parseFloat(probe.format?.duration ?? "0");
        sizeBytes = parseInt(probe.format?.size ?? "0");
        const videoStream = probe.streams?.find(
          (s: any) => s.codec_type === "video",
        );
        if (videoStream) {
          width = parseInt(videoStream.width ?? "0");
          height = parseInt(videoStream.height ?? "0");
          const fpsParts = (videoStream.r_frame_rate ?? "30/1").split("/");
          fps = Math.round(parseInt(fpsParts[0] ?? "30") / parseInt(fpsParts[1] ?? "1"));
        }
      } catch {
        // non-critical — ffprobe may not be available
      }

      ctx_log(
        c,
        `Render complete: ${width}x${height}, ${durationSec.toFixed(2)}s, ${fps} fps, ${Math.round(sizeBytes / 1024 / 1024)} MB`,
      );

      // === 5. Return or upload the result ===
      if (useGatewayUpload && apiGatewayUrl) {
        ctx_log(
          c,
          `Uploading rendered MP4 (${sizeBytes} bytes) to api-gateway`,
        );
        const mp4Buffer = await readFile(outputPath);
        const formData = new FormData();
        formData.append(
          "video",
          new Blob([mp4Buffer], { type: "video/mp4" }),
          "documentary-render.mp4",
        );
        formData.append("durationSec", String(durationSec));
        formData.append("fps", String(fps));
        formData.append("sizeBytes", String(sizeBytes));
        formData.append("renderer", "remotion");
        formData.append("sceneCount", "0"); // scene count tracked in composition config

        const uploadRes = await fetch(
          `${apiGatewayUrl}/api/runs/${runId}/video-upload`,
          { method: "POST", body: formData },
        );
        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => uploadRes.statusText);
          return c.json(
            { error: `Failed to upload video: ${uploadRes.status} ${errText}` },
            502,
          );
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
        return c.json(
          {
            runId,
            assetId: crypto.randomUUID(),
            filePath: outputPath,
            durationSec,
            fps,
            sizeBytes,
            sizeMB: Math.round(sizeBytes / 1024 / 1024),
            width,
            height,
            renderer: "remotion",
            hasVoiceover,
          },
          201,
        );
      }
    },
  );
}
