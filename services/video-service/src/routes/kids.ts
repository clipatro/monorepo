/**
 * POST /render-kids — render a kids story video using Remotion CLI.
 *
 * The kids template uses Remotion (not FFmpeg) to render videos from
 * the @automation/remotion-templates kids component catalog. Unlike the
 * documentary render path, this endpoint generates the Remotion composition
 * (render.tsx) from the export bundle's manifest + scene data, then renders.
 *
 * Flow:
 * 1. Resolve the export directory (download from gateway or use explicit path)
 * 2. Read manifest.json + scene-timeline.csv for scene data + timings
 * 3. Generate render.tsx composition using kids components
 * 4. Copy images + voiceover to public/ directory
 * 5. Mix voiceover with background music (if background audio URL provided)
 * 6. Run `npx remotion render` to produce the MP4
 * 7. Upload the result back to the api-gateway (or return file path)
 */

import type { Hono, AppConfig } from "@automation/server";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rm, access, copyFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

import { renderKidsSchema } from "../schemas";

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

// === Composition generation ===

interface SceneTiming {
  scene: number;
  imageStartSec: string;
  imageEndSec: string;
  imageDurationSec: string;
  narrationStartSec: string;
  narrationEndSec: string;
}

interface SceneCsvRow {
  order: number;
  sceneId: string;
  narrationStartMs: number;
  narrationEndMs: number;
  narrationText: string;
  imageFile: string;
  subtitlePosition: string | null;
  emotion: string;
}

function parseTimelineCsv(csvContent: string): SceneCsvRow[] {
  const lines = csvContent.trim().split("\n");
  const header = lines[0]!.split(",");
  const rows: SceneCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Handle CSV with quoted fields (narration text may contain commas)
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    parts.push(current);
    rows.push({
      order: parseInt(parts[0] ?? "0", 10),
      sceneId: parts[1] ?? "",
      narrationStartMs: parseInt(parts[2] ?? "0", 10),
      narrationEndMs: parseInt(parts[3] ?? "0", 10),
      narrationText: parts[12] ?? "",
      imageFile: parts[11] ?? "",
      subtitlePosition: parts[13] || null,
      emotion: parts[14] ?? "",
    });
  }
  return rows;
}

interface TimedKidScene {
  sceneId: string;
  componentSlug: string;
  data: Record<string, unknown>;
  imageUrl?: string;
  imageTreatment?: string;
  startFrame: number;
  durationFrames: number;
}

/**
 * Select the kids component for a scene based on its subtitlePosition.
 * The scene planner (for kids templates) includes a `subtitlePosition` field
 * that tells us whether the subtitle should appear at the top or bottom of
 * the frame, based on the scene's visual composition.
 */
function selectComponentForScene(
  index: number,
  lastIndex: number,
  narrationText: string,
  storyTitle: string,
  subtitlePosition: string | null,
  emotion: string,
): { componentSlug: string; data: Record<string, unknown> } {
  const isFirst = index === 0;
  const isLast = index === lastIndex;

  if (isFirst) {
    return {
      componentSlug: "kids-title-card",
      data: {
        title: storyTitle.length > 60 ? storyTitle.slice(0, 57) + "…" : storyTitle,
        subtitle: "",
        hook: "",
        label: "FUN STORY!",
      },
    };
  }
  if (isLast) {
    return {
      componentSlug: "kids-end-card",
      data: {
        cta: "Subscribe for more!",
        channelName: "kidstorytime",
        finalQuestion: "What's your favorite story?",
      },
    };
  }
  if (index === lastIndex - 1) {
    return {
      componentSlug: "kids-ending",
      data: {
        message: narrationText.slice(0, 200),
        encouragement: "What do YOU think?",
        label: "REMEMBER!",
      },
    };
  }
  // Middle scenes: choose top or bottom subtitle scene based on the scene plan
  const subtitlePos = subtitlePosition ?? "bottom";
  if (subtitlePos === "top") {
    return {
      componentSlug: "kids-subtitle-top-scene",
      data: {
        caption: narrationText.slice(0, 200),
        label: emotion.slice(0, 30),
      },
    };
  }
  return {
    componentSlug: "kids-subtitle-bottom-scene",
    data: {
      caption: narrationText.slice(0, 200),
      label: emotion.slice(0, 30),
    },
  };
}

function generateKidsComposition(
  scenes: TimedKidScene[],
  totalFrames: number,
  fps: number,
  width: number,
  height: number,
  audioFile: string,
): string {
  const sceneRenders = scenes
    .map((s) => {
      const dataStr = JSON.stringify(s.data);
      const imageProp = s.imageUrl
        ? `imageUrl={staticFile("${s.imageUrl}")}`
        : "";
      const treatmentProp = s.imageTreatment
        ? `imageTreatment="${s.imageTreatment}"`
        : "";
      return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <KidsSceneRenderer slug="${s.componentSlug}" data={${dataStr}} theme={kidsTheme} ${imageProp} ${treatmentProp} />
      </Sequence>`;
    })
    .join("\n");

  return `import React from "react";
import { Composition, AbsoluteFill, Sequence, Audio, staticFile, registerRoot } from "remotion";
import {
  kidsTheme,
  loadKidsFonts,
  KidsTitleCard,
  KidsImageReveal,
  KidsQuestion,
  KidsFunFact,
  KidsNumberStat,
  KidsTimeline,
  KidsQuote,
  KidsTopList,
  KidsEnding,
  KidsEndCard,
  KidsSubtitleTopScene,
  KidsSubtitleBottomScene,
} from "@automation/remotion-templates";

loadKidsFonts();

const KidsSceneRenderer: React.FC<{
  slug: string;
  data: any;
  theme: any;
  imageUrl?: string;
  imageTreatment?: string;
}> = ({ slug, data, theme, imageUrl, imageTreatment }) => {
  const fullData = imageUrl
    ? { ...data, imageUrl, imageTreatment: imageTreatment ?? data.imageTreatment }
    : data;
  switch (slug) {
    case "kids-title-card": return <KidsTitleCard data={fullData} theme={theme} />;
    case "kids-image-reveal": return <KidsImageReveal data={fullData} theme={theme} />;
    case "kids-subtitle-top-scene": return <KidsSubtitleTopScene data={fullData} theme={theme} />;
    case "kids-subtitle-bottom-scene": return <KidsSubtitleBottomScene data={fullData} theme={theme} />;
    case "kids-ending": return <KidsEnding data={fullData} theme={theme} />;
    case "kids-end-card": return <KidsEndCard data={fullData} theme={theme} />;
    default: return <KidsSubtitleBottomScene data={fullData} theme={theme} />;
  }
};

const KidsVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1033" }}>
${sceneRenders}
      <Audio src={staticFile("${audioFile}")} />
    </AbsoluteFill>
  );
};

const RemotionVideo: React.FC = () => {
  return (
    <Composition
      id="KidsVideo"
      component={KidsVideo}
      durationInFrames={${totalFrames}}
      fps={${fps}}
      width={${width}}
      height={${height}}
    />
  );
};

registerRoot(RemotionVideo);
`;
}

export function registerKidsRoutes(app: Hono, _config: AppConfig): void {
  app.post(
    "/render-kids",
    zValidator("json", renderKidsSchema),
    async (c) => {
      const {
        runId,
        apiGatewayUrl,
        exportDir: explicitDir,
        templateConfig,
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
        // Unique dir per attempt — workflow retries can overlap, and a
        // shared path would let a new attempt wipe an in-flight render.
        const tmpBase = join(tmpdir(), `clipatro-kids-${runId}-${randomUUID().slice(0, 8)}`);
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

        // Symlink node_modules so render.tsx can resolve @automation/remotion-templates
        const nodeModulesLink = join(tmpBase, "node_modules");
        try {
          await symlink("/app/node_modules", nodeModulesLink);
        } catch { /* may already exist */ }
      } else {
        return c.json({ error: "Either apiGatewayUrl or exportDir must be provided" }, 400);
      }

      if (!existsSync(exportDir)) {
        return c.json({ error: `Export directory not found: ${exportDir}` }, 404);
      }

      // === 1. Read manifest + scene data ===
      const manifestPath = join(exportDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        return c.json({ error: "manifest.json not found in export directory" }, 404);
      }
      const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
        storyTitle?: string;
        scenes?: {
          count?: number;
          images?: Array<{ order: number; file: string }>;
          imageTimeline?: SceneTiming[];
        };
        audio?: { durationMs?: number };
      };

      const storyTitle = manifest.storyTitle ?? "Kids Story";
      const sceneImages = manifest.scenes?.images ?? [];
      const imageTimeline = manifest.scenes?.imageTimeline ?? [];

      // Read timeline CSV for narration text
      const csvPath = join(exportDir, "scene-timeline.csv");
      let sceneRows: SceneCsvRow[] = [];
      if (existsSync(csvPath)) {
        const csvContent = await readFile(csvPath, "utf-8");
        sceneRows = parseTimelineCsv(csvContent);
      }

      // === 2. Generate the Remotion composition ===
      const fps = (templateConfig as any)?.render?.fps ?? 30;
      const width = (templateConfig as any)?.layout?.width ?? 720;
      const height = (templateConfig as any)?.layout?.height ?? 1280;

      // Build timed scenes
      const timedScenes: TimedKidScene[] = [];
      let currentFrame = 0;
      const titleSeconds = 3;
      const endSeconds = 3;
      const pauseSec = 0.5;

      const sceneCount = sceneImages.length;
      for (let i = 0; i < sceneCount; i++) {
        const img = sceneImages[i]!;
        const timing = imageTimeline[i];
        const csvRow = sceneRows[i];

        const isFirst = i === 0;
        const isLast = i === sceneCount - 1;

        // Duration
        let durationSeconds: number;
        if (isFirst) {
          const narrationDur = timing ? parseFloat(timing.imageDurationSec) : 0;
          durationSeconds = titleSeconds + narrationDur;
        } else if (isLast) {
          durationSeconds = endSeconds;
        } else {
          const narrationDur = timing ? parseFloat(timing.imageDurationSec) : 5;
          durationSeconds = narrationDur + pauseSec;
        }

        const durationFrames = Math.max(1, Math.round(durationSeconds * fps));
        const startFrame = currentFrame;

        // Component selection — use subtitlePosition and emotion from the scene plan
        const narrationText = csvRow?.narrationText ?? "";
        const subtitlePosition = csvRow?.subtitlePosition ?? null;
        const emotion = csvRow?.emotion ?? "";
        const { componentSlug, data } = selectComponentForScene(
          i,
          sceneCount - 1,
          narrationText,
          storyTitle,
          subtitlePosition,
          emotion,
        );

        timedScenes.push({
          sceneId: csvRow?.sceneId ?? `scene-${i}`,
          componentSlug,
          data,
          imageUrl: `images/${img.file}`,
          imageTreatment: "bright",
          startFrame,
          durationFrames,
        });

        currentFrame += durationFrames;
      }

      const totalFrames = currentFrame;

      // === 3. Set up the public directory with assets ===
      const publicDir = join(exportDir, "public");
      await mkdir(publicDir, { recursive: true });
      const imagesDir = join(publicDir, "images");
      await mkdir(imagesDir, { recursive: true });

      // Copy scene images to public/images/
      for (const img of sceneImages) {
        const srcPath = join(exportDir, img.file);
        const destPath = join(imagesDir, img.file);
        if (existsSync(srcPath)) {
          await copyFile(srcPath, destPath);
        }
      }

      // === 4. Mix voiceover with background music ===
      let audioFile = "mixed-audio.wav";
      const voiceoverPath = join(exportDir, "voiceover.wav");

      if (hasVoiceover && existsSync(voiceoverPath)) {
        // Copy voiceover to public/
        const voiceoverDest = join(publicDir, "voiceover.wav");
        await copyFile(voiceoverPath, voiceoverDest);

        if (backgroundAudioUrl) {
          // Download background audio and mix with voiceover
          ctx_log(c, `Downloading background audio from ${backgroundAudioUrl}`);
          try {
            const bgRes = await fetch(backgroundAudioUrl);
            if (bgRes.ok) {
              const bgBuffer = await bgRes.arrayBuffer();
              const bgPath = join(publicDir, "background.mp3");
              await writeFile(bgPath, Buffer.from(bgBuffer));
              ctx_log(c, `Background audio downloaded (${Math.round(bgBuffer.byteLength / 1024)} KB)`);

              // Mix voiceover + background music (ducked to 10%)
              const mixedPath = join(publicDir, "mixed-audio.wav");
              const narrationDur = manifest.audio?.durationMs
                ? manifest.audio.durationMs / 1000
                : totalFrames / fps;
              const fadeOutStart = Math.max(0, narrationDur - 2).toFixed(1);
              const musicLevel = 0.10;

              await execAsync(
                `ffmpeg -y -i "${voiceoverDest}" -stream_loop -1 -i "${bgPath}" ` +
                `-filter_complex "` +
                `[1:a]volume='${musicLevel}*min(1,max(0,(${fadeOutStart}-t)/2))':eval=frame[bg];` +
                `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=1.6[out]" ` +
                `-map "[out]" -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
                { timeout: 120000 },
              );
              ctx_log(c, `Mixed audio created: ${mixedPath}`);
            } else {
              ctx_log(c, `WARNING: Failed to download background audio: ${bgRes.status} — using voiceover only`);
              audioFile = "voiceover.wav";
            }
          } catch (bgErr) {
            ctx_log(c, `WARNING: Background audio mix failed: ${bgErr instanceof Error ? bgErr.message : String(bgErr)} — using voiceover only`);
            audioFile = "voiceover.wav";
          }
        } else {
          // No background audio — use voiceover directly
          audioFile = "voiceover.wav";
        }
      } else {
        ctx_log(c, "WARNING: No voiceover found — rendering video without audio");
        audioFile = "";
      }

      // === 5. Generate render.tsx ===
      const renderEntryPath = join(exportDir, "render.tsx");
      const compositionCode = generateKidsComposition(
        timedScenes,
        totalFrames,
        fps,
        width,
        height,
        audioFile,
      );
      await writeFile(renderEntryPath, compositionCode, "utf-8");
      ctx_log(c, `Generated render.tsx with ${timedScenes.length} scenes, ${totalFrames} frames`);

      // === 6. Render with Remotion CLI ===
      const outputPath = join(exportDir, "..", "kids-render.mp4");
      ctx_log(c, `Rendering with Remotion CLI (composition: KidsVideo)...`);

      const audioArg = audioFile ? "" : "--muted";
      const cmd = `bunx remotion render "${renderEntryPath}" "KidsVideo" "${outputPath}" --public-dir="${publicDir}" --log=verbose ${audioArg}`.trim();

      try {
        const { stdout, stderr } = await execAsync(cmd, {
          maxBuffer: 100 * 1024 * 1024,
          timeout: 600000, // 10 minutes max
        });
        if (stderr && !stderr.includes("warn")) {
          ctx_log(c, `Remotion stderr (first 500 chars): ${stderr.slice(0, 500)}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[video-service] Remotion render failed:`, errMsg.slice(0, 2000));
        if (err instanceof Error && err.stack) console.error(err.stack.slice(0, 1000));
        return c.json({ error: "Remotion render failed", details: errMsg.slice(0, 2000) }, 500);
      }

      if (!existsSync(outputPath)) {
        return c.json({ error: "Remotion render completed but output file not found" }, 500);
      }

      // === 7. Probe the output ===
      let durationSec = 0;
      let sizeBytes = 0;
      let videoWidth = 0;
      let videoHeight = 0;
      let videoFps = 30;
      try {
        const { stdout: probeOut } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
        );
        const probe = JSON.parse(probeOut);
        durationSec = parseFloat(probe.format?.duration ?? "0");
        sizeBytes = parseInt(probe.format?.size ?? "0");
        const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
        if (videoStream) {
          videoWidth = parseInt(videoStream.width ?? "0");
          videoHeight = parseInt(videoStream.height ?? "0");
          const fpsParts = (videoStream.r_frame_rate ?? "30/1").split("/");
          videoFps = Math.round(parseInt(fpsParts[0] ?? "30") / parseInt(fpsParts[1] ?? "1"));
        }
      } catch {
        // non-critical
      }

      ctx_log(c, `Render complete: ${videoWidth}x${videoHeight}, ${durationSec.toFixed(2)}s, ${videoFps} fps, ${Math.round(sizeBytes / 1024 / 1024)} MB`);

      // === 8. Return or upload the result ===
      if (useGatewayUpload && apiGatewayUrl) {
        ctx_log(c, `Uploading rendered MP4 (${sizeBytes} bytes) to api-gateway`);
        const mp4Buffer = await readFile(outputPath);
        const formData = new FormData();
        formData.append("video", new Blob([mp4Buffer], { type: "video/mp4" }), "kids-render.mp4");
        formData.append("durationSec", String(durationSec));
        formData.append("fps", String(videoFps));
        formData.append("sizeBytes", String(sizeBytes));
        formData.append("renderer", "remotion");
        formData.append("sceneCount", String(timedScenes.length));

        const uploadRes = await fetch(`${apiGatewayUrl}/api/runs/${runId}/video-upload`, { method: "POST", body: formData });
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
        return c.json({
          runId,
          assetId: crypto.randomUUID(),
          filePath: outputPath,
          durationSec,
          fps: videoFps,
          sizeBytes,
          sizeMB: Math.round(sizeBytes / 1024 / 1024),
          width: videoWidth,
          height: videoHeight,
          renderer: "remotion",
          hasVoiceover,
          sceneCount: timedScenes.length,
        }, 201);
      }
    },
  );
}
